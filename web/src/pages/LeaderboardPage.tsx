import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { LeaderRow, Meta, Prize, CutProjection } from '../lib/types';
import { Score } from '../components/Score';
import { Star } from '../components/Star';
import { Movement } from '../components/Movement';
import { Modal } from '../components/Modal';
import { useFavorites } from '../lib/favorites';
import { useChanged } from '../lib/hooks';
import { fmtScore, fmtMoney, ROUND_LABELS } from '../lib/format';

type SortKey = 'order' | 'total' | 'r1' | 'r2' | 'r3' | 'r4' | 'cut' | 'prize';
type View = 'all' | 'mine' | 'risk';

const TIEBREAK_LABELS = ['Sun B9', 'Sun F9', 'Sat B9', 'Sat F9', 'Fri B9', 'Fri F9', 'Thu B9', 'Thu F9'];

function FlashScore({ value, strong }: { value: number | null; strong?: boolean }) {
  const changed = useChanged(value);
  return (
    <span className={changed ? 'flash' : ''}>
      <Score value={value} strong={strong} />
    </span>
  );
}

export function LeaderboardPage({
  refreshKey,
  onOpenTeam,
}: {
  refreshKey: number;
  onOpenTeam: (id: string) => void;
}) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [cut, setCut] = useState<CutProjection | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('order');
  const [view, setView] = useState<View>('all');
  const [showElim, setShowElim] = useState(true);
  const [tieGroup, setTieGroup] = useState<LeaderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const { has: isFav, count: favCount } = useFavorites();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.leaderboard();
        if (!alive) return;
        setRows(data.teams);
        setMeta(data.meta);
        setPrizes(data.prizes || []);
        setCut(data.cut);
        setErr(null);
      } catch (e) {
        if (alive) setErr(String(e));
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

  const lastPaidRank = prizes.length ? Math.max(...prizes.map((p) => p.rank)) : 0;
  const atRiskCount = rows.filter((t) => t.cutAtRisk).length;

  const filtered = useMemo(() => {
    let r = rows;
    if (!showElim) r = r.filter((t) => !t.eliminated);
    if (view === 'mine') r = r.filter((t) => isFav(t.id));
    if (view === 'risk') r = r.filter((t) => t.cutAtRisk);
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      r = r.filter((t) => t.displayName.toLowerCase().includes(n) || t.owner.toLowerCase().includes(n));
    }
    if (sort !== 'order') {
      const val = (t: LeaderRow): number => {
        switch (sort) {
          case 'total': return t.total;
          case 'r1': return t.roundDailies[0] ?? 999;
          case 'r2': return t.roundDailies[1] ?? 999;
          case 'r3': return t.roundDailies[2] ?? 999;
          case 'r4': return t.roundDailies[3] ?? 999;
          case 'cut': return -t.cutMade;
          case 'prize': return -(t.projectedPrize ?? -1);
          default: return t.order;
        }
      };
      r = [...r].sort((a, b) => val(a) - val(b));
    }
    return r;
  }, [rows, q, sort, view, showElim, isFav]);

  const leader = rows.find((t) => !t.eliminated);
  const aliveCount = rows.filter((t) => !t.eliminated).length;
  const showDivider = sort === 'order' && view === 'all' && !q.trim() && lastPaidRank > 0;

  const openTie = (row: LeaderRow) => {
    setTieGroup(rows.filter((t) => !t.eliminated && t.total === row.total));
  };

  const header = (key: SortKey, label: string, hint?: string) => (
    <th className={`sortable ${sort === key ? 'sorted' : ''}`} onClick={() => setSort(key)} title={hint}>
      {label}{sort === key ? ' ▾' : ''}
    </th>
  );

  return (
    <div className="page">
      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Leader</div>
          <div className="kpi-value">
            {leader ? leader.displayName : '–'} {leader && <Score value={leader.total} strong />}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Entries alive</div>
          <div className="kpi-value">{aliveCount} <span className="kpi-dim">/ {rows.length}</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Prize pool</div>
          <div className="kpi-value">{fmtMoney(meta?.pot)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{cut?.official ? 'Cut line' : 'Projected cut'}</div>
          <div className="kpi-value">{cut?.line !== null && cut?.line !== undefined ? fmtScore(cut.line) : '–'}</div>
        </div>
      </div>

      {cut && cut.line !== null && (
        <div className={`cut-banner ${atRiskCount > 0 ? 'has-risk' : ''}`}>
          <span className="cut-flag">✂</span>
          <span>
            {cut.official ? 'Cut is set' : cut.applies ? 'Projected cut' : 'Projected cut line'}:{' '}
            <strong>{fmtScore(cut.line)}</strong> <span className="cut-rule">({cut.rule})</span>
          </span>
          {cut.applies && (
            <span className="cut-risk">
              {atRiskCount > 0
                ? `${atRiskCount} team${atRiskCount === 1 ? '' : 's'} at risk (under 3 through)`
                : 'All teams safe for now'}
            </span>
          )}
          {!cut.applies && <span className="cut-rule">Updates live during Round 2</span>}
        </div>
      )}

      <div className="toolbar">
        <input className="search" placeholder="Search team or owner…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="segmented">
          <button className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>All</button>
          <button className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>★ Mine{favCount ? ` (${favCount})` : ''}</button>
          <button className={`${view === 'risk' ? 'on' : ''} ${atRiskCount ? 'danger' : ''}`} onClick={() => setView('risk')}>
            At risk{atRiskCount ? ` (${atRiskCount})` : ''}
          </button>
        </div>
        <label className="chk">
          <input type="checkbox" checked={showElim} onChange={(e) => setShowElim(e.target.checked)} /> Show eliminated
        </label>
        {sort !== 'order' && <button className="btn-ghost" onClick={() => setSort('order')}>Reset sort</button>}
      </div>

      {err && <div className="error">Could not load leaderboard: {err}</div>}
      {loading && rows.length === 0 ? (
        <div className="loading">Loading leaderboard…</div>
      ) : (
        <div className="table-wrap">
          <table className="lb">
            <thead>
              <tr>
                <th className="col-star"></th>
                <th className="col-pos">Pos</th>
                <th className="col-mv" title="Movement since last round">Δ</th>
                <th className="col-team">Team</th>
                {header('r1', ROUND_LABELS[1])}
                {header('r2', ROUND_LABELS[2])}
                {header('r3', ROUND_LABELS[3])}
                {header('r4', ROUND_LABELS[4])}
                {header('total', 'Total')}
                {header('prize', '$')}
                {header('cut', 'Cut', 'Golfers through the cut')}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const rowEls = (
                  <tr
                    key={t.id}
                    className={`lb-row ${t.eliminated ? 'elim' : ''} ${isFav(t.id) ? 'fav' : ''} ${t.cutAtRisk ? 'at-risk' : ''}`}
                    onClick={() => onOpenTeam(t.id)}
                  >
                    <td className="col-star"><Star id={t.id} /></td>
                    <td className="col-pos">
                      <span className={`pos ${t.eliminated ? 'pos-cut' : ''}`}>{t.positionDisplay}</span>
                      {t.isTie && !t.eliminated && (
                        <button className="tie-info" title="Tiebreaker detail" onClick={(e) => { e.stopPropagation(); openTie(t); }}>ⓘ</button>
                      )}
                    </td>
                    <td className="col-mv"><Movement delta={t.movement} /></td>
                    <td className="col-team">
                      <div className="team-name">
                        {t.live && <span className="live-dot" title="Live" />}
                        {t.displayName}
                      </div>
                      {t.displayName !== t.owner && <div className="team-owner">{t.owner}</div>}
                    </td>
                    <td><FlashScore value={t.roundDailies[0]} /></td>
                    <td><FlashScore value={t.roundDailies[1]} /></td>
                    <td><FlashScore value={t.roundDailies[2]} /></td>
                    <td><FlashScore value={t.roundDailies[3]} /></td>
                    <td className="col-total"><FlashScore value={t.total} strong /></td>
                    <td className="col-prize">{t.projectedPrize ? fmtMoney(t.projectedPrize) : ''}</td>
                    <td>
                      <span className={`cutcount ${t.cutAtRisk ? 'danger' : ''}`}>
                        {(cut?.applies && !cut?.official ? t.cutProjectedMade : t.cutMade)}/6
                      </span>
                    </td>
                  </tr>
                );
                if (showDivider && t.paidRank === lastPaidRank) {
                  return [
                    rowEls,
                    <tr key="moneyline" className="moneyline">
                      <td colSpan={11}>— in the money: top {lastPaidRank} paid —</td>
                    </tr>,
                  ];
                }
                return rowEls;
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="empty">
              {view === 'mine' ? 'No favorites yet — tap ☆ on any team to follow it.' : `No teams match.`}
            </div>
          )}
        </div>
      )}

      {tieGroup && (
        <Modal title={`Tiebreaker · ${fmtScore(tieGroup[0].total)} (${tieGroup.length} teams)`} onClose={() => setTieGroup(null)}>
          <p className="modal-note">Ties break by Sunday back 9, then Sunday front 9, then backwards. Lower wins; the deciding column is highlighted.</p>
          <div className="table-wrap">
            <table className="tb-table">
              <thead>
                <tr>
                  <th>Pos</th><th>Team</th>
                  {TIEBREAK_LABELS.map((l) => <th key={l}>{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {tieGroup.map((t) => {
                  const decideIdx = firstDecidingIndex(tieGroup);
                  return (
                    <tr key={t.id}>
                      <td className="pos">{t.positionDisplay}</td>
                      <td className="tb-name">{t.displayName}</td>
                      {t.tiebreak.map((v, i) => (
                        <td key={i} className={i === decideIdx ? 'decide' : ''}><Score value={v} /></td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}

function firstDecidingIndex(group: LeaderRow[]): number {
  if (group.length < 2) return -1;
  for (let i = 0; i < group[0].tiebreak.length; i++) {
    const vals = new Set(group.map((t) => t.tiebreak[i]));
    if (vals.size > 1) return i;
  }
  return -1;
}
