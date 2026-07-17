import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { LeaderRow, Meta } from '../lib/types';
import { Score } from '../components/Score';
import { fmtMoney } from '../lib/format';
import { summarizeOwners } from '../lib/owners';

type SortKey = 'best' | 'name' | 'teams' | 'score';

export function OwnersPage({
  refreshKey,
  onOpenOwner,
}: {
  refreshKey: number;
  onOpenOwner: (owner: string) => void;
}) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('best');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.leaderboard();
        if (!alive) return;
        setRows(data.teams);
        setMeta(data.meta);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [refreshKey]);

  const owners = useMemo(() => {
    let list = summarizeOwners(rows, meta?.entryFee ?? 20);
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      list = list.filter((o) => o.owner.toLowerCase().includes(n));
    }
    list.sort((a, b) => {
      switch (sort) {
        case 'name': return a.owner.localeCompare(b.owner);
        case 'teams': return b.count - a.count || a.bestPositionRank - b.bestPositionRank;
        case 'score': return a.bestTotal - b.bestTotal;
        default: return a.bestPositionRank - b.bestPositionRank || a.bestTotal - b.bestTotal;
      }
    });
    return list;
  }, [rows, q, sort, meta]);

  const head = (key: SortKey, label: string) => (
    <th className={`sortable ${sort === key ? 'sorted' : ''}`} onClick={() => setSort(key)}>
      {label}{sort === key ? ' ▾' : ''}
    </th>
  );

  return (
    <div className="page">
      <div className="toolbar">
        <input className="search" placeholder="Search owner…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted-note">{owners.length} owners · {rows.length} entries</span>
      </div>
      {loading && rows.length === 0 ? (
        <div className="loading">Loading owners…</div>
      ) : (
        <div className="table-wrap">
          <table className="lb">
            <thead>
              <tr>
                {head('name', 'Owner')}
                {head('teams', 'Teams')}
                <th>Alive</th>
                {head('best', 'Best')}
                {head('score', 'Best score')}
                <th>In</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((o) => (
                <tr key={o.owner} className="lb-row" onClick={() => onOpenOwner(o.owner)}>
                  <td className="col-team">
                    <div className="team-name">{o.owner}</div>
                  </td>
                  <td>{o.count}</td>
                  <td>
                    <span className={`cutcount ${o.alive === 0 ? 'danger' : ''}`}>
                      {o.alive}/{o.count}
                    </span>
                  </td>
                  <td><span className={`pos ${o.alive === 0 ? 'pos-cut' : ''}`}>{o.bestPositionDisplay}</span></td>
                  <td className="col-total"><Score value={o.bestTotal} strong /></td>
                  <td className="col-salary">{fmtMoney(o.invested)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {owners.length === 0 && <div className="empty">No owners match “{q}”.</div>}
        </div>
      )}
    </div>
  );
}
