import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

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

export default function Layout() {
  const { me, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <header className="flex items-center justify-between bg-ucc-deep px-4 py-3 text-white md:hidden">
        <span className="font-heading font-semibold">CampusSphere</span>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="nav"
          className="rounded border border-white/40 px-3 py-1 text-sm"
        >
          Menu
        </button>
      </header>
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
      <main className="min-w-0 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
