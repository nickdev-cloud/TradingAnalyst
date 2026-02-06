import { Link, useLocation } from 'react-router-dom';

const nav = [
  { to: '/', label: 'Dashboard' },
  { to: '/settings', label: 'Settings' },
  { to: '/trades', label: 'Trades' },
];

export default function Layout({ children }) {
  const loc = useLocation();
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h2 className="sidebar-brand">Trading Strategy</h2>
        <nav className="sidebar-nav">
          {nav.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={loc.pathname === to ? 'active' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
