import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { CutProjection, GolferFull } from '../lib/types';
import { Score } from '../components/Score';
import { fmtSalary, ROUND_LABELS, cutLabel, golferStatus } from '../lib/format';

type SortKey = 'salary' | 'total' | 'owned' | 'name';

function golferTotal(g: GolferFull): number | null {
  if (typeof g.toPar === 'number') return g.toPar;
  let sum = 0;
  let any = false;
  for (const r of [1, 2, 3, 4]) {
    const s = g.scores[String(r)];
    if (!s) continue;
    if (s.f9 !== null) { sum += s.f9; any = true; }
    if (s.b9 !== null) { sum += s.b9; any = true; }
  }
  return any ? sum : null;
}

export function GolfersPage({ refreshKey }: { refreshKey: number }) {
  const [golfers, setGolfers] = useState<GolferFull[]>([]);
  const [cut, setCut] = useState<CutProjection | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('salary');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.golfers();
        if (!alive) return;
        setGolfers(data.golfers);
        setCut(data.cut);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, [refreshKey]);

  const chalk = useMemo(
    () => [...golfers].sort((a, b) => b.ownedBy - a.ownedBy).slice(0, 8),
    [golfers]
  );
  const leverage = useMemo(
    () =>
      golfers
        .filter((g) => golferTotal(g) !== null && g.ownedPct < 0.15)
        .sort((a, b) => (golferTotal(a) ?? 99) - (golferTotal(b) ?? 99))
        .slice(0, 8),
    [golfers]
  );

  const rows = useMemo(() => {
    let r = golfers;
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      r = r.filter((g) => g.name.toLowerCase().includes(n));
    }
    return [...r].sort((a, b) => {
      switch (sort) {
        case 'salary': return b.salary - a.salary;
        case 'owned': return b.ownedBy - a.ownedBy;
        case 'name': return a.name.localeCompare(b.name);
        case 'total': {
          const ta = golferTotal(a); const tb = golferTotal(b);
          if (ta === null) return 1;
          if (tb === null) return -1;
          return ta - tb;
        }
        default: return 0;
      }
    });
  }, [golfers, q, sort]);

  const head = (key: SortKey, label: string) => (
    <th className={`sortable ${sort === key ? 'sorted' : ''}`} onClick={() => setSort(key)}>
      {label}{sort === key ? ' ▾' : ''}
    </th>
  );

  return (
    <div className="page">
      {golfers.length > 0 && (
        <div className="insights">
          <div className="insight-card">
            <h3>🍞 Chalk — the popular picks</h3>
            <p className="insight-sub">Most-owned across the pool, and how they're playing.</p>
            <ul className="insight-list">
              {chalk.map((g) => (
                <li key={g.id}>
                  <span className="il-name">{g.name}</span>
                  <span className="il-own">{Math.round(g.ownedPct * 100)}%</span>
                  <span className="il-score"><Score value={golferTotal(g)} /></span>
                </li>
              ))}
            </ul>
          </div>
          <div className="insight-card">
            <h3>💎 Leverage — low-owned & scoring</h3>
            <p className="insight-sub">Under 15% owned and playing well — the differentiators.</p>
            <ul className="insight-list">
              {leverage.length === 0 && <li className="dim">Nothing separating yet.</li>}
              {leverage.map((g) => (
                <li key={g.id}>
                  <span className="il-name">{g.name}</span>
                  <span className="il-own">{Math.round(g.ownedPct * 100)}%</span>
                  <span className="il-score"><Score value={golferTotal(g)} /></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="toolbar">
        <input className="search" placeholder="Search golfer…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted-note">{golfers.length} golfers in the field</span>
      </div>

      {loading && golfers.length === 0 ? (
        <div className="loading">Loading golfers…</div>
      ) : (
        <div className="table-wrap">
          <table className="lb golfers-table">
            <thead>
              <tr>
                {head('name', 'Golfer')}
                <th>Pos</th>
                <th>Status</th>
                {head('total', 'Total')}
                {[1, 2, 3, 4].map((rd) => (
                  <th key={rd} className="rnd-col">{ROUND_LABELS[rd]}<span className="fb">F / B</span></th>
                ))}
                {head('salary', '$')}
                {head('owned', 'Owned')}
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const mc = cutLabel(g.cut);
                return (
                  <tr key={g.id} className={mc ? 'row-cut' : ''}>
                    <td className="rd-golfer">
                      {g.name} {mc && <span className="mini-badge">{mc}</span>}
                      {cut?.applies && g.cutProjected === false && !mc && <span className="mini-badge warn">CUT?</span>}
                    </td>
                    <td className="dim">{g.position ?? '–'}</td>
                    <td className="dim">{golferStatus(g)}</td>
                    <td className="col-total"><Score value={golferTotal(g)} strong /></td>
                    {[1, 2, 3, 4].map((rd) => {
                      const s = g.scores[String(rd)];
                      return (
                        <td key={rd} className="fb-cell">
                          {s ? (
                            <span className="fb-pair"><Score value={s.f9} /><span className="slash">/</span><Score value={s.b9} /></span>
                          ) : (
                            <span className="dim">–</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="col-salary">{fmtSalary(g.salary)}</td>
                    <td className="dim">{g.ownedBy} <span className="pct">({Math.round(g.ownedPct * 100)}%)</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
