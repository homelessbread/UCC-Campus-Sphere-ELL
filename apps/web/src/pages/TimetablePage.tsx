import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RoomChip } from '../components/RoomChip';
import { api, list } from '../lib/api';
import { useCampus } from '../lib/campus';
import { Empty, ErrorBox, inputCls, Loading } from '../components/ui';
import { Title } from '../components/Title';

const dayName = (d: number) =>
  ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d] ?? '';

const addDays = (d: string, n: number) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const mondayOf = (d: string) => addDays(d, 1 - (new Date(`${d}T00:00:00Z`).getUTCDay() || 7));
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const START = 7 * 60,
  END = 21 * 60;

export default function TimetablePage() {
  const [view, setView] = useState<'day' | 'week'>('week');
  const campus = useCampus();
  const [date, setDate] = useState(today());
  const [params] = useSearchParams();
  const [room, setRoom] = useState(params.get('room') ?? '');
  const [teacher, setTeacher] = useState(params.get('teacher') ?? '');
  const rooms = useQuery({ queryKey: ['classrooms'], queryFn: () => list('/classrooms') });
  const teachers = useQuery({ queryKey: ['teachers'], queryFn: () => list('/teachers') });
  const roomName = new Map((rooms.data ?? []).map((r) => [r.id, r.name]));
  const from = view === 'week' ? mondayOf(date) : date;
  const to = view === 'week' ? addDays(from, 6) : date;
  const q = useQuery({
    queryKey: ['timetable', from, to, room, teacher],
    queryFn: () => api<any>('/timetable', { from, to, classroom_id: room, teacher_id: teacher }),
  });
  const days = view === 'week' ? [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(from, i)) : [date];

  return (
    <>
      <Title
        title="Timetable"
        text="Weekly and daily class schedules for every room and teacher."
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div
          role="group"
          aria-label="View"
          className="flex overflow-hidden rounded-md border border-line-strong"
        >
          {(['day', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-3 py-2 text-sm ${view === v ? 'bg-ucc-navy text-white' : 'bg-surface'}`}
            >
              {v === 'day' ? 'Daily' : 'Weekly'}
            </button>
          ))}
        </div>
        <button
          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
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
          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
          onClick={() => setDate(addDays(date, view === 'week' ? 7 : 1))}
        >
          Next
        </button>
        <button
          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
          onClick={() => setDate(today())}
        >
          Today
        </button>
        <select
          aria-label="Room"
          className={`${inputCls} max-w-48`}
          value={room}
          onChange={(e) => {
            setRoom(e.target.value);
            campus.select(e.target.value || null, { view: true });
          }}
        >
          <option value="">All rooms</option>
          {(rooms.data ?? []).map((c) => (
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
          {(teachers.data ?? []).map((c) => (
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
          <p className="mb-2 text-xs text-ink-mute">
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
          <div className="overflow-x-auto neo">
            <div
              className="grid min-w-[640px]"
              style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0,1fr))` }}
            >
              <div />
              {days.map((d) => {
                const hol = q.data.holidays.find((h: any) => h.day === d);
                return (
                  <div key={d} className="border-l border-line px-2 py-2 text-sm font-medium">
                    {dayName(new Date(`${d}T00:00:00Z`).getUTCDay() || 7)}{' '}
                    <span className="text-ink-mute tabular-nums">{d.slice(5)}</span>
                    {hol && (
                      <div className="text-xs font-normal text-warn">Holiday: {hol.name}</div>
                    )}
                  </div>
                );
              })}
              <div className="relative" style={{ height: (END - START) * 0.9 }}>
                {Array.from({ length: (END - START) / 60 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute right-1 -translate-y-2 text-xs text-ink-mute tabular-nums"
                    style={{ top: i * 54 }}
                  >
                    {String(7 + i).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
              {days.map((d) => (
                <div
                  key={d}
                  className="relative border-l border-line"
                  style={{ height: (END - START) * 0.9 }}
                >
                  {Array.from({ length: (END - START) / 60 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0 border-t border-line"
                      style={{ top: i * 54 }}
                    />
                  ))}
                  {q.data.occurrences
                    .filter((o: any) => o.occ_date === d)
                    .map((o: any, i: number) => (
                      <div
                        key={`${o.schedule_id}${i}`}
                        className={`absolute inset-x-1 overflow-hidden rounded border px-1.5 py-1 text-xs leading-tight st st-occupied ${o.is_moved ? 'ring-2 ring-ink' : ''}`}
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
                          {o.start_time.slice(0, 5)}–{o.end_time.slice(0, 5)} ·{' '}
                          <RoomChip classroomId={o.classroom_id} name={o.classroom_name} />
                        </div>
                        <div className="text-ink-soft">{o.teacher_name ?? 'No teacher'}</div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
          {q.data.maintenance.length > 0 && (
            <p className="mt-3 text-sm text-warn">
              Rooms closed for maintenance in this period:{' '}
              {q.data.maintenance
                .map((m: any) => `${roomName.get(m.classroom_id) ?? 'A room'}`)
                .join(', ')}
              .
            </p>
          )}
        </>
      )}
    </>
  );
}
