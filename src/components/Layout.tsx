import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { usePlan } from '../lib/plan';
import { Icon } from './Icon';

export function Logo() {
  return (
    <span className="logo">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 11l4 11 4-8 4 8 4-11" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Wayfare</span>
    </span>
  );
}

export function Layout() {
  const plan = usePlan();
  const loc = useLocation();
  const immersive = /\/(print|share)$/.test(loc.pathname);
  if (immersive) return <Outlet />;

  const links = [
    { to: '/', icon: 'globe', label: 'Journeys', end: true },
    { to: '/pro', icon: 'crown', label: plan.tier === 'pro' ? 'Membership' : 'Go Pro' },
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
        <div className="rail__foot">
          {plan.tier === 'pro' ? (
            <span className="badge badge--pro">
              <Icon name="crown" size={14} /> Pro member
            </span>
          ) : (
            <NavLink to="/pro" className="upsell">
              <strong>Wayfare Pro</strong>
              <span>Unlimited trips, print journals & watermark-free posters.</span>
            </NavLink>
          )}
        </div>
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
