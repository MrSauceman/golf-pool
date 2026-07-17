# The Open Championship 2026 — Golf Pool Tracker

A live leaderboard + team drill-down for the $20/team fantasy pool, built from the
commissioner's Excel workbook. Round 1 comes from the sheet; rounds 2–4 update live
from ESPN's free golf feed.

## What it does

- **Imports** the workbook (`Golf Pool - Open Championship 2026.xlsx`): 156 golfers,
  127 team entries across 75 owners, with Round 1 front-9/back-9 scores.
- **Computes** each team's daily score = *best 3 front-nine* + *best 3 back-nine* to-par,
  4-round totals, cut survival (need ≥ 3 golfers through the cut), and tiebreakers
  (Sunday back 9 → Sunday front 9 → backwards).
- **Live sync** from ESPN: `outScore`/`inScore` per round → to-par using Royal Birkdale's
  par 34 (front) / 36 (back). Round 1 stays locked to the sheet; manual edits are never overwritten.
- **React UI**: sortable/searchable leaderboard, per-team round-by-round breakdown that
  highlights which golfers counted, a full golfer board, and a rules/prizes page.

## Quick start

```bash
# from the project root
npm install        # installs root + server + web
npm run dev        # starts API (http://localhost:4000) and web (http://localhost:5173)
```

Open **http://localhost:5173**. The API auto-imports the workbook on first run and
auto-syncs ESPN every 2 minutes.

### Single-port production build

```bash
npm run build      # builds the web app into web/dist
npm start          # server serves the UI + API on http://localhost:4000
```

## Handy commands

| Command | What |
| --- | --- |
| `npm run import` | Re-parse the workbook into `server/data/pool.json` (resets scores) |
| `POST /api/sync` | Pull latest scores from ESPN now (the ↻ button in the header) |
| `POST /api/golfers/:id/score` | Manually set a golfer's round score `{round, f9, b9}` — wins over ESPN |

## How scores flow

```
Excel workbook ──import──▶ pool.json (golfers + rosters + R1 scores)
ESPN feed ──sync──▶ golfer round scores (R2–R4)   [R1 locked, manual locked]
                    └▶ scoring engine ─▶ leaderboard / team detail
```

## Configuration (env vars for the server)

- `PORT` (default `4000`)
- `POOL_AUTOSYNC=0` to disable the background ESPN sync
- `POOL_SYNC_MS` sync interval in ms (default `120000`)
- `POOL_XLSX` path to a different workbook

## Notes

- **Data store** is a JSON file (`server/data/pool.json`) — zero native dependencies, so it
  runs anywhere Node 18+ does. The access layer is isolated in `server/src/store.js` if you
  later want to swap in SQLite/Postgres.
- Front/back par split (34/36) was validated against ESPN for 142/156 golfers in Round 1.
- A handful of golfer names differ between the sheet and ESPN (accents, "Matt" vs "Matthew");
  these are handled by accent-folding + an alias map in `server/src/names.js`.
