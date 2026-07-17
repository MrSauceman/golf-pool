// ── Tournament configuration ────────────────────────────────────────────────
// Everything that changes from one pool to the next lives here. To reuse this
// app for a new tournament: drop in the new spreadsheet (same format), update
// the values below, then run `npm run generate-data`.
//
// This single file is read by BOTH:
//   - the build step   → scripts/generate-data.js   (Node, writes data.json)
//   - the live sync    → web/src/lib/espn.ts         (browser, matches ESPN's feed)

export const TOURNAMENT = {
  // Shown in the header/info page. Also used to invalidate a stale offline cache
  // (a cached snapshot from a different event name is ignored).
  event: 'The Open Championship 2026',
  course: 'Royal Birkdale',

  // Course par split, by nine. IMPORTANT: ESPN reports strokes per nine and the
  // app subtracts par to get to-par, so these MUST match the actual course or
  // live scores will be wrong. (Royal Birkdale: front 34 / back 36 = par 70.)
  parFront: 34,
  parBack: 36,

  // Pool rules.
  salaryCap: 50,
  entryFee: 20,

  // Rounds whose scores come from the spreadsheet and must NOT be overwritten by
  // ESPN. Round 1 is pre-loaded here; use [] if every round comes live from ESPN.
  lockedRounds: [1],

  // How to find this event in ESPN's golf leaderboard feed:
  // https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard
  // It returns several concurrent events, so we pick the right one by name.
  espn: {
    exactName: 'The Open',         // preferred: exact match on event.name
    include: /\bopen\b/i,          // fallback: event.name must match this…
    exclude: /puntacana|corales/i, // …and must NOT match this (avoids look-alikes)
  },
};
