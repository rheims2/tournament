# Live HTML view of the tournament Google Sheets

`public/sheets.html` is a single, self-contained page that shows read-only
tables of Google Sheets you don't own. Hitting **Refresh** re-reads the current
values straight from Google, so edits the tournament staff make during the day
appear here — no copies, no export step, nothing to keep in sync.

It's one file with no build step and no dependencies. Open it by double-clicking
it, or deploy it with this app and reach it at `/sheets.html`.

## Setting up the six sheets

Open the page and click **Sheets…**. Paste one line per sheet:

```
Pool Play  | https://docs.google.com/spreadsheets/d/1AbCdEf…/edit#gid=0
Standings  | https://docs.google.com/spreadsheets/d/1GhIjKl…/edit#gid=0
```

The name is the tab label; the link is whatever Google's address bar shows. The
list is saved in your browser, so it survives reloads and is easy to fix
mid-tournament.

To put the same list in front of everyone, fill in the `SHEETS` array near the
top of `sheets.html` and redeploy. A locally saved list overrides the built-in
one; **Use built-in list** discards the local copy.

### Sheets with more than one tab

The page reads one tab at a time — Google's endpoint has no way to list the
others. Add one line per tab, opening each tab in Google Sheets first and
copying the `#gid=…` that appears in the URL:

```
Brackets — Gold   | https://docs.google.com/spreadsheets/d/1MnOpQr…/edit#gid=0
Brackets — Silver | https://docs.google.com/spreadsheets/d/1MnOpQr…/edit#gid=884213
```

## What each sheet has to be

**A real Google Sheet.** Open it: a URL starting with
`docs.google.com/spreadsheets/d/` is a Google Sheet and will work. A file that
opens in a Drive preview with a Download button is an uploaded `.xlsx` and has
no live data endpoint — see below.

**Shared "Anyone with the link — Viewer".** Test it in a private window: if
Google asks you to sign in, the page can't read it either, and only the owner
can widen the sharing. "Anyone in <company> with the link" is *not* enough — the
page reads anonymously.

The owner does **not** need to use File → Share → Publish to web, and you don't
need any access beyond the view link you already have.

## If a sheet is an uploaded .xlsx

There is no way to read one live from a browser: Drive's download URL sends no
CORS headers, so a plain HTML page is blocked from fetching it. Two options:

- Ask the owner to open it in Sheets and choose **File → Save as Google Sheets**.
  That converts it once and the link then works here.
- Or run a small server-side proxy that downloads the file and re-serves it with
  CORS headers. That's a real backend, not a static file — worth it only if the
  owner won't convert.

## How it works

Google's visualization endpoint returns a tab's contents as JSON:

```
https://docs.google.com/spreadsheets/d/<FILE_ID>/gviz/tq?tqx=out:json&gid=<TAB_ID>
```

The page loads it with a `<script>` tag (JSONP) rather than `fetch()`. That
matters: none of the Sheets export URLs send CORS headers, so `fetch()` against
them fails from any page that isn't on `docs.google.com`. JSONP isn't subject to
CORS, which is what lets a static file do this with no server, no API key, and
no Google login. Each request carries a timestamp so a refresh can't be answered
from the browser cache.

## What it doesn't carry over

Only values and Google's own number/date formatting come across. Cell colours,
fonts, merged cells, conditional formatting, charts, and images are not in the
data the endpoint returns. Each row's **Open in Google Sheets** link goes to the
real thing when the formatting matters.

## Notes for running it during a tournament

- **Auto** re-reads every 30 seconds to 5 minutes; returning to a phone that
  slept triggers a refresh too, so nobody reads stale scores.
- **Filter rows…** narrows the current table to matching rows — quickest way to
  find one team or court.
- A red dot on a tab means that sheet failed; open it to see why.
- The header row and first column stay pinned while you scroll a wide bracket.
