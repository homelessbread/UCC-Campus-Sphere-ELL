import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import AdminSearch from './AdminSearch';

const THEME_KEY = 'ucc-admin-theme';

const NAV: { group: string; items: [string, string][] }[] = [
  { group: 'Overview', items: [['/admin', 'Dashboard']] },
  {
    group: 'Schedule',
    items: [
      ['/admin/schedules', 'Class schedules'],
      ['/admin/timetable', 'Timetable'],
      ['/admin/holidays', 'Holidays'],
      ['/admin/cancellations', 'Cancelled classes'],
      ['/admin/exceptions', 'One-date changes'],
    ],
  },
  {
    group: 'Campus',
    items: [
      ['/admin/buildings', 'Buildings'],
      ['/admin/floors', 'Floors'],
      ['/admin/classrooms', 'Classrooms'],
      ['/admin/maintenance', 'Maintenance'],
    ],
  },
  {
    group: 'Academics',
    items: [
      ['/admin/terms', 'Academic terms'],
      ['/admin/subjects', 'Subjects'],
      ['/admin/sections', 'Sections'],
    ],
  },
  {
    group: 'Equipment',
    items: [
      ['/admin/equipment-types', 'Equipment types'],
      ['/admin/room-equipment', 'Room equipment'],
      ['/admin/subject-requirements', 'Subject requirements'],
    ],
  },
  {
    group: 'People',
    items: [
      ['/admin/teachers', 'Teachers'],
      ['/admin/users', 'Users'],
    ],
  },
];

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function Layout() {
  const { me, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem(THEME_KEY) as 'dark' | 'light') ?? 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* choice just is not remembered */ }
  }, [theme]);

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      {/* Mobile header */}
      <header className="flex items-center justify-between bg-ucc-deep px-4 py-3 text-white md:hidden">
        <span className="font-heading font-semibold">CampusSphere</span>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded border border-white/40 p-1.5 text-white/80 hover:text-white"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="nav"
            className="rounded border border-white/40 px-3 py-1 text-sm"
          >
            Menu
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        id="nav"
        className={`${open ? 'block' : 'hidden'} bg-ucc-deep text-white md:sticky md:top-0 md:block md:h-screen md:overflow-y-auto`}
      >
        <div className="hidden px-4 pt-5 pb-3 md:block">
          <p className="font-heading text-lg font-bold">UCC CampusSphere</p>
          <p className="text-xs text-white/70">Administration</p>
        </div>
        <nav aria-label="Admin" className="pb-4">
          {NAV.map((g) => (
            <div
              key={g.group}
              className="mt-1 border-t-4 border-white/90 pt-2 first:mt-0 first:border-t-0"
            >
              <p className="px-4 pb-1 text-xs text-white/70">{g.group}</p>
              {g.items.map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/admin'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block border-l-4 px-4 py-1.5 text-sm ${isActive ? 'border-ucc-orange bg-white/15 font-medium' : 'border-transparent hover:bg-white/10'}`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/20 px-4 py-3 text-xs">
          <p className="truncate">{me?.fullName ?? me?.email}</p>
          <button onClick={signOut} className="mt-1 underline">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-col" style={{ background: 'var(--bg)' }}>
        {/* Top bar with search + theme toggle */}
        <div
          className="hidden md:flex items-center justify-between gap-3 px-6 py-3"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}
        >
          <AdminSearch />
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-md p-2 transition-colors hover:opacity-70"
            style={{ color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)' }}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
