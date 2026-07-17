// Client-side data layer. Keeps the exact shape the pages already consume, but
// computes everything in the browser from the static data.json + live ESPN sync
// instead of calling a backend. (Formerly HTTP calls to an Express server.)
import type { LeaderRow, Meta, Prize, TeamDetail, GolferFull, CutProjection } from './types';
import { ensureState, runSync } from './store';
import { leaderboardSummary, computeTeam, cutProjection, computeCutLine } from './scoring';
import type { SyncResult } from './espn';

export const api = {
  leaderboard: async (): Promise<{
    meta: Meta;
    teams: LeaderRow[];
    prizes: Prize[];
    cut: CutProjection;
    updatedAt: string;
  }> => {
    const s = await ensureState();
    return {
      meta: s.meta,
      teams: leaderboardSummary(s),
      prizes: s.prizes,
      cut: cutProjection(s),
      updatedAt: new Date().toISOString(),
    };
  },

  team: async (id: string): Promise<{ meta: Meta; cut: CutProjection; team: TeamDetail }> => {
    const s = await ensureState();
    const team = s.teams.find((t) => t.id === id);
    if (!team) throw new Error('team not found');
    const cutLine = computeCutLine(s.golfers);
    return { meta: s.meta, cut: cutProjection(s), team: computeTeam(team, s.golfers, s.meta, cutLine) };
  },

  golfers: async (): Promise<{ meta: Meta; cut: CutProjection; golfers: GolferFull[] }> => {
    const s = await ensureState();
    const cutLine = computeCutLine(s.golfers);
    const golfers: GolferFull[] = Object.values(s.golfers).map((g) => ({
      id: g.id,
      name: g.name,
      salary: g.salary,
      scores: g.scores,
      cut: g.cut,
      position: g.position,
      thru: g.thru,
      teeTime: g.teeTime ?? null,
      roundState: g.roundState ?? null,
      today: g.today,
      totalToPar: g.totalToPar,
      toPar: g.toPar ?? null,
      cutProjected: cutLine !== null && typeof g.toPar === 'number' ? g.toPar <= cutLine : null,
      ownedBy: g.ownedBy || 0,
      ownedPct: g.ownedPct || 0,
    }));
    return { meta: s.meta, cut: cutProjection(s), golfers };
  },

  meta: async (): Promise<{ meta: Meta; prizes: Prize[] }> => {
    const s = await ensureState();
    return { meta: s.meta, prizes: s.prizes };
  },

  sync: (): Promise<SyncResult> => runSync(),
};
