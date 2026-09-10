# Live HTML views of the tournament Google Sheets

Two standalone pages read the tournament's Google Sheets and re-read them
every time you hit **Refresh**, so edits the scorers make during the day show
up without anyone exporting anything. Neither needs a build step, a server, an
API key, or a Google login.

| | |
|---|---|
| **`public/tournament.html`** | The designed view: divisions, pools with computed standings, brackets, court schedule, and a "follow my team" mode. Reads the sheets and works out what's in them. |
| **`public/sheets.html`** | The plain view: each sheet as a scrollable table, exactly as it appears in Google. No interpretation, so nothing to misread. |

Open either by double-clicking it, or deploy them with this app and reach them
at `/tournament.html` and `/sheets.html`.

## Pointing them at your sheets

Both pages have a paste-in setup. In `tournament.html` it's the **Data** tab;
in `sheets.html` it's the **Sheets…** button. **One line per tab**, saying what
that tab is:

```
Varsity Girls  | pool     | https://docs.google.com/spreadsheets/d/1AbCdEf…/edit#gid=0
Varsity Girls  | bracket  | https://docs.google.com/spreadsheets/d/1AbCdEf…/edit#gid=884213
JV Girls       | pool     | https://docs.google.com/spreadsheets/d/1GhIjKl…/edit#gid=0
JV Girls       | bracket  | https://docs.google.com/spreadsheets/d/1GhIjKl…/edit#gid=402117
Court Schedule | schedule | https://docs.google.com/spreadsheets/d/1MnOpQr…/edit#gid=0
```

**Lines sharing a name become one division.** A workbook that keeps pool play
on one tab and the bracket on another is two lines with the same file id and
different `#gid=…`, and comes out as a single page tab with both on it. Six
such workbooks is twelve lines.

The roles are `pool`, `bracket`, `division` (one tab holding both, sorted out
by its headings — the default), `schedule` and `raw`. Saying `pool` or
`bracket` outright is worth it: a bracket tab often has no heading that gives
it away, just a table of games, and left to guess the page would file it as
pool play.

The list is saved in your browser, so it survives reloads and is easy to fix
mid-tournament. To put the same list in front of everyone, fill in the `SHEETS`
array near the top of the file and redeploy; a locally saved list overrides it,
and **Use built-in list** discards the local copy.

`tournament.html` also has an `EVENT` block above `SHEETS`: the name shown in
the top bar, and `dayDates`, which maps a day label in your sheets
(`"Friday"`) to a real date (`"2026-08-28"`). Filling that in is what switches
on **On the courts now** and **Up next** — without it everything else still
works, just with no live clock.

### Finding the gid for each tab

Google's endpoint reads one tab at a time and has no way to list the others,
so each tab needs its own line and its own gid. Open the workbook, click the
tab, and copy the URL from the address bar — the `#gid=…` on the end changes
to that tab. The first tab is usually `#gid=0`.

## What each sheet has to be

**A real Google Sheet.** Open it: a URL starting with
`docs.google.com/spreadsheets/d/` is a Google Sheet and will work. A file that
opens in a Drive preview with a Download button is an uploaded `.xlsx`, which
has no live data endpoint — see below.

**Shared "Anyone with the link — Viewer."** Test in a private window: if Google
asks you to sign in, the pages can't read it either, and only the owner can
widen the sharing. "Anyone in *company* with the link" is not enough, because
the pages read anonymously. The owner does **not** need File → Publish to web,
and you need nothing beyond the view link.

## The tournament-template layout

The workbooks these tournaments run on are generated from a template that
looks nothing like a list of games, so it gets a dedicated reader, tried
before the general one below. Merged cells matter throughout: Google returns
a value only at a merged range's top-left corner and blanks for the rest, so
the reader follows anchors and steps over the gaps.

The six Omaha Classic workbooks are all of this shape. Five keep two tabs
(pool + schedule); Girls JH keeps four (`JH Pool Sched`, `JH Pool Results`,
`JH Gold Div`, `JH Silver Div`) and all four are one division.

**A pool tab** is read for three things:

- the **roster** — a `Pool A` cell with the team names under it;
- the **score matrix**, found by its `+/- Total` cell — teams down the left in
  merged 3-row bands, opponents across the top in merged 3-column bands, and
  inside each cell the two team names above a `Set 1`/`Set 2` pair of score
  boxes. Only the upper triangle is read; the mirrored half is the same game;
- the **fixture list** — `Match A1 | 13:00:00 | Cougars V | vs | Warriors
  Silver`. Rows are found by the bare `vs` cell rather than a header row,
  because these lists don't have one. `X-over A1 vs B2` is kept as a real slot
  the pools have yet to fill.

The fixtures supply times, courts and pairings; the matrix supplies the
scores; they're joined on the pair of team names — **across tabs**, since a
division often keeps its schedule on one tab and its scores on another. A
matrix cell records which side is written first, so a score entered on either
side of the diagonal lands the right way round.

The matrix defines *every* pairing (21 of them for a seven-team pool) while
only the scheduled ones get played, so it is treated as a lookup table rather
than a schedule. Where a division has no fixture list anywhere — a four- or
five-team round robin, say — the matrix's pairings do become the games.

What a tab is *called* doesn't decide what's on it: Boys Varsity keeps its
pool round robin on the Schedule tab, beside the drawn bracket, and both are
read. Standings are computed from whatever scores are in.

A schedule that names teams by seed code (`A1 vs B2`) is resolved through the
code-to-team legend alongside it, and a row can carry more than one game where
two courts run side by side.

**A bracket tab** is a bracket *drawn* in cells. Each game is three cells in a
row — label, time, `Court n` — with its entrants in the same column above and
below, and any `CHAMPION` / `Third Place` label to its right. Rounds are
grouped by start time.

One limit worth knowing: in a drawn bracket the line from a game to the next
one is a cell *border*, which carries no value. So where a slot is filled by
"whoever wins the 10:00 game" and the sheet doesn't write that in, the slot
shows as **TBD** rather than being guessed at. Everything the sheet actually
labels — `4th Seed`, `Loser G V D` — is read and shown.

## The general layout

If a tab isn't in the template shape above, it's read as stacked blocks,
each one a **heading row** with a single filled cell, a **header row** naming
the columns, then the rows, and a blank row before the next block.

```
Pool A                                              <- heading (one cell filled)
Day      Time      Court  Team A       Team B     Result      <- header row
Friday   3:00 PM   3      Manhattan    KC East    CHIEF 25-16, CHIEF 25-16
Friday   4:30 PM   3      Omaha RR 1   Manhattan  Roadrunners 1 25-15, 25-6
                                                    <- blank row ends the block
Winners Round 1
Game #   Day       Time   Court  Team A      Team B   Result
1        Saturday  9:05   3      Omaha RR 1  KC Fire  Roadrunners 1 25-2, 25-7
5        Saturday  11:15  3      W1          W2
```

Column headers are matched by name, not position, so the order doesn't matter
and unrecognised columns are ignored. Two other shapes are read as well:

- **Pools side by side.** Pool A in columns A–F and Pool B in H–M is read as
  two pools, not one spliced table — the sheet is split at any column that is
  empty top to bottom.
- **A round-robin grid** — the same teams down the first column and across the
  first row, results in the cells. Only the upper triangle is read; the
  mirrored cell is the same game.
- **Per-set score columns** (`Set 1`, `Set 2`, `Set 3`) instead of one Result
  column.

Where a result names no team (`25-20, 25-18`, as in the last two shapes), the
first number is read as the left-hand team's, which is the usual convention.
A `Team | W | L` block is recognised as a standings table rather than read as
one team playing nobody, once per row. It understands `Team A`/`Team B`,
`Home`/`Away`, or a single `Match` column reading `A vs B`; `Result` or a pair
of score columns; and optional `Game #`, `Day`, `Court`, `Pool`, `Round`,
`Winner` and `Place` columns.

- A block headed `Pool A` (or with a `Pool` column) becomes a pool.
- A block headed like a round — `Winners Round 1`, `Semifinals`,
  `Championship` — becomes a bracket column. Consecutive ones line up as one
  bracket; a heading containing the word *bracket* (`5th place bracket`)
  starts a separate one.
- `W1`, `L3`, `Winner of 5`, `TBD` and `Bye` in a team cell are read as *where
  that slot comes from*, and shown as a dashed source chip until it's filled.
- A block with a `Place` column becomes the division's final standings,
  whichever tab it sits on.

On a tab declared `pool` or `bracket`, every table of games is taken as that,
headings or no headings — so a bare bracket tab still reads as a bracket, and
its rounds are grouped by start time when nothing names them.

**Who won is worked out from the result text.** Each comma-separated piece is
one set and names the side that took it, so `Cougars 25-19, 23-25, 15-11`
counts as a Cougars win and `Warriors 25-20, Cougars 25-23` counts as a split.
An explicit `Winner` column is trusted ahead of that. Where the naming is
ambiguous no winner is claimed, rather than guessing one.

Pool standings (W–L, sets, point differential) are **computed from the results
recorded so far**, not read from the sheet, so they move as scores go in.

A sheet with role `schedule` is read as the master court grid instead: times
across the top row, courts down the first column, and a heading row starting
each day.

### If it reads a sheet wrong

Open the **Data** tab. It shows every sheet exactly as Google returned it,
what was made of it, and — block by block — anything it did not turn into
games, printed verbatim with the reason why ("its header row has no team
columns", "not a round-robin grid"). Compare that
against the sheet and the mismatch is usually obvious. All the layout logic
lives in one marked section of `tournament.html` (*"2. making sense of a
grid"*) — retargeting it to a differently shaped workbook means changing that
section and nothing else.

## If a sheet is an uploaded .xlsx

There's no way to read one live from a browser: Drive's download URL sends no
CORS headers, so a static page is blocked from fetching it. Either ask the
owner to open it and choose **File → Save as Google Sheets** (a one-time
conversion, after which the link works here), or run a server-side proxy that
downloads the file and re-serves it with CORS headers — a real backend, worth
it only if the owner won't convert.

## How the live read works

Google's visualization endpoint returns a tab's contents as JSON:

```
https://docs.google.com/spreadsheets/d/<FILE_ID>/gviz/tq?tqx=out:json&gid=<TAB_ID>
```

Both pages load it with a `<script>` tag (JSONP) rather than `fetch()`. That
matters: none of the Sheets export URLs send CORS headers, so `fetch()` against
them fails from any page not on `docs.google.com`. JSONP isn't subject to CORS,
which is what lets a static file do this at all. Each request carries a
timestamp so a refresh can't be answered from the browser cache.

## What doesn't come across

Only values and Google's own number and date formatting. Cell colours, fonts,
merged cells, conditional formatting, charts and images aren't in the data the
endpoint returns. Every sheet has an **Open in Google Sheets** link for when
the formatting is the point.

## Running it during a tournament

- **Auto** re-reads every 30 seconds to 5 minutes; coming back to a phone that
  slept refreshes too, so nobody reads stale scores.
- **Follow a team** — in the top bar, or by tapping any team name anywhere —
  highlights that team through every pool, bracket and court, and fills the
  **My Team** tab with their games in order.
- A game counts as *on now* from its start until the next game begins on that
  court, capped at `EVENT.slotMinutes` (60 by default).
- A red dot on a tab means that sheet failed to load; the Data tab says why.
- **Print** drops the navigation and prints the current tab.
