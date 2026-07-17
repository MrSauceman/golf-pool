import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, save, setState, isEmpty } from './store.js';
import { importWorkbook, defaultXlsxPath } from './importer.js';
import { buildLeaderboard, computeTeam, leaderboardSummary, cutProjection, computeCutLine } from './scoring.js';
import { syncFromEspn } from './espn.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const AUTOSYNC = process.env.POOL_AUTOSYNC !== '0';
const SYNC_INTERVAL_MS = Number(process.env.POOL_SYNC_MS || 120000);

const app = express();
app.use(cors());
app.use(express.json());

// ---- bootstrap store ----
if (isEmpty()) {
  try {
    console.log('[boot] store empty - importing workbook:', defaultXlsxPath());
    const state = importWorkbook();
    setState(state);
    save(state);
  } catch (err) {
    console.error('[boot] import failed:', err.message);
  }
}

async function runSync(reason = 'manual') {
  const state = load();
  try {
    const result = await syncFromEspn(state);
    if (result.ok) {
      state.meta.lastSyncOk = true;
      state.meta.lastSyncError = null;
      save(state);
      console.log(`[sync:${reason}] matched=${result.matched} updated=${result.updated} round=${result.currentRound} status="${result.eventStatus}"`);
    } else {
      state.meta.lastSyncOk = false;
      state.meta.lastSyncError = result.reason;
      save(state);
      console.warn(`[sync:${reason}] skipped: ${result.reason}`);
    }
    return result;
  } catch (err) {
    state.meta.lastSyncOk = false;
    state.meta.lastSyncError = err.message;
    state.meta.lastSyncAttempt = new Date().toISOString();
    save(state);
    console.warn(`[sync:${reason}] error: ${err.message}`);
    return { ok: false, reason: err.message };
  }
}

// ---- API ----
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/meta', (_req, res) => {
  const s = load();
  res.json({ meta: s.meta, prizes: s.prizes });
});

app.get('/api/leaderboard', (_req, res) => {
  const s = load();
  res.json({
    meta: s.meta,
    teams: leaderboardSummary(s),
    prizes: s.prizes,
    cut: cutProjection(s),
    updatedAt: new Date().toISOString(),
  });
});

app.get('/api/teams/:id', (req, res) => {
  const s = load();
  const team = s.teams.find((t) => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'team not found' });
  const cutLine = computeCutLine(s.golfers);
  res.json({ meta: s.meta, cut: cutProjection(s), team: computeTeam(team, s.golfers, s.meta, cutLine) });
});

app.get('/api/golfers', (_req, res) => {
  const s = load();
  const cutLine = computeCutLine(s.golfers);
  const golfers = Object.values(s.golfers).map((g) => ({
    id: g.id, name: g.name, salary: g.salary,
    scores: g.scores, cut: g.cut, position: g.position,
    thru: g.thru, teeTime: g.teeTime, roundState: g.roundState,
    today: g.today, totalToPar: g.totalToPar, toPar: g.toPar ?? null,
    cutProjected: cutLine !== null && typeof g.toPar === 'number' ? g.toPar <= cutLine : null,
    ownedBy: g.ownedBy || 0, ownedPct: g.ownedPct || 0,
  }));
  res.json({ meta: s.meta, cut: cutProjection(s), golfers });
});

app.post('/api/sync', async (_req, res) => {
  const result = await runSync('api');
  res.json(result);
});

app.post('/api/golfers/:id/score', (req, res) => {
  const s = load();
  const g = s.golfers[req.params.id];
  if (!g) return res.status(404).json({ error: 'golfer not found' });
  const round = Number(req.body.round);
  if (!(round >= 1 && round <= 4)) return res.status(400).json({ error: 'round must be 1-4' });
  const f9 = req.body.f9 === null || req.body.f9 === '' ? null : Number(req.body.f9);
  const b9 = req.body.b9 === null || req.body.b9 === '' ? null : Number(req.body.b9);
  g.scores[round] = { f9, b9, source: 'manual', manual: true };
  save(s);
  res.json({ ok: true, golfer: { id: g.id, name: g.name, scores: g.scores } });
});

// Recompute standings straight from the workbook (loses live/manual edits).
app.post('/api/reimport', (req, res) => {
  if (req.query.confirm !== 'yes') return res.status(400).json({ error: 'add ?confirm=yes' });
  try {
    const state = importWorkbook();
    setState(state);
    save(state);
    res.json({ ok: true, meta: state.meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- serve built frontend if present (single-port production) ----
const dist = join(__dirname, '..', '..', 'web', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`[server] golf-pool API on http://localhost:${PORT}`);
  if (AUTOSYNC) {
    runSync('boot');
    setInterval(() => runSync('interval'), SYNC_INTERVAL_MS);
    console.log(`[server] auto-sync every ${SYNC_INTERVAL_MS / 1000}s (POOL_AUTOSYNC=0 to disable)`);
  }
});
