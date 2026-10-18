import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { Empty, ErrorBox, inputCls, Loading, PageHeader } from '../components/ui';
import { dayName } from './defs';
import { useLookups } from './ResourcePage';

const addDays = (d: string, n: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const mondayOf = (d: string) => addDays(d, 1 - (new Date(`${d}T00:00:00Z`).getUTCDay() || 7));
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const START = 7 * 60,
  END = 21 * 60;

export default function TimetablePage() {
  const [view, setView] = useState<'day' | 'week'>('week');
  const [date, setDate] = useState(today());
  const [room, setRoom] = useState('');
  const [teacher, setTeacher] = useState('');
  const look = useLookups(['classrooms', 'teachers']);
  const from = view === 'week' ? mondayOf(date) : date;
  const to = view === 'week' ? addDays(from, 6) : date;
  const q = useQuery({
    queryKey: ['timetable', from, to, room, teacher],
    queryFn: () =>
      api<any>('/timetable', { query: { from, to, classroom_id: room, teacher_id: teacher } }),
  });
  const days = view === 'week' ? [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(from, i)) : [date];

  return (
    <>
      <PageHeader title="Timetable" crumbs={['Schedule', 'Timetable']} />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div
          role="group"
          aria-label="View"
          className="flex overflow-hidden rounded-md border border-slate-300"
        >
          {(['day', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-3 py-2 text-sm ${view === v ? 'bg-ucc-navy text-white' : 'bg-white'}`}
            >
              {v === 'day' ? 'Daily' : 'Weekly'}
            </button>
          ))}
        </div>
        <button
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          onClick={() => setDate(addDays(date, view === 'week' ? -7 : -1))}
        >
          Previous
        </button>
        <input
          type="date"
          aria-label="Date"
          className={`${inputCls} max-w-40`}
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <button
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          onClick={() => setDate(addDays(date, view === 'week' ? 7 : 1))}
        >
          Next
        </button>
        <button
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          onClick={() => setDate(today())}
        >
          Today
        </button>
        <select
          aria-label="Room"
          className={`${inputCls} max-w-48`}
          value={room}
          onChange={(e) => setRoom(e.target.value)}
        >
          <option value="">All rooms</option>
          {(look.rows.classrooms ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Teacher"
          className={`${inputCls} max-w-48`}
          value={teacher}
          onChange={(e) => setTeacher(e.target.value)}
        >
          <option value="">All teachers</option>
          {(look.rows.teachers ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-500">
            {q.data.basis} Times are school time (Asia/Manila).
          </p>
          {q.data.occurrences.length === 0 && (
            <div className="mb-3">
              <Empty
                title="No classes in this period."
                text="Change the date, room or teacher filter."
              />
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <div
              className="grid min-w-[640px]"
              style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0,1fr))` }}
            >
              <div />
              {days.map((d) => {
                const hol = q.data.holidays.find((h: any) => h.day === d);
                return (
                  <div key={d} className="border-l border-slate-200 px-2 py-2 text-sm font-medium">
                    {dayName(new Date(`${d}T00:00:00Z`).getUTCDay() || 7)}{' '}
                    <span className="text-slate-500 tabular-nums">{d.slice(5)}</span>
                    {hol && (
                      <div className="text-xs font-normal text-amber-800">Holiday: {hol.name}</div>
                    )}
                  </div>
                );
              })}
              <div className="relative" style={{ height: (END - START) * 0.9 }}>
                {Array.from({ length: (END - START) / 60 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute right-1 -translate-y-2 text-xs text-slate-500 tabular-nums"
                    style={{ top: i * 54 }}
                  >
                    {String(7 + i).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
              {days.map((d) => (
                <div
                  key={d}
                  className="relative border-l border-slate-200"
                  style={{ height: (END - START) * 0.9 }}
                >
                  {Array.from({ length: (END - START) / 60 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0 border-t border-slate-100"
                      style={{ top: i * 54 }}
                    />
                  ))}
                  {q.data.occurrences
                    .filter((o: any) => o.occ_date === d)
                    .map((o: any, i: number) => (
                      <div
                        key={`${o.schedule_id}${i}`}
                        className={`absolute inset-x-1 overflow-hidden rounded border px-1.5 py-1 text-xs leading-tight ${o.is_moved ? 'border-amber-400 bg-amber-50' : 'border-orange-300 bg-orange-50'}`}
                        style={{
                          top: (mins(o.start_time) - START) * 0.9,
                          height: Math.max(22, (mins(o.end_time) - mins(o.start_time)) * 0.9 - 2),
                        }}
                        title={`${o.subject_code} ${o.section_code}, ${o.classroom_name}, ${o.teacher_name ?? 'no teacher'}`}
                      >
                        <strong>
                          {o.subject_code} {o.section_code}
                        </strong>
                        {o.is_moved && <span> (changed)</span>}
                        <div>
                          {o.start_time.slice(0, 5)}–{o.end_time.slice(0, 5)} · {o.classroom_name}
                        </div>
                        <div className="text-slate-600">{o.teacher_name ?? 'No teacher'}</div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
          {q.data.maintenance.length > 0 && (
            <p className="mt-3 text-sm text-amber-900">
              Maintenance in this period:{' '}
              {q.data.maintenance
                .map(
                  (m: any) =>
                    `${look.maps.classrooms?.get(m.classroom_id) ?? 'A room'}${m.reason ? ` (${m.reason})` : ''}`,
                )
                .join(', ')}
              .
            </p>
          )}
        </>
      )}
    </>
  );
}
