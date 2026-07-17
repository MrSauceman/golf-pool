import { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api';
import type { Meta } from './lib/types';
import { timeAgo } from './lib/format';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { TeamPage } from './pages/TeamPage';
import { GolfersPage } from './pages/GolfersPage';
import { InfoPage } from './pages/InfoPage';
import { OwnersPage } from './pages/OwnersPage';
import { OwnerPage } from './pages/OwnerPage';
import { KioskPage } from './pages/KioskPage';
import { useTheme } from './lib/hooks';

type Route =
  | { name: 'leaderboard' }
  | { name: 'team'; id: string }
  | { name: 'owners' }
  | { name: 'owner'; owner: string }
  | { name: 'golfers' }
  | { name: 'info' }
  | { name: 'kiosk' };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'team' && parts[1]) return { name: 'team', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'owner' && parts[1]) return { name: 'owner', owner: decodeURIComponent(parts[1]) };
  if (parts[0] === 'owners') return { name: 'owners' };
  if (parts[0] === 'golfers') return { name: 'golfers' };
  if (parts[0] === 'info') return { name: 'info' };
  if (parts[0] === 'kiosk') return { name: 'kiosk' };
  return { name: 'leaderboard' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash());
  const [meta, setMeta] = useState<Meta | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tick, setTick] = useState(0); // bump to force page refetch
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const { meta } = await api.meta();
      setMeta(meta);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadMeta();
    const iv = setInterval(loadMeta, 30000);
    return () => clearInterval(iv);
  }, [loadMeta, tick]);

  const onSync = useCallback(async () => {
    setSyncing(true);
    try {
      await api.sync();
      await loadMeta();
      setTick((t) => t + 1);
    } finally {
      setSyncing(false);
    }
  }, [loadMeta]);

  const nav = (r: string) => (window.location.hash = r);
  const active = route.name;

  if (route.name === 'kiosk') {
    return <KioskPage onExit={() => nav('/')} />;
  }

  const syncHealthy = meta?.lastSyncOk !== false;
  const unmatched = meta?.unmatchedGolfers?.length ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" onClick={() => nav('/')} role="button">
            <span className="brand-jug">🏆</span>
            <div className="brand-text">
              <div className="brand-title">The Open Championship 2026</div>
              <div className="brand-sub">Golf Pool · {meta?.course ?? 'Royal Birkdale'}</div>
            </div>
          </div>

          <nav className="mainnav">
            <button className={active === 'leaderboard' || active === 'team' ? 'on' : ''} onClick={() => nav('/')}>
              Leaderboard
            </button>
            <button className={active === 'owners' || active === 'owner' ? 'on' : ''} onClick={() => nav('/owners')}>
              Owners
            </button>
            <button className={active === 'golfers' ? 'on' : ''} onClick={() => nav('/golfers')}>
              Golfers
            </button>
            <button className={active === 'info' ? 'on' : ''} onClick={() => nav('/info')}>
              Rules &amp; Prizes
            </button>
          </nav>

          <div className="sync">
            <div className="sync-meta">
              <span className={`round-pill r${meta?.currentRound ?? 1}`}>
                Round {meta?.currentRound ?? 1}
              </span>
              <span
                className={`sync-time ${syncHealthy ? '' : 'sync-bad'}`}
                title={
                  syncHealthy
                    ? `Live sync OK${unmatched ? ` · ${unmatched} golfer(s) unmatched` : ''}`
                    : `Last sync failed: ${meta?.lastSyncError ?? 'unknown'}`
                }
              >
                <span className={`sync-dot ${syncHealthy ? 'ok' : 'bad'}`} />
                {syncHealthy ? 'Updated' : 'Sync error'} {timeAgo(meta?.lastSync)}
                {syncHealthy && unmatched > 0 && <span className="sync-warn"> · {unmatched} unmatched</span>}
              </span>
            </div>
            <button className="icon-btn" title="Toggle dark mode" onClick={toggleTheme}>
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <button className="icon-btn" title="TV / kiosk mode" onClick={() => nav('/kiosk')}>
              📺
            </button>
            <button className="btn-sync" onClick={onSync} disabled={syncing}>
              {syncing ? 'Syncing…' : '↻ Sync'}
            </button>
          </div>
        </div>
      </header>

      <main className="content">
        {active === 'leaderboard' && <LeaderboardPage refreshKey={tick} onOpenTeam={(id) => nav(`/team/${id}`)} />}
        {active === 'team' && route.name === 'team' && (
          <TeamPage
            id={route.id}
            refreshKey={tick}
            onBack={() => nav('/')}
            onOpenTeam={(id) => nav(`/team/${id}`)}
            onOpenOwner={(o) => nav(`/owner/${encodeURIComponent(o)}`)}
          />
        )}
        {active === 'owners' && <OwnersPage refreshKey={tick} onOpenOwner={(o) => nav(`/owner/${encodeURIComponent(o)}`)} />}
        {active === 'owner' && route.name === 'owner' && (
          <OwnerPage
            owner={route.owner}
            refreshKey={tick}
            onBack={() => nav('/owners')}
            onOpenTeam={(id) => nav(`/team/${id}`)}
          />
        )}
        {active === 'golfers' && <GolfersPage refreshKey={tick} />}
        {active === 'info' && <InfoPage />}
      </main>

      <footer className="foot">
        <span>
          {meta ? `${meta.entries} entries · ${meta.owners} owners · $${meta.pot?.toLocaleString()} pot` : ''}
        </span>
        <span className="foot-dim">Live scores via ESPN · Round 1 from pool sheet</span>
      </footer>
    </div>
  );
}
