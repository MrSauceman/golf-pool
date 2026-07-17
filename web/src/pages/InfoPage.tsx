import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Meta, Prize } from '../lib/types';
import { fmtMoney } from '../lib/format';

export function InfoPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);

  useEffect(() => {
    api.meta().then((d) => {
      setMeta(d.meta);
      setPrizes(d.prizes.sort((a, b) => a.rank - b.rank));
    });
  }, []);

  return (
    <div className="page info-page">
      <div className="info-grid">
        <section className="card">
          <h2>Scoring</h2>
          <ul className="rules">
            <li>Each team is <strong>6 golfers</strong>, total salary <strong>≤ $50</strong>.</li>
            <li>Each day, your <strong>best 3 front-nine</strong> and <strong>best 3 back-nine</strong> to-par scores count.</li>
            <li>Daily score = sum of those 6 nines. Four rounds are added together.</li>
            <li><strong>Lowest 4-round total wins.</strong></li>
            <li>You must have <strong>at least 3 golfers make the cut</strong> or you're eliminated.</li>
            <li>Ties broken by Sunday back 9, then Sunday front 9, then backwards through the rounds.</li>
            <li>Player WDs before starting → next golfer on the list. WD after starting → no replacement.</li>
          </ul>
        </section>

        <section className="card">
          <h2>Prize Pool</h2>
          <div className="pot-line">
            {fmtMoney(meta?.pot)} <span className="dim">· {meta?.entries} entries × ${meta?.entryFee}</span>
          </div>
          <table className="prize-table">
            <thead><tr><th>Place</th><th>Prize</th></tr></thead>
            <tbody>
              {prizes.map((p) => (
                <tr key={p.rank}>
                  <td>{p.rank}{ordinal(p.rank)}</td>
                  <td>{fmtMoney(p.amount)}</td>
                </tr>
              ))}
              {prizes.length === 0 && <tr><td colSpan={2} className="dim">Prizes TBD by entry count.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Tournament</h2>
          <dl className="deflist">
            <dt>Event</dt><dd>{meta?.event ?? 'The Open Championship 2026'}</dd>
            <dt>Course</dt><dd>{meta?.course ?? 'Royal Birkdale'} · Par {meta?.par ?? 70}</dd>
            <dt>Nines</dt><dd>Front par {meta?.parFront ?? 34} · Back par {meta?.parBack ?? 36}</dd>
            <dt>Status</dt><dd>{meta?.eventStatus ?? '—'} (Round {meta?.currentRound ?? 1})</dd>
          </dl>
        </section>

        <section className="card">
          <h2>Payment</h2>
          <p>$20 per team</p>
          <p className="dim">Due before the first tee time Thursday.</p>
        </section>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
