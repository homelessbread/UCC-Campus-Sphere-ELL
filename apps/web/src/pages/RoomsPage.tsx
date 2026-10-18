import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorBox, inputCls, Loading, STATUS, StatusPill } from '../components/ui';
import { Title } from '../components/Title';
import { api } from '../lib/api';
import { useCampus } from '../lib/campus';

export default function RoomsPage() {
  const q = useQuery({
    queryKey: ['status'],
    queryFn: () => api<any>('/availability/status'),
    refetchInterval: 60_000,
  });
  const [building, setBuilding] = useState('');
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');
  const campus = useCampus();

  if (q.isPending)
    return (
      <>
        <Title title="Rooms right now" />
        <Loading />
      </>
    );
  if (q.isError)
    return (
      <>
        <Title title="Rooms right now" />
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      </>
    );
  const d = q.data;
  const buildings = [
    ...new Map<string, string>(d.rooms.map((r: any) => [r.building.id, r.building.name])).entries(),
  ];
  const rooms = d.rooms
    .filter((r: any) => !building || r.building.id === building)
    .filter((r: any) => !state || r.status === state)
    .filter((r: any) => r.name.toLowerCase().includes(search.toLowerCase()));
  const byB = new Map<string, { name: string; floors: Map<number, any[]> }>();
  for (const r of rooms) {
    const b = byB.get(r.building.id) ?? { name: r.building.name, floors: new Map() };
    b.floors.set(r.floor.level, [...(b.floors.get(r.floor.level) ?? []), r]);
    byB.set(r.building.id, b);
  }
  const counts = [
    ['free', d.counts.free],
    ['occupied', d.counts.occupied],
    ['maintenance', d.counts.maintenance],
    ['inactive', d.counts.inactive],
  ] as const;

  return (
    <>
      <Title title="Rooms right now" text={d.basis} />
      <ul className="mb-4 flex flex-wrap gap-3">
        {counts.map(([k, v]) => (
          <li key={k}>
            <button
              onClick={() => setState(state === k ? '' : k)}
              aria-pressed={state === k}
              className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${state === k ? 'border-accent bg-surface' : 'border-transparent'}`}
            >
              <StatusPill status={k} />
              <span className="font-semibold tabular-nums">{v}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search for a room"
          aria-label="Search for a room"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${inputCls} max-w-56`}
          aria-label="Building"
          value={building}
          onChange={(e) => setBuilding(e.target.value)}
        >
          <option value="">All buildings</option>
          {buildings.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {rooms.length === 0 ? (
        <Empty title="No rooms match." text="Clear the search or status filter." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...byB.values()].map((b) => (
            <section key={b.name} className="neo p-3" aria-label={b.name}>
              <h2 className="font-heading mb-2 font-semibold">{b.name}</h2>
              {[...b.floors.entries()]
                .sort((a, c) => c[0] - a[0])
                .map(([level, rs]) => (
                  <div
                    key={level}
                    className="mb-1.5 flex items-start gap-2 border-t border-line pt-1.5"
                  >
                    <span className="w-14 shrink-0 pt-1.5 text-xs text-ink-mute">
                      Floor {level}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {rs.map((r: any) => (
                        <button
                          key={r.classroom_id}
                          onClick={() => campus.select(r.classroom_id, { view: true })}
                          aria-pressed={campus.selected.includes(r.classroom_id)}
                          title={`${r.name}: ${STATUS[r.status]?.label}. Show in 3D.`}
                          className={`rounded border px-2 py-1.5 text-xs ${STATUS[r.status]?.cls} ${campus.selected.includes(r.classroom_id) ? 'st-selected' : ''}`}
                        >
                          {r.name}
                          <span className="sr-only">, {STATUS[r.status]?.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </section>
          ))}
        </div>
      )}
      {(() => {
        const open = q.data.rooms.find((r: any) => r.classroom_id === campus.selected[0]);
        return open ? <RoomDetail room={open} onClose={() => campus.select(null)} /> : null;
      })()}
    </>
  );
}

function RoomDetail({ room: r, onClose }: { room: any; onClose: () => void }) {
  const cls = r.current;
  return (
    <section className="neo mt-4 p-4" aria-label={`Details for ${r.name}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{r.name}</h2>
        <div className="flex items-center gap-3">
          <StatusPill status={r.status} />
          <button className="text-xs font-medium text-accent-text underline" onClick={onClose}>
            Clear
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-ink-mute">Location</dt>
        <dd>
          {r.building.name}, floor {r.floor.level}
        </dd>
        <dt className="text-ink-mute">Room type</dt>
        <dd>{r.category.name}</dd>
        <dt className="text-ink-mute">Capacity</dt>
        <dd>{r.capacity} seats</dd>
        <dt className="text-ink-mute">Equipment</dt>
        <dd>
          {r.equipment.length
            ? r.equipment
                .map((e: any) => `${e.name}${e.quantity > 1 ? ` ×${e.quantity}` : ''}`)
                .join(', ')
            : 'None recorded'}
        </dd>
        {cls && (
          <>
            <dt className="text-ink-mute">Now</dt>
            <dd>
              {cls.label}
              {cls.teacher ? ` with ${cls.teacher}` : ''}, until {cls.ends_local}
            </dd>
          </>
        )}
        {r.status === 'free' && r.free_until_local && (
          <>
            <dt className="text-ink-mute">Free until</dt>
            <dd>{r.free_until_local}</dd>
          </>
        )}
        {r.status === 'occupied' && r.available_from_local && (
          <>
            <dt className="text-ink-mute">Free again</dt>
            <dd>{r.available_from_local}</dd>
          </>
        )}
        {r.next_class && (
          <>
            <dt className="text-ink-mute">Next class</dt>
            <dd>
              {r.next_class.label}, {r.next_class.starts_local}
            </dd>
          </>
        )}
      </dl>
      <Link
        to={`/timetable?room=${r.classroom_id}`}
        className="mt-4 inline-block text-sm font-medium text-accent-text underline"
      >
        See this room's timetable
      </Link>
    </section>
  );
}
