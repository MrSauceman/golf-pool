// Live score sync from ESPN's free golf leaderboard feed (runs in the browser).
//  linescores[].outScore = front-9 strokes, inScore = back-9 strokes.
//  to-par per nine = strokes - par (front 34 / back 36 at Royal Birkdale).
// ESPN's site.api.espn.com sends `Access-Control-Allow-Origin: *`, so the fetch
// works directly from a static site with no proxy.
import { fold, aliasFor } from './names';
import { TOURNAMENT } from './tournament.config.js';
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

export async function fetchCompetition(): Promise<{ event: any; competition: any } | null> {
  const res = await fetch(LEADERBOARD_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`ESPN request failed: ${res.status}`);
  const data = await res.json();
  const events = data.events || [];
  const { exactName, include, exclude } = TOURNAMENT.espn;
  const ev =
    events.find((e: any) => e.name === exactName) ||
    events.find((e: any) => include.test(e.name) && !exclude.test(e.name));
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

  const found = await fetchCompetition();
  if (!found || !found.competition) return { ok: false, reason: 'event-not-found' };

  const comp = found.competition;
  const evStatus = found.event.status || {};
  const compStatus = comp.status || {};
  const currentRound = compStatus.period || evStatus.period || state.meta.currentRound || 1;

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

      // ESPN's outScore/inScore are the strokes played SO FAR on each nine, so
      // they only equal a real 9-hole total once that nine is complete. Mid-nine
      // we must NOT subtract a full nine's par (that yields wild negatives like
      // an 8-stroke, 2-hole "back nine" reading as -28). Gate on holes completed.
      let frontDone = true;
      let backDone = true;
      const gState = (st.type && st.type.state) || '';
      if (p === (typeof st.period === 'number' ? st.period : currentRound) && gState !== 'post') {
        const thru = typeof st.thru === 'number' ? st.thru : 0;
        const startHole = typeof st.startHole === 'number' ? st.startHole : 1;
        const outHoles = startHole >= 10 ? Math.max(0, thru - 9) : Math.min(thru, 9);
        const inHoles = startHole >= 10 ? Math.min(thru, 9) : Math.max(0, thru - 9);
        frontDone = outHoles >= 9;
        backDone = inHoles >= 9;
      }

      const hasOut = ls.outScore !== null && ls.outScore !== undefined && frontDone;
      const hasIn = ls.inScore !== null && ls.inScore !== undefined && backDone;

      // An incomplete nine has no valid score — but do NOT write null over a nine
      // that was already completed and recorded earlier today. A real value always
      // overwrites (so bad cached data still self-heals); absence never does.
      const prev = state.golfers[g.id].scores[p] || {};
      const f9 = hasOut ? ls.outScore - parFront : (prev.f9 ?? null);
      const b9 = hasIn ? ls.inScore - parBack : (prev.b9 ?? null);

      if (f9 !== null || b9 !== null) {
        state.golfers[g.id].scores[p] = { f9, b9, source: 'espn', manual: false };
        updated++;
      }

    }
  }

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
