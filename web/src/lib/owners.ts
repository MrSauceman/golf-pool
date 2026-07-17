import type { LeaderRow } from './types';

export interface OwnerSummary {
  owner: string;
  teams: LeaderRow[];
  count: number;
  alive: number;
  bestPositionDisplay: string;
  bestPositionRank: number;
  bestTotal: number;
  invested: number;
}

export function summarizeOwners(rows: LeaderRow[], entryFee: number): OwnerSummary[] {
  const byOwner = new Map<string, LeaderRow[]>();
  for (const t of rows) {
    if (!byOwner.has(t.owner)) byOwner.set(t.owner, []);
    byOwner.get(t.owner)!.push(t);
  }
  const out: OwnerSummary[] = [];
  for (const [owner, teams] of byOwner) {
    const alive = teams.filter((t) => !t.eliminated);
    let bestPositionDisplay = 'CUT';
    let bestPositionRank = Number.POSITIVE_INFINITY;
    if (alive.length) {
      const best = alive.reduce((m, t) => ((t.position ?? 1e9) < (m.position ?? 1e9) ? t : m));
      bestPositionDisplay = best.positionDisplay;
      bestPositionRank = best.position ?? Number.POSITIVE_INFINITY;
    }
    out.push({
      owner,
      teams: [...teams].sort((a, b) => a.total - b.total),
      count: teams.length,
      alive: alive.length,
      bestPositionDisplay,
      bestPositionRank,
      bestTotal: Math.min(...teams.map((t) => t.total)),
      invested: teams.length * entryFee,
    });
  }
  return out;
}
