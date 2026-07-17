import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { CutProjection, GolferLite, Meta, TeamDetail, TeamRound } from '../lib/types';
import { Score } from '../components/Score';
import { Star } from '../components/Star';
import { fmtSalary, ROUND_LABELS, cutLabel, golferStatus } from '../lib/format';

function cutChip(g: GolferLite, line: number | null): { label: string; cls: string } | null {
  if (line === null || g.toPar === null || g.cut === 'wd') return null;
  if (g.cut === 'cut') return { label: 'Missed', cls: 'chip-out' };
  if (g.toPar < line) return { label: 'Inside', cls: 'chip-in' };
  if (g.toPar <= line + 1) return { label: 'Bubble', cls: 'chip-bubble' };
  return { label: 'Outside', cls: 'chip-out' };
}

export function TeamPage({
  id,
  refreshKey,
  onBack,
  onOpenOwner,
}: {
  id: string;
  refreshKey: number;
  onBack: () => void;
  onOpenTeam: (id: string) => void;
  onOpenOwner: (owner: string) => void;
}) {
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [cut, setCut] = useState<CutProjection | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.team(id);
        if (!alive) return;
        setTeam(data.team);
        setMeta(data.meta);
        setCut(data.cut);
        setErr(null);
      } catch (e) {
        if (alive) setErr(String(e));
      }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [id, refreshKey]);

  // Contribution: how many nines each golfer's score actually counted toward the team.
  const contribution = useMemo(() => {
    const m = new Map<string, number>();
    if (!team) return m;
    for (const r of team.rounds) {
      if (!r.played) continue;
      for (const row of r.rows) {
        m.set(row.golferId, (m.get(row.golferId) || 0) + (row.countF9 ? 1 : 0) + (row.countB9 ? 1 : 0));
      }
    }
    return m;
  }, [team]);

  if (err) return <div className="page"><div className="error">Could not load team: {err}</div></div>;
  if (!team) return <div className="page"><div className="loading">Loading team…</div></div>;

  const cutDanger = meta?.cutApplied ? team.cutMade < 3 : team.cutAtRisk;
  const contribValues = [...contribution.values()];
  const maxContrib = contribValues.length ? Math.max(...contribValues) : 0;
  const anyPlayed = team.playedCount > 0;

  return (
    <div className="page team-page">
      <button className="back" onClick={onBack}>← Leaderboard</button>

      <div className="team-header">
        <div className="team-head-main">
          <h1 className="team-title">
            <Star id={team.id} stop={false} /> {team.displayName}
            {team.live && <span className="live-badge">● LIVE</span>}
          </h1>
          <div className="team-sub">
            Owner: <button className="link-owner" onClick={() => onOpenOwner(team.owner)}>{team.owner}</button>
          </div>
          <div className="team-badges">
            <span className={`badge ${team.eliminated ? 'badge-red' : 'badge-green'}`}>
              {team.eliminated ? 'Eliminated' : 'Active'}
            </span>
            <span className="badge badge-plain">Salary {fmtSalary(team.totalSalary)}</span>
            <span className={`badge ${cutDanger ? 'badge-red' : 'badge-plain'}`}>
              {(cut?.applies && !cut?.official ? team.cutProjectedMade : team.cutMade)}/6 through cut
              {cut?.applies && !cut?.official ? ' (proj)' : ''}
            </span>
            <span className={`badge ${team.paid ? 'badge-green' : 'badge-red'}`}>{team.paid ? 'Paid' : 'Unpaid'}</span>
          </div>
        </div>
        <div className="team-head-score">
          <div className="team-total-label">Total</div>
          <div className="team-total"><Score value={team.total} strong /></div>
          <div className="team-daily-strip">
            {team.rounds.map((r) => (
              <div key={r.round} className={`daily-chip ${r.played ? '' : 'muted'} ${r.live ? 'live' : ''}`}>
                <span className="daily-chip-label">{ROUND_LABELS[r.round]}{r.live ? ' •' : ''}</span>
                <span className="daily-chip-val"><Score value={r.daily} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {cutDanger && (
        <div className="warn-banner">
          ⚠ Only {cut?.applies && !cut?.official ? team.cutProjectedMade : team.cutMade} golfer
          {(cut?.applies && !cut?.official ? team.cutProjectedMade : team.cutMade) === 1 ? '' : 's'} through the cut — needs 3 to survive.
        </div>
      )}

      {/* Roster: live status + who's carrying / dead weight */}
      <div className="roster-card">
        <table className="roster">
          <thead>
            <tr>
              <th className="rd-golfer">Golfer</th>
              <th>$</th>
              <th>Status</th>
              <th>Tot</th>
              {cut?.applies && <th>Cut</th>}
              <th>Counts</th>
            </tr>
          </thead>
          <tbody>
            {team.golfers.map((g) => {
              const c = contribution.get(g.id) || 0;
              const isMvp = anyPlayed && c > 0 && c === maxContrib;
              const isDead = anyPlayed && c === 0 && g.cut !== 'cut' && g.cut !== 'wd';
              const chip = cut?.applies ? cutChip(g, cut.line) : null;
              const mc = cutLabel(g.cut);
              return (
                <tr key={g.id} className={mc ? 'row-cut' : ''}>
                  <td className="rd-golfer">
                    {g.name}
                    {mc && <span className="mini-badge">{mc}</span>}
                    {isMvp && <span className="tag tag-mvp" title="Counted the most nines">MVP</span>}
                    {isDead && <span className="tag tag-dead" title="Hasn't counted toward a score">dead weight</span>}
                  </td>
                  <td className="dim">{fmtSalary(g.salary)}</td>
                  <td className="dim">{golferStatus(g)}</td>
                  <td><Score value={g.toPar} /></td>
                  {cut?.applies && <td>{chip && <span className={`chip ${chip.cls}`}>{chip.label}</span>}</td>}
                  <td className="dim">{c > 0 ? `${c}×` : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounds">
        {team.rounds.map((r) => <RoundCard key={r.round} round={r} />)}
      </div>

      {team.unmatched.length > 0 && (
        <div className="note">Unmatched golfers: {team.unmatched.map((u) => u.unmatched).join(', ')}</div>
      )}
    </div>
  );
}

function RoundCard({ round: r }: { round: TeamRound }) {
  return (
    <div className={`round-card ${r.played ? '' : 'round-card-empty'}`}>
      <div className="round-card-head">
        <h3>Round {r.round} · {ROUND_LABELS[r.round]}{r.live && <span className="live-badge sm">● LIVE</span>}</h3>
        <div className="round-daily">
          {r.played ? <Score value={r.daily} strong /> : <span className="tbd">—</span>}
        </div>
      </div>
      <table className="rd">
        <thead>
          <tr>
            <th className="rd-golfer">Golfer</th>
            <th>Front 9</th>
            <th>Back 9</th>
            <th>Rd</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row) => {
            const rd = row.f9 !== null || row.b9 !== null ? (row.f9 ?? 0) + (row.b9 ?? 0) : null;
            const mc = cutLabel(row.cut);
            return (
              <tr key={row.golferId} className={mc ? 'row-cut' : ''}>
                <td className="rd-golfer">{row.name} {mc && <span className="mini-badge">{mc}</span>}</td>
                <td className={row.countF9 ? 'counted' : 'dropped'}>
                  <Score value={row.f9} />{row.countF9 && <span className="dot" title="counts" />}
                </td>
                <td className={row.countB9 ? 'counted' : 'dropped'}>
                  <Score value={row.b9} />{row.countB9 && <span className="dot" title="counts" />}
                </td>
                <td className="rd-total"><Score value={rd} /></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="rd-golfer">Best 3 each nine</td>
            <td><Score value={r.f9Sum} strong /></td>
            <td><Score value={r.b9Sum} strong /></td>
            <td className="rd-total"><Score value={r.daily} strong /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
