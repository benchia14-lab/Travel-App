import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { useAccount } from '../lib/account';
import { useSyncStatus } from '../lib/sync';

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="logo">
      <img src="./icon.svg" width={size} height={size} alt="" className="logo__mark" />
      <span className="logo__word">
        PYT
        <small>Plan Your Travel</small>
      </span>
    </span>
  );
}

export function Layout() {
  const loc = useLocation();
  const { profile } = useAccount();
  const sync = useSyncStatus();
  const immersive = /\/(print|share)$/.test(loc.pathname);
  if (immersive) return <Outlet />;

  const links = [
    { to: '/', icon: 'globe', label: 'Journeys', end: true },
    ...(profile?.is_admin ? [{ to: '/admin', icon: 'crown', label: 'Admin' }] : []),
    { to: '/settings', icon: 'settings', label: 'Settings' },
  ];

  return (
    <div className="shell">
      <aside className="rail">
        <NavLink to="/" className="rail__brand">
          <Logo />
        </NavLink>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="rail__link">
              <Icon name={l.icon} />
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
        {profile && (
          <NavLink to="/settings" className="rail__me">
            <span className="avatar">{profile.first_name[0]}{profile.last_name[0]}</span>
            <span>
              <strong>{profile.first_name} {profile.last_name}</strong>
              <SyncLabel state={sync.state} pending={sync.pending} />
            </span>
          </NavLink>
        )}
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <nav className="tabbar">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="tabbar__link">
            <Icon name={l.icon} size={22} />
            <span>{l.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function SyncLabel({ state, pending }: { state: string; pending: number }) {
  const text =
    state === 'syncing'
      ? 'Syncing…'
      : state === 'offline'
        ? `Offline${pending ? ` · ${pending} to upload` : ''}`
        : state === 'error'
          ? 'Sync problem'
          : pending
            ? `${pending} change${pending === 1 ? '' : 's'} to upload`
            : 'All synced';
  return <small className={`sync sync--${state}`}><i />{text}</small>;
}
