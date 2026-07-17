// Live score sync from ESPN's free golf leaderboard feed (runs in the browser).
//  linescores[].outScore = front-9 strokes, inScore = back-9 strokes.
//  to-par per nine = strokes - par (front 34 / back 36 at Royal Birkdale).
// ESPN's site.api.espn.com sends `Access-Control-Allow-Origin: *`, so the fetch
// works directly from a static site with no proxy.
import { fold, aliasFor } from './names';
import type { PoolState } from './scoring';

const LEADERBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard';

export interface SyncResult {
  ok: boolean;
  reason?: string;
  matched?: number;
  updated?: number;
  unmatchedCount?: number;
  unmatched?: string[];
  currentRound?: number;
  eventState?: string | null;
  cutApplied?: boolean;
  eventStatus?: string | null;
}

function toParNum(displayValue: unknown): number | null {
  if (displayValue == null) return null;
  const s = String(displayValue).trim().toUpperCase();
  if (s === 'E') return 0;
  const n = Number(s.replace('+', ''));
  return Number.isFinite(n) ? n : null;
}

export async function fetchOpenCompetition(): Promise<{ event: any; competition: any } | null> {
  const res = await fetch(LEADERBOARD_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`ESPN request failed: ${res.status}`);
  const data = await res.json();
  const events = data.events || [];
  const ev =
    events.find((e: any) => e.name === 'The Open') ||
    events.find((e: any) => /\bopen\b/i.test(e.name) && !/puntacana|corales/i.test(e.name));
  if (!ev) return null;
  return { event: ev, competition: (ev.competitions || [])[0] || null };
}

export async function syncFromEspn(
  state: PoolState,
  opts: { parFront?: number; parBack?: number } = {}
): Promise<SyncResult> {
  const parFront = opts.parFront ?? state.meta.parFront ?? 34;
  const parBack = opts.parBack ?? state.meta.parBack ?? 36;
  const lockedRounds = new Set(state.meta.lockedRounds || []);

  const found = await fetchOpenCompetition();
  if (!found || !found.competition) return { ok: false, reason: 'event-not-found' };

  const comp = found.competition;
  const evStatus = found.event.status || {};
  const compStatus = comp.status || {};

  const idx = new Map<string, any>();
  for (const c of comp.competitors || []) {
    const nm = c.athlete && c.athlete.displayName;
    if (nm) idx.set(fold(nm), c);
  }

  let matched = 0;
  let updated = 0;
  let anyCut = false;
  const unmatched: string[] = [];

  for (const g of Object.values(state.golfers)) {
    const c = idx.get(aliasFor(fold(g.name)));
    if (!c) {
      unmatched.push(g.name);
      continue;
    }
    matched++;

    const st = c.status || {};
    const posName = String((st.position && st.position.displayName) || '').toUpperCase();
    const typeName = String((st.type && st.type.name) || '').toUpperCase();

    g.position = (st.position && st.position.displayName) || g.position;
    g.thru = st.thru ?? g.thru;
    g.startHole = st.startHole ?? g.startHole;
    g.teeTime = st.teeTime ?? g.teeTime;
    g.today = st.todayDetail ?? g.today;
    g.roundState = (st.type && st.type.state) || g.roundState; // pre | in | post
    if (c.score && typeof c.score === 'object') {
      g.totalToPar = c.score.displayValue ?? g.totalToPar;
      g.toPar = toParNum(c.score.displayValue);
      g.totalStrokes = c.score.value ?? g.totalStrokes;
    }

    if (posName === 'CUT' || typeName.includes('CUT')) {
      g.cut = 'cut';
      anyCut = true;
    } else if (typeName.includes('WITHDRAW') || posName === 'WD') {
      g.cut = 'wd';
    } else if (g.cut !== 'cut' && g.cut !== 'wd') {
      g.cut = 'active';
    }

    for (const ls of c.linescores || []) {
      const p = ls.period;
      if (!p || p < 1 || p > 4) continue;
      if (lockedRounds.has(p)) continue;
      const existing = state.golfers[g.id].scores[p];
      if (existing && existing.manual) continue;

      const hasOut = ls.outScore !== null && ls.outScore !== undefined;
      const hasIn = ls.inScore !== null && ls.inScore !== undefined;
      if (!hasOut && !hasIn) continue;

      const f9 = hasOut ? ls.outScore - parFront : existing ? existing.f9 : null;
      const b9 = hasIn ? ls.inScore - parBack : existing ? existing.b9 : null;
      state.golfers[g.id].scores[p] = { f9, b9, source: 'espn', manual: false };
      updated++;
    }
  }

  const currentRound = compStatus.period || evStatus.period || state.meta.currentRound || 1;
  const eventState = (evStatus.type && evStatus.type.state) || null; // pre | in | post
  state.meta.currentRound = currentRound;
  state.meta.eventState = eventState;
  state.meta.eventComplete = eventState === 'post';
  state.meta.cutApplied = anyCut || currentRound >= 3;
  state.meta.eventStatus = (evStatus.type && evStatus.type.description) || state.meta.eventStatus || null;
  state.meta.lastSync = new Date().toISOString();
  state.meta.lastSyncOk = true;
  state.meta.unmatchedGolfers = unmatched;

  return {
    ok: true,
    matched,
    updated,
    unmatchedCount: unmatched.length,
    unmatched,
    currentRound,
    eventState,
    cutApplied: state.meta.cutApplied,
    eventStatus: state.meta.eventStatus,
  };
}
