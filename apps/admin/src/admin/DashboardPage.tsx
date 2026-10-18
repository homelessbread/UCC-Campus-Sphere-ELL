import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ErrorBox, Loading, PageHeader, STATUS, StatusPill } from '../components/ui';

export default function DashboardPage() {
  const q = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<any>('/admin/dashboard'),
    refetchInterval: 60_000,
  });
  if (q.isPending)
    return (
      <>
        <PageHeader title="Dashboard" crumbs={['Overview']} />
        <Loading />
      </>
    );
  if (q.isError)
    return (
      <>
        <PageHeader title="Dashboard" crumbs={['Overview']} />
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      </>
    );
  const d = q.data;
  const t = d.totals;
  const tiles: [string, number][] = [
    ['Buildings', t.buildings],
    ['Floors', t.floors],
    ['Classrooms', t.classrooms],
    ['Active teachers', t.active_teachers],
    ['Scheduled classes', t.scheduled_classes],
    ['Classes today', t.classes_today],
  ];
  const status: [string, number][] = [
    ['free', d.rooms.available],
    ['occupied', d.rooms.occupied_by_schedule],
    ['maintenance', d.rooms.under_maintenance],
    ['inactive', d.rooms.inactive],
  ];
  const byBuilding = new Map<string, { name: string; floors: Map<number, any[]> }>();
  for (const r of d.rooms.items) {
    const b = byBuilding.get(r.building.id) ?? { name: r.building.name, floors: new Map() };
    b.floors.set(r.floor.level, [...(b.floors.get(r.floor.level) ?? []), r]);
    byBuilding.set(r.building.id, b);
  }
  return (
    <>
      <PageHeader title="Dashboard" crumbs={['Overview']} />
      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <dd className="font-heading text-3xl font-semibold tabular-nums text-ucc-deep">{v}</dd>
            <dt className="text-sm text-slate-600">{k}</dt>
          </div>
        ))}
      </dl>
      <section aria-labelledby="rooms-h" className="mb-6">
        <h2 id="rooms-h" className="font-heading text-lg font-semibold">
          Rooms right now
        </h2>
        <p className="mb-3 text-sm text-slate-600">{d.basis}</p>
        <ul className="mb-4 flex flex-wrap gap-3">
          {status.map(([k, v]) => (
            <li key={k} className="flex items-center gap-2 text-sm">
              <StatusPill status={k} />
              <span className="font-semibold tabular-nums">{v}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-4 lg:grid-cols-2">
          {[...byBuilding.values()].map((b) => (
            <div key={b.name} className="rounded-lg border border-slate-200 bg-white p-3">
              <h3 className="font-heading mb-2 font-semibold">{b.name}</h3>
              {[...b.floors.entries()]
                .sort((a, c) => c[0] - a[0])
                .map(([level, rooms]) => (
                  <div
                    key={level}
                    className="mb-1.5 flex items-start gap-2 border-t border-slate-100 pt-1.5"
                  >
                    <span className="w-12 shrink-0 pt-1 text-xs text-slate-500">Floor {level}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {rooms.map((r: any) => (
                        <span
                          key={r.classroom_id}
                          title={`${r.name}: ${STATUS[r.status]?.label ?? r.status}`}
                          className={`rounded border px-2 py-1 text-xs ${STATUS[r.status]?.cls}`}
                        >
                          {r.name} <span className="sr-only">{STATUS[r.status]?.label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
        {d.rooms.items.length === 0 && (
          <p className="text-sm text-slate-500">
            No rooms yet. Add buildings, floors and classrooms first.
          </p>
        )}
      </section>
      <section aria-labelledby="act-h">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="act-h" className="font-heading text-lg font-semibold">
            Recent changes
          </h2>
          <Link to="/admin/schedules" className="text-sm font-medium text-ucc-navy hover:underline">
            Go to schedules
          </Link>
        </div>
        {d.recent_activity.length === 0 ? (
          <p className="text-sm text-slate-500">No changes recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
            {d.recent_activity.map((a: any) => (
              <li key={a.id} className="flex justify-between gap-3 px-3 py-2">
                <span>
                  {a.actor ?? 'Someone'} {a.action}d {String(a.entity).replace(/_/g, ' ')}
                </span>
                <time className="text-slate-500 tabular-nums" dateTime={a.created_at}>
                  {new Date(a.created_at).toLocaleString('en-PH', {
                    timeZone: 'Asia/Manila',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
