// Client-side data store. Replaces the old Express server:
//  - loads the static data.json (Round 1 scores, rosters, prizes, metadata)
//  - overlays the last cached ESPN snapshot from localStorage (offline fallback)
//  - runs ESPN sync in the browser and re-caches after each success
import type { PoolState, PoolGolfer } from './scoring';
import { syncFromEspn, type SyncResult } from './espn';

// Bump the version suffix whenever a sync/scoring change could make older cached
// snapshots wrong — it makes every browser discard its stale snapshot on next load.
// (v2: fixes partial-nine scores that were cached as huge negatives.)
const SNAP_KEY = 'gp-live-snapshot-v2';
const OLD_SNAP_KEYS = ['gp-live-snapshot'];
// Resolve data.json against the document's actual base URL so it works whether the
// site is served from a domain root or a GitHub Pages subpath (…/golf-pool/).
const DATA_URL = new URL('data.json', document.baseURI).toString();

interface Snapshot {
  savedAt: string;
  event: string;
  state: PoolState;
}

// Live golfer fields that ESPN sync owns (everything except the locked Round 1 sheet data).
const LIVE_GOLFER_FIELDS: (keyof PoolGolfer)[] = [
  'position', 'thru', 'teeTime', 'today', 'roundState',
  'totalToPar', 'toPar', 'totalStrokes', 'startHole', 'cut',
];

let state: PoolState | null = null;
let loadPromise: Promise<PoolState> | null = null;

function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

function saveSnapshot(s: PoolState): void {
  try {
    const snap: Snapshot = { savedAt: new Date().toISOString(), event: s.meta.event, state: s };
    localStorage.setItem(SNAP_KEY, JSON.stringify(snap));
  } catch {
    /* localStorage full / unavailable — offline cache is best-effort */
  }
}

// Overlay cached live scores/metadata onto a freshly-loaded base (data.json wins on
// rosters/prizes/Round 1; the snapshot wins on live tournament state).
function applySnapshot(base: PoolState, snap: Snapshot): void {
  if (snap.event && base.meta.event && snap.event !== base.meta.event) return; // different tournament
  const cached = snap.state;
  if (!cached || !cached.golfers) return;
  for (const [id, cg] of Object.entries(cached.golfers)) {
    const bg = base.golfers[id];
    if (!bg) continue;
    for (const f of LIVE_GOLFER_FIELDS) (bg as any)[f] = (cg as any)[f];
    for (const r of ['2', '3', '4']) if (cg.scores && cg.scores[r]) bg.scores[r] = cg.scores[r];
  }
  const m = cached.meta || ({} as PoolState['meta']);
  Object.assign(base.meta, {
    currentRound: m.currentRound ?? base.meta.currentRound,
    cutApplied: m.cutApplied ?? base.meta.cutApplied,
    eventState: m.eventState ?? base.meta.eventState,
    eventComplete: m.eventComplete ?? base.meta.eventComplete,
    eventStatus: m.eventStatus ?? base.meta.eventStatus,
    lastSync: m.lastSync ?? base.meta.lastSync,
    lastSyncOk: m.lastSyncOk,
    lastSyncError: m.lastSyncError ?? null,
    unmatchedGolfers: m.unmatchedGolfers ?? base.meta.unmatchedGolfers,
  });
}

async function loadInitial(): Promise<PoolState> {
  try {
    for (const k of OLD_SNAP_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  let base: PoolState | null = null;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (res.ok) base = (await res.json()) as PoolState;
  } catch {
    /* offline cold-load — fall back to the cached snapshot below */
  }
  const snap = loadSnapshot();
  if (base) {
    if (snap) applySnapshot(base, snap);
    return base;
  }
  if (snap?.state?.teams?.length) return snap.state; // fully offline, but we have a cache
  throw new Error('Unable to load pool data (offline and no cached copy).');
}

/** Load-once accessor. Safe to call concurrently from every page. */
export async function ensureState(): Promise<PoolState> {
  if (state) return state;
  if (!loadPromise) loadPromise = loadInitial();
  state = await loadPromise;
  return state;
}

export function getState(): PoolState | null {
  return state;
}

/** Fetch ESPN, merge live scores into state, and re-cache. Never throws. */
export async function runSync(): Promise<SyncResult> {
  const s = await ensureState();
  try {
    const result = await syncFromEspn(s);
    if (result.ok) {
      s.meta.lastSyncOk = true;
      s.meta.lastSyncError = null;
      saveSnapshot(s);
    } else {
      s.meta.lastSyncOk = false;
      s.meta.lastSyncError = result.reason ?? 'sync skipped';
    }
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    s.meta.lastSyncOk = false;
    s.meta.lastSyncError = reason;
    return { ok: false, reason };
  }
}
