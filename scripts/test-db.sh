#!/usr/bin/env bash
#
# Spin up a throwaway Postgres cluster, apply the migration, and play three
# real brackets through submit_match_score() to prove that results advance
# teams on their own and that the three roles can do exactly what they should.
#
# Needs Postgres server binaries (initdb/pg_ctl) on PATH, or at
# /usr/lib/postgresql/<version>/bin. Must not be run as root -- Postgres
# refuses to start as root.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)

if [ "$(id -u)" = "0" ]; then
  echo "error: Postgres will not run as root. Re-run as a normal user." >&2
  exit 1
fi

if ! command -v initdb >/dev/null 2>&1; then
  for dir in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql*/bin; do
    [ -x "$dir/initdb" ] && export PATH="$dir:$PATH" && break
  done
fi

command -v initdb >/dev/null 2>&1 || {
  echo "error: initdb not found. Install the Postgres server package." >&2
  exit 1
}

PORT=${PGTEST_PORT:-55432}
WORK=$(mktemp -d)
trap 'pg_ctl -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

echo "==> starting Postgres in $WORK"
initdb -D "$WORK/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$WORK/data" \
  -o "-p $PORT -k $WORK -c listen_addresses=''" \
  -l "$WORK/pg.log" start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

echo "==> applying stub + migration"
"${PSQL[@]}" -f supabase/tests/00_stub.sql
for m in supabase/migrations/*.sql; do
  echo "    $m"
  "${PSQL[@]}" -f "$m" 2>&1 | grep -v 'does not exist, skipping' || true
done

echo "==> seeding users and divisions"
"${PSQL[@]}" -f supabase/tests/01_setup.sql > "$WORK/out.txt"

echo "==> generating brackets with the app's own generator"
npx --yes esbuild supabase/tests/emit-fixture.ts --bundle --platform=node --format=cjs \
  --outfile="$WORK/emit.cjs" --log-level=error
node "$WORK/emit.cjs" > "$WORK/02_fixture.sql"
"${PSQL[@]}" -f "$WORK/02_fixture.sql"

echo "==> playing every match through submit_match_score()"
"${PSQL[@]}" -f supabase/tests/03_play.sql >> "$WORK/out.txt" 2>&1
"${PSQL[@]}" -f supabase/tests/04_corrections_and_roles.sql >> "$WORK/out.txt" 2>&1
"${PSQL[@]}" -f supabase/tests/05_set_rules.sql >> "$WORK/out.txt" 2>&1
"${PSQL[@]}" -f supabase/tests/06_fixed_sets.sql >> "$WORK/out.txt" 2>&1

echo
grep -Eo 'TEST [^|]*(PASS|FAIL[^|]*)' "$WORK/out.txt" | sed 's/^/  /'
echo

if grep -q 'FAIL' "$WORK/out.txt"; then
  echo "DATABASE TESTS FAILED" >&2
  cat "$WORK/out.txt" >&2
  exit 1
fi

# Every assertion must actually appear. Without this a suppressed NOTICE or a
# skipped file would look like a clean run. Bump when adding assertions.
EXPECTED=37
COUNT=$(grep -c 'TEST .*PASS' "$WORK/out.txt")
if [ "$COUNT" -ne "$EXPECTED" ]; then
  echo "DATABASE TESTS INCOMPLETE: expected $EXPECTED assertions, saw $COUNT" >&2
  cat "$WORK/out.txt" >&2
  exit 1
fi

echo "All $COUNT database tests passed."
cd "$ROOT"
