// Pool scoring engine (client-side port of the old server/src/scoring.js).
//  Daily team score = (sum of best 3 front-9 to-par) + (sum of best 3 back-9 to-par)
//  Team total       = sum of daily scores across played rounds (lower is better)
//  Cut rule         = need >= 3 golfers through the cut, else eliminated
//  Tiebreak         = Sunday back 9, then Sunday front 9, then backwards through the rounds
import type {
  Meta,
  Prize,
  LeaderRow,
  TeamDetail,
  TeamRound,
  TeamRoundRow,
  CutProjection,
} from './types';

// ---- internal pool state (the shape of data.json) ----
export interface PoolRoundScore {
  f9: number | null;
  b9: number | null;
  source: string;
  manual: boolean;
}

export interface PoolGolfer {
  id: string;
  name: string;
  salary: number;
  scores: Record<string, PoolRoundScore>;
  cut: string; // active | cut | wd
  position: string | null;
  thru: number | null;
  teeTime?: string | null;
  today: string | null;
  totalToPar: string | number | null;
  toPar?: number | null;
  roundState?: string | null;
  startHole?: number | null;
  totalStrokes?: number | null;
  ownedBy?: number;
  ownedPct?: number;
}

export type RosterSlot = string | { unmatched: string };

export interface PoolTeam {
  id: string;
  owner: string;
  entryNum: number;
  displayName: string;
  roster: RosterSlot[];
  rosterNames?: string[];
  totalSalary: number;
  paid: boolean;
  status?: string;
}

export interface PoolState {
  meta: Meta;
  golfers: Record<string, PoolGolfer>;
  teams: PoolTeam[];
  prizes: Prize[];
}

// computeTeam yields a TeamDetail; buildLeaderboard augments it with ranking fields.
export interface RankedTeam extends TeamDetail {
  order: number;
  position: number | null;
  positionDisplay: string;
  isTie: boolean;
  paidRank: number | null;
  projectedPrize: number | null;
  prevPosition: number | null;
  movement: number | null;
  tiebreak: number[];
}

function sumBest3(rows: TeamRoundRow[], key: 'f9' | 'b9') {
  const withVal = rows.filter((r) => r[key] !== null && r[key] !== undefined);
  withVal.sort((a, b) => (a[key] as number) - (b[key] as number));
  const chosen = withVal.slice(0, 3);
  return {
    sum: chosen.reduce((acc, r) => acc + (r[key] as number), 0),
    chosenIds: new Set(chosen.map((r) => r.golferId)),
    available: withVal.length,
  };
}

/** Top-70-and-ties cut line, as a to-par number, from live golfer to-par. */
export function computeCutLine(golferMap: Record<string, PoolGolfer>): number | null {
  const scores = Object.values(golferMap)
    .filter((g) => g.cut !== 'wd' && typeof g.toPar === 'number')
    .map((g) => g.toPar as number)
    .sort((a, b) => a - b);
  if (scores.length === 0) return null;
  return scores[Math.min(69, scores.length - 1)];
}

export function computeTeamRound(
  golfers: PoolGolfer[],
  round: number,
  meta: Partial<Meta> = {}
): TeamRound {
  const rows: TeamRoundRow[] = golfers.map((g) => {
    const s = (g.scores && g.scores[String(round)]) || null;
    return {
      golferId: g.id,
      name: g.name,
      f9: s ? s.f9 : null,
      b9: s ? s.b9 : null,
      source: s ? s.source : null,
      countF9: false,
      countB9: false,
      cut: g.cut,
    };
  });

  const f9 = sumBest3(rows, 'f9');
  const b9 = sumBest3(rows, 'b9');
  for (const r of rows) {
    if (f9.chosenIds.has(r.golferId) && r.f9 !== null) r.countF9 = true;
    if (b9.chosenIds.has(r.golferId) && r.b9 !== null) r.countB9 = true;
  }

  const played = f9.available > 0 || b9.available > 0;
  // A team's round is "final" once every one of its (non-WD) golfers with data
  // has finished both nines — even if the tournament round is still going.
  const active = rows.filter((r) => (r.f9 !== null || r.b9 !== null) && r.cut !== 'wd');
  const allComplete = active.length > 0 && active.every((r) => r.f9 !== null && r.b9 !== null);
  const final = !!meta.eventComplete || round < (meta.currentRound || 1) || (played && allComplete);
  return {
    round,
    played,
    live: played && !final,
    final,
    rows,
    f9Sum: f9.available ? f9.sum : null,
    b9Sum: b9.available ? b9.sum : null,
    f9Available: f9.available,
    b9Available: b9.available,
    daily: played ? f9.sum + b9.sum : null,
  };
}

export function computeTeam(
  team: PoolTeam,
  golferMap: Record<string, PoolGolfer>,
  meta: Partial<Meta> = {},
  cutLine: number | null = null
): TeamDetail {
  const golfers = team.roster
    .map((slot) => (typeof slot === 'string' ? golferMap[slot] : null))
    .filter(Boolean) as PoolGolfer[];
  const unmatched = team.roster.filter((s) => s && typeof s === 'object') as { unmatched: string }[];

  const rounds = [1, 2, 3, 4].map((r) => computeTeamRound(golfers, r, meta));
  const playedRounds = rounds.filter((r) => r.played);
  const total = playedRounds.reduce((acc, r) => acc + (r.daily as number), 0);

  const curr = meta.currentRound || 1;
  const prevTotal = rounds
    .filter((r) => r.round < curr && r.played)
    .reduce((acc, r) => acc + (r.daily as number), 0);

  const cutMade = golfers.filter((g) => g.cut !== 'cut' && g.cut !== 'wd').length;
  const eliminated = !!meta.cutApplied && cutMade < 3;

  // Projected cut survival (during round 2, before the cut is official).
  const cutProjectedMade =
    cutLine === null
      ? cutMade
      : golfers.filter((g) => typeof g.toPar === 'number' && (g.toPar as number) <= cutLine).length;

  return {
    id: team.id,
    owner: team.owner,
    entryNum: team.entryNum,
    displayName: team.displayName,
    totalSalary: team.totalSalary,
    paid: team.paid,
    golfers: golfers.map((g) => ({
      id: g.id,
      name: g.name,
      salary: g.salary,
      cut: g.cut,
      position: g.position,
      thru: g.thru,
      teeTime: g.teeTime ?? null,
      roundState: g.roundState ?? null,
      today: g.today,
      totalToPar: g.totalToPar,
      toPar: g.toPar ?? null,
      cutProjected:
        cutLine !== null && typeof g.toPar === 'number' ? (g.toPar as number) <= cutLine : null,
    })),
    unmatched,
    rounds,
    roundDailies: rounds.map((r) => r.daily),
    nineSums: rounds.map((r) => ({ f9: r.f9Sum, b9: r.b9Sum })),
    total,
    prevTotal,
    live: rounds.some((r) => r.live),
    playedCount: playedRounds.length,
    cutMade,
    cutProjectedMade,
    cutAtRisk: !eliminated && (meta.currentRound || 1) >= 2 && cutProjectedMade < 3,
    eliminated,
    status: eliminated ? 'eliminated' : 'active',
  };
}

function tiebreakVector(t: TeamDetail): number[] {
  const nine = (i: number, key: 'f9Sum' | 'b9Sum') =>
    t.rounds[i] && t.rounds[i][key] !== null ? (t.rounds[i][key] as number) : 0;
  return [
    nine(3, 'b9Sum'), nine(3, 'f9Sum'),
    nine(2, 'b9Sum'), nine(2, 'f9Sum'),
    nine(1, 'b9Sum'), nine(1, 'f9Sum'),
    nine(0, 'b9Sum'), nine(0, 'f9Sum'),
  ];
}

export function buildLeaderboard(state: PoolState): RankedTeam[] {
  const meta = state.meta || ({} as Meta);
  const cutLine = computeCutLine(state.golfers);
  const teams: RankedTeam[] = state.teams.map((t) => ({
    ...computeTeam(t, state.golfers, meta, cutLine),
    order: 0,
    position: null,
    positionDisplay: '',
    isTie: false,
    paidRank: null,
    projectedPrize: null,
    prevPosition: null,
    movement: null,
    tiebreak: [],
  }));

  teams.sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (a.total !== b.total) return a.total - b.total;
    const va = tiebreakVector(a);
    const vb = tiebreakVector(b);
    for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return va[i] - vb[i];
    return a.displayName.localeCompare(b.displayName);
  });

  const active = teams.filter((t) => !t.eliminated);
  active.forEach((t, i) => {
    const better = active.filter((o) => o.total < t.total).length;
    const same = active.filter((o) => o.total === t.total).length;
    t.position = better + 1;
    t.isTie = same > 1;
    t.positionDisplay = (same > 1 ? 'T' : '') + (better + 1);
    t.paidRank = i + 1; // tiebreak-resolved order among active teams
    t.tiebreak = tiebreakVector(t);
  });
  for (const t of teams.filter((x) => x.eliminated)) {
    t.position = null;
    t.isTie = false;
    t.positionDisplay = 'CUT';
    t.paidRank = null;
    t.tiebreak = tiebreakVector(t);
  }

  // Movement vs. end of the previous completed round.
  const hasPrev = (meta.currentRound || 1) > 1;
  if (hasPrev) {
    for (const t of active) {
      const better = active.filter((o) => o.prevTotal < t.prevTotal).length;
      t.prevPosition = better + 1;
      t.movement = t.prevPosition - (t.position as number);
    }
  }

  // Projected prize by tiebreak-resolved order.
  const prizeByRank = new Map((state.prizes || []).map((p) => [p.rank, p.amount]));
  for (const t of teams) {
    t.projectedPrize = t.paidRank != null ? prizeByRank.get(t.paidRank) ?? null : null;
  }

  teams.forEach((t, i) => (t.order = i + 1));
  return teams;
}

export function cutProjection(state: PoolState): CutProjection {
  const meta = state.meta || ({} as Meta);
  const line = computeCutLine(state.golfers);
  const applies = (meta.currentRound || 1) >= 2 && line !== null;
  return {
    line,
    applies,
    official: !!meta.cutApplied,
    rule: 'Top 70 & ties',
  };
}

export function leaderboardSummary(state: PoolState): LeaderRow[] {
  return buildLeaderboard(state).map((t) => ({
    id: t.id,
    order: t.order,
    position: t.position,
    positionDisplay: t.positionDisplay,
    isTie: t.isTie,
    paidRank: t.paidRank,
    projectedPrize: t.projectedPrize,
    movement: t.movement,
    owner: t.owner,
    entryNum: t.entryNum,
    displayName: t.displayName,
    total: t.total,
    roundDailies: t.roundDailies,
    nineSums: t.nineSums,
    tiebreak: t.tiebreak,
    live: t.live,
    playedCount: t.playedCount,
    totalSalary: t.totalSalary,
    cutMade: t.cutMade,
    cutProjectedMade: t.cutProjectedMade,
    cutAtRisk: t.cutAtRisk,
    eliminated: t.eliminated,
    status: t.status,
  }));
}
