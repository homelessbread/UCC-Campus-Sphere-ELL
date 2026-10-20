import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, STATUS_ICON } from '../components/Icon';
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
    .filter((r: any) => !state || r.status === state);
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
      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Quick find">
        <span className="text-sm font-medium text-ink-soft">Need a room?</span>
        {(
          [
            ['now', 'Free now'],
            ['30', 'Free for 30 minutes'],
            ['60', 'Free for 1 hour'],
          ] as const
        ).map(([p, label]) => (
          <Link
            key={p}
            to={`/find?preset=${p}`}
            className="neo-sm flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-ink hover:text-accent-text"
          >
            <Icon name="find" />
            {label}
          </Link>
        ))}
        <Link
          to="/timetable"
          className="neo-sm flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-ink hover:text-accent-text"
        >
          <Icon name="calendar" />
          Timetable
        </Link>
      </div>
      <ul className="mb-4 flex flex-wrap gap-3">
        {counts.map(([k, v]) => (
          <li key={k}>
            <button
              onClick={() => setState(state === k ? '' : k)}
              aria-pressed={state === k}
              className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${state === k ? 'border-accent bg-surface' : 'border-transparent'}`}
            >
              <Icon name={STATUS_ICON[k]} className="text-ink-soft" />
              <StatusPill status={k} />
              <span className="font-semibold tabular-nums">{v}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mb-4 flex flex-wrap gap-2">
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
        <Empty title="No rooms match." text="Clear the building or status filter." />
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
                          <Icon
                            name={STATUS_ICON[r.status] ?? 'x'}
                            className="mr-1 align-[-0.15em]"
                          />
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
    </>
  );
}
