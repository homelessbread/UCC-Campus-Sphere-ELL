import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import CampusPanel from './CampusPanel';

const NAV: [string, string][] = [
  ['/', 'Rooms now'],
  ['/find', 'Find a room'],
  ['/timetable', 'Timetable'],
  ['/teachers', 'Teachers'],
  ['/subjects', 'Subjects'],
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const link = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-accent text-on-accent' : 'text-ink-soft hover:text-ink'}`;
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-4">
        <div>
          <p className="font-heading text-xl leading-tight font-bold text-ink">UCC CampusSphere</p>
          <p className="text-xs text-accent-text">Explore. Locate. Learn.</p>
        </div>
        <div className="flex items-center gap-2 md:order-last">
          <button
            onClick={toggle}
            aria-pressed={theme === 'light'}
            className="neo-sm px-3 py-1.5 text-sm text-ink-soft hover:text-ink"
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="site-nav"
            className="neo-sm px-3 py-1.5 text-sm md:hidden"
          >
            Menu
          </button>
        </div>
        <nav
          id="site-nav"
          aria-label="Main"
          className={`${open ? 'flex' : 'hidden'} neo-in w-full flex-col gap-1 p-1 md:flex md:w-auto md:flex-row`}
        >
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={link}
              onClick={() => setOpen(false)}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(440px,46%)]">
        <main className="min-w-0">
          <Outlet />
        </main>
        {/* Mounted once here, outside the routed pages, so it keeps its state between pages. */}
        <CampusPanel />
      </div>
      <footer className="mx-auto max-w-[1600px] px-4 pb-8 text-xs text-ink-mute">
        Room status comes from recorded class schedules, holidays and maintenance. It does not show
        who is physically in a room. Times are Philippine time.
      </footer>
    </div>
  );
}
