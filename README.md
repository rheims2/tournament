# Volleyball Tournament

A mobile web app for running a one-day volleyball tournament: pool play in the
morning, brackets in the afternoon, and scores that advance teams on their own.

- **Multiple divisions**, each with its own bracket format and scoring rules.
- **Pools of four or fewer**, split automatically, with a full round robin inside each.
- **Court and time scheduling** that never puts a team on two courts at once.
- **Pool results seed the bracket** — pool winners take the top seeds, then runners-up.
- **Enter a score and the bracket advances**, including through byes.
- **Three roles**: read only, enter scores, admin.
- **Installs to a phone's home screen** and updates live on every device at once.

Spectators need no account at all — anyone with the link can follow along.

---

## Setup

You need a free Supabase project (Postgres + auth) and about five minutes.

**1. Create the project** at [supabase.com](https://supabase.com).

**2. Run the migration.** Open the SQL editor and paste in the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). This
creates every table, the role rules, and the auto-advancement logic.

**3. Point the app at it.**

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
*Project Settings → API*. (The anon key is meant to be public; row level
security is what protects the data.)

**4. Run it.**

```bash
npm install
npm run dev
```

**5. Sign up.** The **first account created becomes the admin.** Everyone after
that starts as read only until an admin promotes them.

For a real tournament, deploy the built site anywhere static
(`npm run build` → `dist/`) and share the URL.

> Turning off email confirmation in *Authentication → Providers → Email* makes
> handing out scorekeeper accounts on the morning of the tournament much less
> painful.

---

## Running a tournament

### Before the day

1. **Admin → Tournament**: create the tournament with its date and venue.
2. **Admin → Divisions**: add each division. Choose its bracket format and
   whether pool and bracket games are a single set, best of 3, or best of 5.
3. **Manage** a division to add teams. Paste the whole roster at once — one
   team per line.

### The morning

4. **Build pools & games.** Pick the maximum pool size (4 is the default) and
   the app splits the teams into as many pools as needed, snaking down the list
   so the pools come out balanced. Every pool gets a full round robin: 6 games
   for a pool of 4, 3 games for a pool of 3.
5. **Schedule pool play.** Enter your courts (`1, 2, 3`), the first serve time,
   and how long a slot runs. Games are laid out across the courts in order,
   never scheduling a team twice at the same time.
6. **Enter scores** from the Games tab as they come in. Anyone with the
   scorekeeper role can do this from their own phone.

### The afternoon

7. **Generate bracket from pools.** Seeding is cross-pool: every pool winner
   outranks every runner-up, and within a finishing position teams are ordered
   by record, then set ratio, then point ratio. Check the **Seeding** tab of a
   division to see it before you commit.
8. **Schedule the bracket** with an afternoon start time.
9. **Enter scores.** Each result drops the winner into the next match
   automatically. Teams with a bye are already sitting in round two.

If a score was entered wrong, an admin can open the match and **Clear result**.
That resets every later round the result had fed into, so nothing stale is left
behind.

---

## The three roles

| Role | Can do |
|---|---|
| **Read only** | View schedules, pool standings, brackets and live scores. No account needed. |
| **Enter scores** | Everything above, plus posting and correcting results. |
| **Admin** | Everything, including teams, pools, brackets, scheduling and user roles. |

Roles are assigned in **Admin → People & roles**. The last admin cannot demote
themselves, so you can't lock yourself out.

Enforcement is in the database, not the interface. Reads are public; direct
writes to tables are admin-only under row level security; and score entry goes
through a `security definer` function that checks the caller's role. A
scorekeeper can post a score but cannot rename a team or delete a bracket, no
matter what they send.

---

## Bracket formats

Set per division, and changeable until the bracket is generated.

**Single elimination** — one loss and you're out. Byes are handed to the top
seeds when the field isn't a power of two, and those teams start in round two.

**Single elimination + consolation** — as above, plus a back bracket for
first-round losers so nobody's day ends after one afternoon match.

**Double elimination** — winners and losers brackets feeding a grand final.
Teams knocked out of the winners bracket drop into the losers bracket in
reverse order, the usual way of delaying rematches. A field of two collapses to
single elimination, since there is no meaningful losers side.

---

## Scoring rules

Each division carries its own: points to win a set (25), points in the deciding
set (15), the win-by margin (2), and an optional hard cap.

A set counts only once it has actually been won — the leader has reached the
target *and* leads by the margin. A running score of 14–12 leaves the match
live rather than finalizing it, and the app refuses to finalize a match where a
set before the clinching one was left unfinished. This is enforced in the
database too, so it holds no matter what posts the score.

---

## Development

```bash
npm run dev        # dev server
npm run build      # production build (type-checked)
npm test           # unit tests for pools, standings, brackets and scoring
npm run test:db    # schema + auto-advancement tests against a real Postgres
npm run test:all   # both
```

`npm run test:db` stands up a throwaway Postgres cluster, applies the
migration, loads three brackets built by the app's own generator, and plays
every match through `submit_match_score()` — checking advancement through byes,
that corrections cascade downstream, that set completion is enforced, and that
each role can do exactly what it should. It needs the Postgres server binaries
(`initdb`, `pg_ctl`) on `PATH` and must not run as root.

### Layout

```
src/lib/bracket.ts      bracket generation and seeding (single / consolation / double)
src/lib/pools.ts        pool splitting, round robin, court & time scheduling
src/lib/standings.ts    pool records and the tiebreaker ladder
src/lib/scoring.ts      when a set is won and when a match is decided
src/lib/api.ts          every read and write against Supabase
src/pages/              Games, Divisions, Division detail, Admin, Account
supabase/migrations/    the schema, roles, RLS and auto-advancement
supabase/tests/         SQL exercised by scripts/test-db.sh
```

The tournament logic is deliberately kept in plain functions with no React or
Supabase imports, which is what makes it straightforward to test.

### How advancement works

Every bracket match records where its two teams come from: a direct seed, or
*the winner of match X* / *the loser of match X*. When a result is posted,
`propagate_results()` walks forward from that match and fills the slots it
feeds. If that leaves a match with only one real team, because the other side
was a bye, that match completes as a bye and the walk continues. Correcting a
result runs the same walk in reverse first, clearing everything downstream
before writing the new outcome.

Because the wiring lives in the data rather than in application code, the same
mechanism handles all three bracket formats.

---

## Tiebreakers

Within a pool, in order:

1. Match win percentage
2. Head-to-head — applied when exactly two teams are tied
3. Set ratio
4. Point ratio
5. Point differential
6. Team name, so the order is at least stable and reproducible

Across pools, when seeding the bracket, head-to-head is skipped: the teams
never played each other.
