import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, list } from '../lib/api';
import {
  btn,
  Confirm,
  Empty,
  ErrorBox,
  Field,
  inputCls,
  Loading,
  Modal,
  PageHeader,
  useToast,
} from '../components/ui';
import { DEFS, dayName } from './defs';
import { RecordForm, useLookups } from './ResourcePage';

interface Problem {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  related_schedule_id: string | null;
}
const empty = {
  section_id: '',
  classroom_id: '',
  teacher_id: '',
  day_of_week: '1',
  start_time: '08:00',
  end_time: '09:30',
  valid_from: '',
  valid_to: '',
};

export default function SchedulesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const rows = useQuery({ queryKey: ['res', '/schedules'], queryFn: () => list('/schedules') });
  const look = useLookups(['sections', 'subjects', 'classrooms', 'teachers', 'terms']);
  const [search, setSearch] = useState('');
  const [day, setDay] = useState('');
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [action, setAction] = useState<{ kind: 'cancel' | 'move'; s: any } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'archive' | 'delete'; s: any } | null>(null);

  const secLabel = (id: string) => {
    const sec = look.rows.sections?.find((x) => x.id === id);
    const sub = look.rows.subjects?.find((x) => x.id === sec?.subject_id);
    return sec ? `${sub?.code ?? ''} ${sec.section_code}`.trim() : '—';
  };
  const label = (s: any) =>
    `${secLabel(s.section_id)} · ${dayName(s.day_of_week)} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;

  const run = useMutation({
    mutationFn: ({ kind, s }: { kind: 'archive' | 'delete'; s: any }) =>
      kind === 'delete'
        ? api(`/schedules/${s.id}`, { method: 'DELETE' })
        : api(`/schedules/${s.id}`, { method: 'PATCH', body: { status: 'archived' } }),
    onSuccess: (_d, v) => {
      toast('ok', v.kind === 'delete' ? 'Schedule deleted.' : 'Schedule archived.');
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['res', '/schedules'] });
    },
    onError: (e: Error) => {
      toast('error', e.message);
      setConfirm(null);
    },
  });

  const filtered = (rows.data ?? [])
    .filter((s) => !day || String(s.day_of_week) === day)
    .filter((s) =>
      `${label(s)} ${look.maps.classrooms?.get(s.classroom_id) ?? ''} ${look.maps.teachers?.get(s.teacher_id) ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));

  return (
    <>
      <PageHeader
        title="Class schedules"
        crumbs={['Schedule', 'Class schedules']}
        actions={
          <button className={btn.primary} onClick={() => setEditing('new')}>
            Add schedule
          </button>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search by subject, room or teacher"
          aria-label="Search schedules"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${inputCls} max-w-40`}
          aria-label="Filter by day"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        >
          <option value="">All days</option>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              {dayName(d)}
            </option>
          ))}
        </select>
      </div>
      {rows.isPending || look.isPending ? (
        <Loading />
      ) : rows.isError ? (
        <ErrorBox error={rows.error} retry={() => rows.refetch()} />
      ) : filtered.length === 0 ? (
        <Empty
          title={search || day ? 'No schedules match.' : 'No schedules yet.'}
          text={search || day ? 'Change the search or day filter.' : 'Add the first weekly class.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {['Section', 'Day', 'Time', 'Room', 'Teacher', 'Dates', 'Status'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
                <th className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className={s.status === 'archived' ? 'text-slate-400' : ''}>
                  <td className="px-3 py-2">{secLabel(s.section_id)}</td>
                  <td className="px-3 py-2">{dayName(s.day_of_week)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                  </td>
                  <td className="px-3 py-2">{look.maps.classrooms?.get(s.classroom_id) ?? '—'}</td>
                  <td className="px-3 py-2">
                    {look.maps.teachers?.get(s.teacher_id) ?? 'Not assigned'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {s.valid_from} to {s.valid_to}
                  </td>
                  <td className="px-3 py-2">{s.status === 'active' ? 'Active' : 'Archived'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button className={btn.link} onClick={() => setEditing(s)}>
                      Edit
                    </button>
                    {s.status === 'active' && (
                      <>
                        <button
                          className={`${btn.link} ml-3`}
                          onClick={() => setAction({ kind: 'cancel', s })}
                        >
                          Cancel a date
                        </button>
                        <button
                          className={`${btn.link} ml-3`}
                          onClick={() => setAction({ kind: 'move', s })}
                        >
                          Change a date
                        </button>
                        <button
                          className={`${btn.link} ml-3`}
                          onClick={() => setConfirm({ kind: 'archive', s })}
                        >
                          Archive
                        </button>
                      </>
                    )}
                    <button
                      className="ml-3 text-sm font-medium text-red-700 hover:underline"
                      onClick={() => setConfirm({ kind: 'delete', s })}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ScheduleForm
          record={editing === 'new' ? null : editing}
          look={look.rows}
          onClose={() => setEditing(null)}
        />
      )}
      {action && (
        <RecordForm
          def={action.kind === 'cancel' ? DEFS.cancellations : DEFS.exceptions}
          record={null}
          lookups={look.rows}
          preset={{ schedule_id: action.s.id }}
          onClose={() => {
            setAction(null);
          }}
        />
      )}
      {confirm && (
        <Confirm
          danger={confirm.kind === 'delete'}
          title={confirm.kind === 'delete' ? 'Delete this schedule?' : 'Archive this schedule?'}
          text={
            confirm.kind === 'delete' ? (
              <>
                Delete <strong>{label(confirm.s)}</strong>? Its cancellations and one-date changes
                are removed too. This cannot be undone.
              </>
            ) : (
              <>
                Archive <strong>{label(confirm.s)}</strong>? The room and teacher become free for
                this time. You can still see it here.
              </>
            )
          }
          confirmLabel={confirm.kind === 'delete' ? 'Delete' : 'Archive'}
          busy={run.isPending}
          onConfirm={() => run.mutate(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function ScheduleForm({
  record,
  look,
  onClose,
}: {
  record: any | null;
  look: Record<string, any[]>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>(() =>
    record
      ? {
          ...record,
          teacher_id: record.teacher_id ?? '',
          day_of_week: String(record.day_of_week),
          start_time: record.start_time.slice(0, 5),
          end_time: record.end_time.slice(0, 5),
        }
      : empty,
  );
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: e.target.value });

  const body = useMemo(
    () => ({
      section_id: v.section_id,
      classroom_id: v.classroom_id,
      ...(v.teacher_id ? { teacher_id: v.teacher_id } : {}),
      day_of_week: Number(v.day_of_week),
      start_time: v.start_time,
      end_time: v.end_time,
      valid_from: v.valid_from,
      valid_to: v.valid_to,
    }),
    [v],
  );
  const complete = Boolean(
    v.section_id && v.classroom_id && v.start_time && v.end_time && v.valid_from && v.valid_to,
  );

  // Live pre-check (debounced) so every problem shows before Save.
  useEffect(() => {
    if (!complete) {
      setProblems(null);
      return;
    }
    setChecking(true);
    const h = setTimeout(() => {
      api<{ problems: Problem[] }>('/schedules/check', {
        method: 'POST',
        body: { ...body, exclude_schedule_id: record?.id },
      })
        .then((r) => setProblems(r.problems))
        .catch((e) =>
          setProblems([
            { severity: 'error', code: 'ERR', message: e.message, related_schedule_id: null },
          ]),
        )
        .finally(() => setChecking(false));
    }, 400);
    return () => clearTimeout(h);
  }, [complete, body, record?.id]);

  // Fill the dates from the term when a section is picked.
  function pickSection(id: string) {
    const sec = look.sections?.find((s) => s.id === id);
    const term = look.terms?.find((t) => t.id === sec?.term_id);
    setV((x) => ({
      ...x,
      section_id: id,
      valid_from: x.valid_from || term?.start_date || '',
      valid_to: x.valid_to || term?.end_date || '',
    }));
  }

  const save = useMutation({
    mutationFn: () =>
      record
        ? api(`/schedules/${record.id}`, { method: 'PATCH', body })
        : api('/schedules', { method: 'POST', body }),
    onSuccess: () => {
      toast('ok', record ? 'Schedule saved.' : 'Schedule added.');
      qc.invalidateQueries({ queryKey: ['res', '/schedules'] });
      qc.invalidateQueries({ queryKey: ['timetable'] });
      onClose();
    },
    onError: (e: Error) => {
      setConfirming(false);
      const d = e instanceof ApiError ? (e.details as any) : null;
      setErr(
        e.message +
          (d?.conflicts?.length
            ? ` (${d.conflicts.length} conflicting ${d.conflicts.length === 1 ? 'class' : 'classes'})`
            : ''),
      );
    },
  });

  const errors = problems?.filter((p) => p.severity === 'error') ?? [];
  const warnings = problems?.filter((p) => p.severity === 'warning') ?? [];
  const secOpt = (look.sections ?? []).map((s) => ({
    id: s.id,
    label: `${look.subjects?.find((x) => x.id === s.subject_id)?.code ?? ''} ${s.section_code}${s.enrollment ? ` (${s.enrollment} students)` : ''}`,
  }));

  return (
    <Modal title={record ? 'Edit schedule' : 'Add schedule'} onClose={onClose} wide>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          if (!complete) {
            setErr('Fill in every required field.');
            return;
          }
          setConfirming(true);
        }}
      >
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Section">
            {(id) => (
              <select
                id={id}
                className={inputCls}
                value={v.section_id}
                onChange={(e) => pickSection(e.target.value)}
              >
                <option value="">Choose…</option>
                {secOpt.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Classroom">
            {(id) => (
              <select
                id={id}
                className={inputCls}
                value={v.classroom_id}
                onChange={set('classroom_id')}
              >
                <option value="">Choose…</option>
                {(look.classrooms ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.capacity} seats)
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Teacher (optional)">
            {(id) => (
              <select
                id={id}
                className={inputCls}
                value={v.teacher_id}
                onChange={set('teacher_id')}
              >
                <option value="">Not assigned</option>
                {(look.teachers ?? [])
                  .filter((t) => t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <Field label="Day">
            {(id) => (
              <select
                id={id}
                className={inputCls}
                value={v.day_of_week}
                onChange={set('day_of_week')}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {dayName(d)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Starts">
            {(id) => (
              <input
                id={id}
                type="time"
                className={inputCls}
                value={v.start_time}
                onChange={set('start_time')}
              />
            )}
          </Field>
          <Field label="Ends">
            {(id) => (
              <input
                id={id}
                type="time"
                className={inputCls}
                value={v.end_time}
                onChange={set('end_time')}
              />
            )}
          </Field>
          <Field label="First date">
            {(id) => (
              <input
                id={id}
                type="date"
                className={inputCls}
                value={v.valid_from}
                onChange={set('valid_from')}
              />
            )}
          </Field>
          <Field label="Last date">
            {(id) => (
              <input
                id={id}
                type="date"
                className={inputCls}
                value={v.valid_to}
                onChange={set('valid_to')}
              />
            )}
          </Field>
        </div>
        <div className="mb-3 min-h-10 text-sm" aria-live="polite">
          {checking && <p className="text-slate-500">Checking for conflicts…</p>}
          {!checking && problems && problems.length === 0 && (
            <p className="text-green-800">
              No conflicts found. Room, teacher, capacity and equipment all fit.
            </p>
          )}
          {!checking &&
            errors.map((p, i) => (
              <p key={i} className="mb-1 rounded bg-red-50 px-3 py-2 text-red-800">
                <strong>Conflict:</strong> {p.message}
              </p>
            ))}
          {!checking &&
            warnings.map((p, i) => (
              <p key={i} className="mb-1 rounded bg-amber-50 px-3 py-2 text-amber-900">
                <strong>Check:</strong> {p.message}
              </p>
            ))}
        </div>
        {err && (
          <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.ghost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={btn.primary}
            disabled={save.isPending || checking || errors.length > 0}
          >
            {errors.length ? 'Fix the conflicts to save' : 'Review and save'}
          </button>
        </div>
      </form>
      {confirming && (
        <Confirm
          title={record ? 'Save these changes?' : 'Add this class?'}
          confirmLabel={record ? 'Save changes' : 'Add schedule'}
          busy={save.isPending}
          onConfirm={() => save.mutate()}
          onCancel={() => setConfirming(false)}
          text={
            <>
              {secOpt.find((o) => o.id === v.section_id)?.label} on {dayName(Number(v.day_of_week))}{' '}
              from {v.start_time} to {v.end_time} in{' '}
              {look.classrooms?.find((c) => c.id === v.classroom_id)?.name}, from {v.valid_from} to{' '}
              {v.valid_to}.
              {warnings.length > 0 && (
                <>
                  {' '}
                  There {warnings.length === 1
                    ? 'is 1 warning'
                    : `are ${warnings.length} warnings`}{' '}
                  above.
                </>
              )}
            </>
          }
        />
      )}
    </Modal>
  );
}
