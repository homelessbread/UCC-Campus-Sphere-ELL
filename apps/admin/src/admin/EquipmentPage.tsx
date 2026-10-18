import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, list } from '../lib/api';
import {
  btn,
  Confirm,
  ErrorBox,
  Field,
  inputCls,
  Loading,
  Modal,
  PageHeader,
  useToast,
} from '../components/ui';
import { ResourcePage } from './ResourcePage';
import { useLookups } from './ResourcePage';
import type { ResourceDef } from './ResourcePage';

export const TYPES_DEF: ResourceDef = {
  title: 'Equipment types',
  singular: 'Equipment type',
  path: '/equipment-types',
  crumbs: ['Equipment', 'Types'],
  lookups: [],
  empty: 'No equipment types yet.',
  fields: [
    {
      key: 'code',
      label: 'Code',
      type: 'text',
      required: true,
      hint: 'Lowercase letters, numbers and underscores. For example projector.',
    },
    { key: 'name', label: 'Name', type: 'text', required: true },
  ],
  columns: [
    { header: 'Code', render: (r) => r.code },
    { header: 'Name', render: (r) => r.name },
  ],
  searchText: (r) => `${r.code} ${r.name}`,
  describe: (r) => r.name,
};
export const EquipmentTypesPage = () => <ResourcePage def={TYPES_DEF} />;

type Kind = 'room' | 'subject';
function LinkPage({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const toast = useToast();
  const room = kind === 'room';
  const path = room ? '/room-equipment' : '/subject-equipment-requirements';
  const owner = room ? 'classroom_id' : 'subject_id';
  const qty = room ? 'quantity' : 'min_quantity';
  const rows = useQuery({ queryKey: ['links', path], queryFn: () => list(path) });
  const look = useLookups([room ? 'classrooms' : 'subjects', 'equipment']);
  const [form, setForm] = useState<{ owner: string; type: string; qty: string } | null>(null);
  const [del, setDel] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ownerMap = look.maps[room ? 'classrooms' : 'subjects'],
    typeMap = look.maps.equipment;
  const done = () => {
    qc.invalidateQueries({ queryKey: ['links', path] });
    qc.invalidateQueries({ queryKey: ['res'] });
  };
  const save = useMutation({
    mutationFn: (f: NonNullable<typeof form>) =>
      api(path, {
        method: 'PUT',
        body: { [owner]: f.owner, equipment_type_id: f.type, [qty]: Number(f.qty) },
      }),
    onSuccess: () => {
      toast('ok', 'Saved.');
      setForm(null);
      setErr(null);
      done();
    },
    onError: (e: Error) => setErr(e.message),
  });
  const rm = useMutation({
    mutationFn: (r: any) =>
      api(path, {
        method: 'DELETE',
        body: { [owner]: r[owner], equipment_type_id: r.equipment_type_id },
      }),
    onSuccess: () => {
      toast('ok', 'Removed.');
      setDel(null);
      done();
    },
    onError: (e: Error) => {
      toast('error', e.message);
      setDel(null);
    },
  });
  const title = room ? 'Room equipment' : 'Subject requirements';
  return (
    <>
      <PageHeader
        title={title}
        crumbs={['Equipment', title]}
        actions={
          <button
            className={btn.primary}
            onClick={() => {
              setErr(null);
              setForm({ owner: '', type: '', qty: '1' });
            }}
          >
            {room ? 'Add equipment to a room' : 'Add a requirement'}
          </button>
        }
      />
      <p className="mb-3 max-w-2xl text-sm text-slate-600">
        {room
          ? 'What each room has. A class can only be scheduled in a room that has everything its subject requires.'
          : 'What a subject needs in its room. Schedules are checked against these.'}
      </p>
      {rows.isPending || look.isPending ? (
        <Loading />
      ) : rows.isError ? (
        <ErrorBox error={rows.error} retry={() => rows.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">{room ? 'Room' : 'Subject'}</th>
                <th className="px-3 py-2 font-medium">Equipment</th>
                <th className="px-3 py-2 font-medium">{room ? 'Quantity' : 'Minimum'}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                    {room
                      ? 'No room has equipment recorded yet.'
                      : 'No subject has equipment requirements yet.'}
                  </td>
                </tr>
              )}
              {rows.data.map((r) => (
                <tr key={`${r[owner]}${r.equipment_type_id}`}>
                  <td className="px-3 py-2">{ownerMap?.get(r[owner]) ?? '—'}</td>
                  <td className="px-3 py-2">{typeMap?.get(r.equipment_type_id) ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{r[qty]}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      className={btn.link}
                      onClick={() => {
                        setErr(null);
                        setForm({
                          owner: r[owner],
                          type: r.equipment_type_id,
                          qty: String(r[qty]),
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="ml-3 text-sm font-medium text-red-700 hover:underline"
                      onClick={() => setDel(r)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <Modal title={title} onClose={() => setForm(null)}>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.owner || !form.type || !Number(form.qty)) {
                setErr('Choose both items and enter a quantity of 1 or more.');
                return;
              }
              save.mutate(form);
            }}
          >
            <Field label={room ? 'Room' : 'Subject'}>
              {(id) => (
                <select
                  id={id}
                  className={inputCls}
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {(look.rows[room ? 'classrooms' : 'subjects'] ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {room ? r.name : `${r.code} ${r.title}`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Equipment">
              {(id) => (
                <select
                  id={id}
                  className={inputCls}
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {(look.rows.equipment ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={room ? 'Quantity' : 'Minimum quantity'}>
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  className={inputCls}
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                />
              )}
            </Field>
            {err && (
              <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
                {err}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setForm(null)}>
                Cancel
              </button>
              <button className={btn.primary} disabled={save.isPending}>
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
      {del && (
        <Confirm
          danger
          title="Remove this item?"
          text={
            <>
              {ownerMap?.get(del[owner])}: {typeMap?.get(del.equipment_type_id)}. Existing schedules
              that need it may stop fitting.
            </>
          }
          confirmLabel="Remove"
          busy={rm.isPending}
          onConfirm={() => rm.mutate(del)}
          onCancel={() => setDel(null)}
        />
      )}
    </>
  );
}
export const RoomEquipmentPage = () => <LinkPage kind="room" />;
export const SubjectRequirementsPage = () => <LinkPage kind="subject" />;
