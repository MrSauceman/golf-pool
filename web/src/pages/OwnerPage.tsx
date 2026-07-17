import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { LeaderRow, Meta } from '../lib/types';
import { Score } from '../components/Score';
import { fmtMoney, ROUND_LABELS } from '../lib/format';

export function OwnerPage({
  owner,
  refreshKey,
  onBack,
  onOpenTeam,
}: {
  owner: string;
  refreshKey: number;
  onBack: () => void;
  onOpenTeam: (id: string) => void;
}) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
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

  const teams = useMemo(
    () => rows.filter((t) => t.owner === owner).sort((a, b) => a.total - b.total),
    [rows, owner]
  );

  const alive = teams.filter((t) => !t.eliminated);
  const best = alive.length
    ? alive.reduce((m, t) => ((t.position ?? 1e9) < (m.position ?? 1e9) ? t : m))
    : null;

  if (loading && rows.length === 0) return <div className="page"><div className="loading">Loading…</div></div>;
  if (teams.length === 0)
    return (
      <div className="page">
        <button className="back" onClick={onBack}>← Owners</button>
        <div className="empty">No teams found for “{owner}”.</div>
      </div>
    );

  return (
    <div className="page">
      <button className="back" onClick={onBack}>← Owners</button>

      <div className="owner-header">
        <h1 className="owner-title">{owner}</h1>
        <div className="owner-stats">
          <div className="ostat"><span className="ostat-num">{teams.length}</span><span className="ostat-lbl">Teams</span></div>
          <div className="ostat"><span className="ostat-num">{alive.length}</span><span className="ostat-lbl">Alive</span></div>
          <div className="ostat">
            <span className="ostat-num">{best ? best.positionDisplay : 'CUT'}</span>
            <span className="ostat-lbl">Best finish</span>
          </div>
          <div className="ostat"><span className="ostat-num">{fmtMoney(teams.length * (meta?.entryFee ?? 20))}</span><span className="ostat-lbl">In</span></div>
        </div>
      </div>

      <div className="owner-teams">
        {teams.map((t) => {
          const cutDanger = meta?.cutApplied && t.cutMade < 3;
          return (
            <button key={t.id} className={`owner-team-card ${t.eliminated ? 'elim' : ''}`} onClick={() => onOpenTeam(t.id)}>
              <div className="otc-pos">
                <span className={`pos ${t.eliminated ? 'pos-cut' : ''}`}>{t.positionDisplay}</span>
              </div>
              <div className="otc-main">
                <div className="otc-name">{t.displayName}</div>
                <div className="otc-dailies">
                  {t.roundDailies.map((d, i) => (
                    <span key={i} className="otc-chip">
                      <span className="otc-chip-lbl">{ROUND_LABELS[i + 1]}</span>
                      <Score value={d} />
                    </span>
                  ))}
                </div>
              </div>
              <div className="otc-right">
                <div className="otc-total"><Score value={t.total} strong /></div>
                <div className={`otc-cut ${cutDanger ? 'danger' : ''}`}>{t.cutMade}/6 cut</div>
              </div>
              <span className="otc-arrow">→</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
