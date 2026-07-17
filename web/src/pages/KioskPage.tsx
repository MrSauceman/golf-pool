import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { LeaderRow, Meta, CutProjection } from '../lib/types';
import { Score } from '../components/Score';
import { Movement } from '../components/Movement';
import { fmtScore, fmtMoney, ROUND_LABELS, timeAgo } from '../lib/format';

const PAGE_SIZE = 12;
const CYCLE_MS = 12000;

export function KioskPage({ onExit }: { onExit: () => void }) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [cut, setCut] = useState<CutProjection | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.leaderboard();
        if (!alive) return;
        setRows(data.teams.filter((t) => !t.eliminated));
        setMeta(data.meta);
        setCut(data.cut);
      } catch {
        /* ignore */
      }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => {
    const iv = setInterval(() => setPage((p) => (p + 1) % pageCount), CYCLE_MS);
    return () => clearInterval(iv);
  }, [pageCount]);

  const start = (page % pageCount) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  const atRisk = rows.filter((t) => t.cutAtRisk).length;

  return (
    <div className="kiosk">
      <div className="kiosk-head">
        <div>
          <div className="kiosk-title">The Open Championship 2026 · Golf Pool</div>
          <div className="kiosk-sub">
            {meta?.course} · Round {meta?.currentRound} · {meta?.eventStatus ?? ''}
            {cut?.line !== null && cut?.line !== undefined && (
              <> · {cut.official ? 'Cut' : 'Proj cut'} {fmtScore(cut.line)}{atRisk ? ` · ${atRisk} at risk` : ''}</>
            )}
          </div>
        </div>
        <div className="kiosk-meta">
          <div className="kiosk-page">{(page % pageCount) + 1}/{pageCount}</div>
          <div className="kiosk-upd">Updated {timeAgo(meta?.lastSync)}</div>
          <button className="kiosk-exit" onClick={onExit}>✕ Exit</button>
        </div>
      </div>

      <table className="kiosk-table">
        <thead>
          <tr>
            <th className="k-pos">Pos</th>
            <th className="k-mv"></th>
            <th className="k-team">Team</th>
            <th>{ROUND_LABELS[1]}</th>
            <th>{ROUND_LABELS[2]}</th>
            <th>{ROUND_LABELS[3]}</th>
            <th>{ROUND_LABELS[4]}</th>
            <th className="k-total">Total</th>
            <th className="k-prize">$</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((t) => (
            <tr key={t.id}>
              <td className="k-pos">{t.positionDisplay}</td>
              <td className="k-mv"><Movement delta={t.movement} /></td>
              <td className="k-team">
                {t.live && <span className="live-dot" />}{t.displayName}
                <span className="k-owner">{t.displayName !== t.owner ? t.owner : ''}</span>
              </td>
              <td><Score value={t.roundDailies[0]} /></td>
              <td><Score value={t.roundDailies[1]} /></td>
              <td><Score value={t.roundDailies[2]} /></td>
              <td><Score value={t.roundDailies[3]} /></td>
              <td className="k-total"><Score value={t.total} strong /></td>
              <td className="k-prize">{t.projectedPrize ? fmtMoney(t.projectedPrize) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
