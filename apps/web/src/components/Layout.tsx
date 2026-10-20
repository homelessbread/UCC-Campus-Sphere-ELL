import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import CampusPanel from './CampusPanel';
import GlobalSearch from './GlobalSearch';
import { Icon, type IconName } from './Icon';

const NAV: [string, string, IconName][] = [
  ['/', 'Rooms now', 'rooms'],
  ['/find', 'Find a room', 'find'],
  ['/timetable', 'Timetable', 'calendar'],
  ['/teachers', 'Teachers', 'teachers'],
  ['/subjects', 'Subjects', 'subjects'],
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-accent text-on-accent' : 'text-ink-soft hover:text-ink'}`;
  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-[1600px] px-4 pt-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="shrink-0">
            <p className="font-heading text-xl leading-tight font-bold text-ink">
              UCC CampusSphere
            </p>
            <p className="text-xs text-accent-text">Explore. Locate. Learn.</p>
          </div>
          <div className="order-last w-full min-w-0 md:order-none md:max-w-xl md:flex-1">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggle}
              aria-pressed={theme === 'light'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="neo-sm flex items-center gap-2 px-3 py-2 text-sm text-ink-soft hover:text-ink"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              <span className="hidden sm:inline">
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </span>
              <span className="sr-only sm:hidden">
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </span>
            </button>
            <button
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls="site-nav"
              className="neo-sm flex items-center gap-2 px-3 py-2 text-sm md:hidden"
            >
              <Icon name={open ? 'x' : 'menu'} />
              Menu
            </button>
          </div>
        </div>
        <nav
          id="site-nav"
          aria-label="Main"
          className={`${open ? 'flex' : 'hidden'} neo-in mt-3 w-full flex-col gap-1 p-1 md:flex md:w-fit md:flex-row`}
        >
          {NAV.map(([to, label, icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={link}
              onClick={() => setOpen(false)}
            >
              <Icon name={icon} />
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
