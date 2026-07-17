# The Open Championship 2026 — Golf Pool Tracker

A live leaderboard for the pool: best‑3‑of‑6 daily scoring, cut tracking, tiebreakers,
per‑team drill‑downs, owner and golfer views, favorites, dark mode, and a TV/kiosk mode.

It's a **static site** — just HTML/CSS/JS. There is no backend to run or pay for. Round 1
scores are baked in from the pool spreadsheet; Rounds 2–4 are pulled **live from ESPN's public
API in the browser**. All scoring and ranking is computed client‑side, so 75 people can hit it
at once with zero server load.

---

## How it works

```
Golf Pool …2026.xlsx  ──(npm run generate-data)──▶  web/public/data.json   (Round 1 + rosters + prizes)
                                                              │
                                                     browser loads data.json
                                                              │
        ESPN public API  ──(fetch every 60s, in the browser)──┘  ──▶  merged, ranked, cached to localStorage
```

- **`scripts/generate-data.js`** parses the Excel workbook once at build time and writes
  `web/public/data.json` (156 golfers, 127 team entries, 75 owners). The workbook never ships to users.
- **`web/src/lib/scoring.ts`** computes the leaderboard, cut line, movement, and prizes:
  daily score = *best 3 front‑nine* + *best 3 back‑nine* to‑par; need ≥ 3 golfers through the cut;
  ties break Sunday back 9 → Sunday front 9 → backwards.
- **`web/src/lib/espn.ts`** fetches ESPN and matches golfers by name (accent‑folding + an alias map).
  Round 1 stays locked to the sheet.
- **`web/src/lib/store.ts`** loads `data.json`, runs the sync, and caches the latest scores to
  `localStorage` so the app still works if ESPN is unreachable or the user is briefly offline.

> ESPN's `site.api.espn.com` returns `Access-Control-Allow-Origin: *`, which is why the browser
> can call it directly with no proxy. If ESPN ever changes that, live sync would need a proxy —
> Round 1 and the last cached scores would still display.

---

## Local development

```bash
npm install            # installs build tooling + web app deps
npm run dev            # regenerates data.json, then starts Vite at http://localhost:5173
```

Other commands:

```bash
npm run generate-data  # rebuild web/public/data.json from the .xlsx (after editing the sheet)
npm run build          # generate data + produce the production bundle in web/dist
npm run preview        # serve the production build locally to test it
```

If you change the spreadsheet, re‑run `npm run generate-data` (or just `npm run dev`, which does
it for you) and commit the updated `web/public/data.json`.

---

## Deployment — GitHub Pages (recommended)

**Why GitHub Pages over Cloudflare Pages here:** you already have a GitHub account, so there's no
new service to sign up for. The included Actions workflow means every `git push` rebuilds and
redeploys automatically, and the site is served from GitHub's CDN — plenty fast and reliable for a
one‑weekend event. (Cloudflare Pages is excellent too; it would just mean creating another account.
If you ever want it, it can deploy this same `web/dist` folder.)

### One‑time setup

1. Create a repository on GitHub (e.g. `golf-pool`).
2. From this folder, push the code:
   ```bash
   git init
   git add .
   git commit -m "Static golf pool tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/golf-pool.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. The **Deploy to GitHub Pages** workflow runs automatically (watch the **Actions** tab). When it
   finishes, your site is live at:
   ```
   https://<your-username>.github.io/golf-pool/
   ```

Share that link with the pool. Every future `git push` to `main` redeploys.

> **Private repo option:** the workbook and the generated `data.json` are visible to anyone who can
> see the repo. The picks are public to the pool anyway (that's the whole point of the leaderboard),
> but if you'd rather not have the repo browsable, make it **private** — GitHub Pages still works on
> private repos, and only the built site is public.

### Updating during the tournament

You usually don't need to — the app pulls live scores itself. You'd only redeploy to fix a roster or
Round 1 typo:

```bash
# edit the .xlsx, then:
npm run generate-data
git commit -am "Fix roster"
git push        # Actions rebuilds and redeploys in ~1 minute
```

---

## Project layout

```
Golf Pool - Open Championship 2026.xlsx   the source data
scripts/generate-data.js                  Excel → web/public/data.json (build step)
web/
  public/data.json                        generated pool data (committed)
  src/
    lib/       scoring.ts, espn.ts, names.ts, store.ts, api.ts, types.ts …
    pages/     Leaderboard, Team, Owners, Owner, Golfers, Info, Kiosk
    components/ Score, Star, Movement, Modal
    styles.css  responsive, light + dark
.github/workflows/deploy.yml              GitHub Pages CI
```

## Notes

- **Responsive:** one codebase for phone, tablet, and desktop. On phones the leaderboard trims to
  Pos / Team / Total / Cut; tap a row for the full breakdown. Kiosk mode (📺) is meant for a TV.
- **Offline:** the last synced scores are cached in `localStorage`; a failed ESPN fetch degrades
  quietly to cached data with no error popups.
- **`xlsx` audit warning:** `xlsx` is a *build‑time only* dependency that parses your own trusted
  workbook. It is never shipped to the browser, so the advisory doesn't affect the deployed site.
