import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { api, fromIso, list, toManilaIso, ApiError } from '../lib/api';
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

export type FieldType =
  'text' | 'number' | 'select' | 'checkbox' | 'date' | 'time' | 'datetime' | 'textarea';
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  /** Lookup name (key into LOOKUPS) for selects. */
  lookup?: string;
  options?: { value: string; label: string }[];
  /** Hidden when editing (for example the parent record of a child). */
  createOnly?: boolean;
  min?: number;
  max?: number;
}
export interface Lookup {
  path: string;
  label: (r: any) => string;
}
export interface ResourceDef {
  title: string;
  singular: string;
  path: string;
  crumbs: string[];
  fields: FieldDef[];
  columns: {
    header: string;
    render: (r: any, l: Record<string, Map<string, string>>) => ReactNode;
  }[];
  searchText: (r: any, l: Record<string, Map<string, string>>) => string;
  lookups: string[];
  canEdit?: boolean;
  empty: string;
  describe: (r: any, l: Record<string, Map<string, string>>) => string;
}

export const LOOKUPS: Record<string, Lookup> = {
  campuses: { path: '/campuses', label: (r) => r.name },
  buildings: { path: '/buildings', label: (r) => `${r.code} · ${r.name}` },
  floors: { path: '/floors', label: (r) => `${r.name ?? `Floor ${r.level}`}` },
  classrooms: { path: '/classrooms', label: (r) => r.name },
  categories: { path: '/room-categories', label: (r) => r.name },
  teachers: { path: '/teachers', label: (r) => r.full_name },
  subjects: { path: '/subjects', label: (r) => `${r.code} ${r.title}` },
  sections: { path: '/sections', label: (r) => r.section_code },
  terms: { path: '/terms', label: (r) => r.name },
  schedules: { path: '/schedules', label: (r) => `${r.id.slice(0, 8)}` },
  equipment: { path: '/equipment-types', label: (r) => r.name },
};

export function useLookups(names: string[]) {
  const q = useQuery({
    queryKey: ['lookups', ...names],
    queryFn: async () => {
      const out: Record<string, any[]> = {};
      await Promise.all(
        names.map(async (n) => {
          out[n] = await list(LOOKUPS[n].path);
        }),
      );
      return out;
    },
  });
  const maps = useMemo(() => {
    const m: Record<string, Map<string, string>> = {};
    for (const n of names)
      m[n] = new Map((q.data?.[n] ?? []).map((r) => [r.id, LOOKUPS[n].label(r)]));
    return m;
  }, [q.data, names.join()]);
  return { ...q, maps, rows: q.data ?? {} };
}

const PAGE = 15;

export function ResourcePage({ def }: { def: ResourceDef }) {
  const qc = useQueryClient();
  const toast = useToast();
  const rows = useQuery({ queryKey: ['res', def.path], queryFn: () => list(def.path) });
  const look = useLookups(def.lookups);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => api(`${def.path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('ok', `${def.singular} deleted.`);
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['res', def.path] });
      qc.invalidateQueries({ queryKey: ['lookups'] });
    },
    onError: (e: Error) => {
      toast('error', e.message);
      setDeleting(null);
    },
  });

  const filtered = (rows.data ?? []).filter((r) =>
    def.searchText(r, look.maps).toLowerCase().includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const canEdit = def.canEdit !== false;

  return (
    <>
      <PageHeader
        title={def.title}
        crumbs={def.crumbs}
        actions={
          canEdit && (
            <button className={btn.primary} onClick={() => setEditing('new')}>
              Add {def.singular.toLowerCase()}
            </button>
          )
        }
      />
      <div className="mb-3">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder={`Search ${def.title.toLowerCase()}`}
          aria-label={`Search ${def.title}`}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>
      {rows.isPending || look.isPending ? (
        <Loading />
      ) : rows.isError ? (
        <ErrorBox error={rows.error} retry={() => rows.refetch()} />
      ) : look.isError ? (
        <ErrorBox error={look.error} retry={() => look.refetch()} />
      ) : filtered.length === 0 ? (
        <Empty
          title={search ? 'Nothing matches your search.' : def.empty}
          text={search ? 'Try a different word.' : undefined}
          action={
            !search &&
            canEdit && (
              <button className={btn.primary} onClick={() => setEditing('new')}>
                Add {def.singular.toLowerCase()}
              </button>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {def.columns.map((c) => (
                  <th key={c.header} className="px-3 py-2 font-medium">
                    {c.header}
                  </th>
                ))}
                {canEdit && (
                  <th className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  {def.columns.map((c) => (
                    <td key={c.header} className="px-3 py-2 align-top tabular-nums">
                      {c.render(r, look.maps)}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button className={btn.link} onClick={() => setEditing(r)}>
                        Edit
                      </button>
                      <button
                        className="ml-3 text-sm font-medium text-red-700 hover:underline"
                        onClick={() => setDeleting(r)}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
            <span>
              {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
            </span>
            <span className="flex items-center gap-2">
              <button className={btn.link} disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              Page {page + 1} of {pages}
              <button
                className={btn.link}
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </span>
          </div>
        </div>
      )}
      {editing && (
        <RecordForm
          def={def}
          record={editing === 'new' ? null : editing}
          lookups={look.rows}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Confirm
          danger
          title={`Delete this ${def.singular.toLowerCase()}?`}
          text={
            <>
              You are about to delete <strong>{def.describe(deleting, look.maps)}</strong>. This
              cannot be undone, and records that depend on it may block the deletion.
            </>
          }
          confirmLabel="Delete"
          busy={del.isPending}
          onConfirm={() => del.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function initial(def: ResourceDef, rec: any) {
  const v: Record<string, any> = {};
  for (const f of def.fields) {
    const raw = rec?.[f.key];
    v[f.key] =
      raw == null
        ? f.type === 'checkbox'
          ? f.key === 'is_active'
            ? true
            : false
          : ''
        : f.type === 'datetime'
          ? fromIso(raw)
          : f.type === 'time'
            ? String(raw).slice(0, 5)
            : raw;
  }
  return v;
}

export function RecordForm({
  def,
  record,
  lookups,
  onClose,
  preset,
}: {
  def: ResourceDef;
  record: any | null;
  lookups: Record<string, any[]>;
  onClose: () => void;
  preset?: Record<string, any>;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState(() => ({ ...initial(def, record), ...(preset ?? {}) }));
  const [err, setErr] = useState<string | null>(null);
  const [missing, setMissing] = useState<Record<string, string>>({});
  const fields = def.fields.filter(
    (f) => !(record && f.createOnly) && !(preset && f.key in preset),
  );

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const f of fields) {
        const x = v[f.key];
        if (f.type === 'checkbox') body[f.key] = Boolean(x);
        else if (x === '' || x == null) {
          if (record && !f.required) body[f.key] = null;
        } else
          body[f.key] =
            f.type === 'number' ? Number(x) : f.type === 'datetime' ? toManilaIso(x) : x;
      }
      Object.assign(body, preset ?? {});
      // Unset optional fields are simply omitted on create and sent as null on edit only if the API accepts it; drop nulls to stay safe.
      for (const k of Object.keys(body)) if (body[k] === null) delete body[k];
      return record
        ? api(`${def.path}/${record.id}`, { method: 'PATCH', body })
        : api(def.path, { method: 'POST', body });
    },
    onSuccess: () => {
      toast('ok', record ? `${def.singular} saved.` : `${def.singular} added.`);
      qc.invalidateQueries({ queryKey: ['res', def.path] });
      qc.invalidateQueries({ queryKey: ['lookups'] });
      onClose();
    },
    onError: (e: Error) =>
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Try again.'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const m: Record<string, string> = {};
    for (const f of fields)
      if (f.required && f.type !== 'checkbox' && (v[f.key] === '' || v[f.key] == null))
        m[f.key] = 'This field is required.';
    setMissing(m);
    setErr(null);
    if (Object.keys(m).length === 0) save.mutate();
  }

  return (
    <Modal
      title={record ? `Edit ${def.singular.toLowerCase()}` : `Add ${def.singular.toLowerCase()}`}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate>
        {fields.map((f) => (
          <Field
            key={f.key}
            label={f.label + (f.required ? '' : ' (optional)')}
            hint={f.hint}
            error={missing[f.key]}
          >
            {(id) => {
              const common = {
                id,
                value: v[f.key],
                onChange: (e: any) => setV({ ...v, [f.key]: e.target.value }),
              };
              if (f.type === 'checkbox')
                return (
                  <input
                    id={id}
                    type="checkbox"
                    checked={Boolean(v[f.key])}
                    onChange={(e) => setV({ ...v, [f.key]: e.target.checked })}
                    className="size-4"
                  />
                );
              if (f.type === 'textarea')
                return <textarea {...common} rows={3} className={inputCls} />;
              if (f.type === 'select') {
                const opts =
                  f.options ??
                  (lookups[f.lookup!] ?? []).map((r) => ({
                    value: r.id,
                    label: LOOKUPS[f.lookup!].label(r),
                  }));
                return (
                  <select {...common} className={inputCls}>
                    <option value="">Choose…</option>
                    {opts.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                );
              }
              const t = {
                text: 'text',
                number: 'number',
                date: 'date',
                time: 'time',
                datetime: 'datetime-local',
              }[f.type];
              return <input {...common} type={t} min={f.min} max={f.max} className={inputCls} />;
            }}
          </Field>
        ))}
        {err && (
          <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn.primary} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
