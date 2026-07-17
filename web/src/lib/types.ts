export interface Meta {
  event: string;
  course: string;
  parFront: number;
  parBack: number;
  par: number;
  salaryCap: number;
  entries: number;
  owners: number;
  pot: number;
  entryFee: number;
  currentRound: number;
  cutApplied: boolean;
  lockedRounds: number[];
  importedAt: string;
  lastSync: string | null;
  lastSyncOk?: boolean;
  lastSyncError?: string | null;
  unmatchedGolfers?: string[];
  eventState?: string | null;
  eventComplete?: boolean;
  eventStatus?: string | null;
}

export interface Prize {
  rank: number;
  amount: number;
}

export interface NineSums {
  f9: number | null;
  b9: number | null;
}

export interface LeaderRow {
  id: string;
  order: number;
  position: number | null;
  positionDisplay: string;
  isTie: boolean;
  paidRank: number | null;
  projectedPrize: number | null;
  movement: number | null;
  owner: string;
  entryNum: number;
  displayName: string;
  total: number;
  roundDailies: (number | null)[];
  nineSums: NineSums[];
  tiebreak: number[];
  live: boolean;
  playedCount: number;
  totalSalary: number;
  cutMade: number;
  cutProjectedMade: number;
  cutAtRisk: boolean;
  eliminated: boolean;
  status: string;
}

export interface CutProjection {
  line: number | null;
  applies: boolean;
  official: boolean;
  rule: string;
}

export interface GolferLite {
  id: string;
  name: string;
  salary: number;
  cut: string;
  position: string | null;
  thru: number | null;
  teeTime: string | null;
  roundState: string | null;
  today: string | null;
  totalToPar: string | number | null;
  toPar: number | null;
  cutProjected: boolean | null;
}

export interface TeamRoundRow {
  golferId: string;
  name: string;
  f9: number | null;
  b9: number | null;
  source: string | null;
  countF9: boolean;
  countB9: boolean;
  cut: string;
}

export interface TeamRound {
  round: number;
  played: boolean;
  live: boolean;
  final: boolean;
  rows: TeamRoundRow[];
  f9Sum: number | null;
  b9Sum: number | null;
  f9Available: number;
  b9Available: number;
  daily: number | null;
}

export interface TeamDetail {
  id: string;
  owner: string;
  entryNum: number;
  displayName: string;
  totalSalary: number;
  paid: boolean;
  golfers: GolferLite[];
  unmatched: { unmatched: string }[];
  rounds: TeamRound[];
  roundDailies: (number | null)[];
  nineSums: NineSums[];
  total: number;
  prevTotal: number;
  live: boolean;
  playedCount: number;
  cutMade: number;
  cutProjectedMade: number;
  cutAtRisk: boolean;
  eliminated: boolean;
  status: string;
}

export interface RoundScore {
  f9: number | null;
  b9: number | null;
  source: string;
  manual: boolean;
}

export interface GolferFull {
  id: string;
  name: string;
  salary: number;
  scores: Record<string, RoundScore>;
  cut: string;
  position: string | null;
  thru: number | null;
  teeTime: string | null;
  roundState: string | null;
  today: string | null;
  totalToPar: string | number | null;
  toPar: number | null;
  cutProjected: boolean | null;
  ownedBy: number;
  ownedPct: number;
}
