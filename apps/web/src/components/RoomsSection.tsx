import { NavLink, Outlet } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

const TABS: [string, string, IconName][] = [
  ['/', 'Rooms now', 'rooms'],
  ['/find', 'Find a room', 'find'],
  ['/subjects', 'Subjects', 'subjects'],
];

/** One Rooms section: the three room tools sit side by side as sub-tabs and keep their own addresses. */
export default function RoomsSection() {
  return (
    <>
      <nav
        aria-label="Rooms"
        className="neo-in mb-5 flex w-full gap-1 overflow-x-auto p-1 sm:w-fit"
      >
        {TABS.map(([to, label, icon]) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${isActive ? 'bg-accent text-on-accent' : 'text-ink-soft hover:bg-raised hover:text-ink'}`
            }
          >
            <Icon name={icon} />
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
