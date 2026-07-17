import type { LeaderRow, Meta, Prize, TeamDetail, GolferFull, CutProjection } from './types';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  leaderboard: () =>
    get<{ meta: Meta; teams: LeaderRow[]; prizes: Prize[]; cut: CutProjection; updatedAt: string }>('/api/leaderboard'),
  team: (id: string) => get<{ meta: Meta; cut: CutProjection; team: TeamDetail }>(`/api/teams/${id}`),
  golfers: () => get<{ meta: Meta; cut: CutProjection; golfers: GolferFull[] }>('/api/golfers'),
  meta: () => get<{ meta: Meta; prizes: Prize[] }>('/api/meta'),
  sync: () => post<{ ok: boolean; matched?: number; updated?: number; eventStatus?: string; reason?: string }>('/api/sync'),
  setScore: (id: string, round: number, f9: number | null, b9: number | null) =>
    post(`/api/golfers/${id}/score`, { round, f9, b9 }),
};
