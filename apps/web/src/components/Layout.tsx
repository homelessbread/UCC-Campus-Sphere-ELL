import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import CampusPanel from './CampusPanel';
import GlobalSearch from './GlobalSearch';
import { Icon, type IconName } from './Icon';

/** Rooms covers Rooms now, Find a room and Subjects (sub-tabs inside the page). */
const NAV: { to: string; label: string; icon: IconName; also?: string[] }[] = [
  { to: '/', label: 'Rooms', icon: 'rooms', also: ['/find', '/subjects'] },
  { to: '/timetable', label: 'Timetable', icon: 'calendar' },
  { to: '/teachers', label: 'Teachers', icon: 'teachers' },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const isOn = (n: (typeof NAV)[number]) =>
    n.to === '/' ? ['/', ...(n.also ?? [])].includes(pathname) : pathname.startsWith(n.to);
  const link = (on: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${on ? 'bg-accent text-on-accent' : 'text-ink-soft hover:bg-raised hover:text-ink'}`;
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <header className="neo flex items-center justify-between rounded-none border-x-0 border-t-0 px-4 py-3 md:hidden">
        <p className="text-base font-bold text-ink">UCC CampusSphere</p>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="site-nav"
          className="neo-sm flex items-center gap-2 px-3 py-2 text-sm"
        >
          <Icon name={open ? 'x' : 'menu'} />
          Menu
        </button>
      </header>
      <aside
        id="site-nav"
        className={`${open ? 'block' : 'hidden'} border-line bg-surface md:sticky md:top-0 md:block md:h-screen md:overflow-y-auto md:border-r`}
      >
        <div className="hidden px-5 pt-6 pb-5 md:block">
          <p className="text-lg leading-tight font-bold tracking-tight text-ink">
            UCC CampusSphere
          </p>
          <p className="mt-0.5 text-xs font-medium text-accent-text">Explore. Locate. Learn.</p>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1 px-3 pb-4">
          {NAV.map((n) => {
            const on = isOn(n);
            return (
              <NavLink
                key={n.to}
                to={n.to}
                aria-current={on ? 'page' : undefined}
                className={link(on)}
                onClick={() => setOpen(false)}
              >
                <Icon name={n.icon} />
                {n.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-line mt-2 border-t px-3 py-4">
          <button
            onClick={toggle}
            aria-pressed={theme === 'light'}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-raised hover:text-ink"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="px-4 pt-4 lg:px-6">
          <div className="max-w-xl">
            <GlobalSearch />
          </div>
        </div>
        <div className="grid gap-6 px-4 py-6 lg:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,44%)]">
          <main className="min-w-0">
            <Outlet />
          </main>
          {/* Mounted once here, outside the routed pages, so it keeps its state between pages. */}
          <CampusPanel />
        </div>
        <footer className="px-4 pb-8 text-xs text-ink-mute lg:px-6">
          Room status comes from recorded class schedules, holidays and maintenance. It does not
          show who is physically in a room. Times are Philippine time.
        </footer>
      </div>
    </div>
  );
}
