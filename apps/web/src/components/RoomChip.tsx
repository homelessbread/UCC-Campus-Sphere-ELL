import { STATUS } from './ui';
import { useCampus } from '../lib/campus';

/** A room name coloured by its live status. Selecting it highlights the room in the 3D building. */
export function RoomChip({
  classroomId,
  name,
  className = '',
}: {
  classroomId: string;
  name: string;
  className?: string;
}) {
  const c = useCampus();
  const status = c.statusOf(classroomId);
  const on = c.selected.includes(classroomId);
  return (
    <button
      type="button"
      onClick={() => c.select(classroomId, { view: true })}
      aria-pressed={on}
      title={
        status ? `${name}: ${STATUS[status]?.label ?? status}. Show in 3D.` : `${name}. Show in 3D.`
      }
      className={`rounded-md px-2 py-1 text-xs font-semibold ${status ? STATUS[status]?.cls : 'neo-sm text-ink'} ${on ? 'st-selected' : ''} ${className}`}
    >
      {name}
      {status && <span className="sr-only">, {STATUS[status]?.label}</span>}
    </button>
  );
}
