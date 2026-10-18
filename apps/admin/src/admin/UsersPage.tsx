import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { btn, Confirm, Empty, ErrorBox, Loading, PageHeader, useToast } from '../components/ui';

export default function UsersPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<{ data: any[] }>('/admin/users') });
  const [pending, setPending] = useState<{
    u: any;
    patch: Record<string, string>;
    text: string;
  } | null>(null);
  const m = useMutation({
    mutationFn: ({ u, patch }: { u: any; patch: Record<string, string> }) =>
      api(`/admin/users/${u.id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      toast('ok', 'User updated.');
      setPending(null);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: Error) => {
      toast('error', e.message);
      setPending(null);
    },
  });
  return (
    <>
      <PageHeader title="Users" crumbs={['People', 'Users']} />
      <p className="mb-3 max-w-2xl text-sm text-slate-600">
        New accounts start as ordinary users. Only an administrator can grant admin access, and the
        server checks this on every change.
      </p>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <Empty title="No users yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {['Name', 'Email', 'Role', 'Status'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.data.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td className="px-3 py-2">
                      {u.full_name ?? '—'}
                      {self && <span className="ml-1 text-xs text-slate-500">(you)</span>}
                    </td>
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">{u.role === 'admin' ? 'Administrator' : 'User'}</td>
                    <td className="px-3 py-2">{u.status === 'active' ? 'Active' : 'Suspended'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {self ? (
                        <span className="text-xs text-slate-500">
                          You cannot change your own access
                        </span>
                      ) : (
                        <>
                          <button
                            className={btn.link}
                            onClick={() =>
                              setPending({
                                u,
                                patch: { role: u.role === 'admin' ? 'user' : 'admin' },
                                text:
                                  u.role === 'admin'
                                    ? `Remove administrator access from ${u.email}?`
                                    : `Give ${u.email} administrator access? They will be able to change every record.`,
                              })
                            }
                          >
                            {u.role === 'admin' ? 'Make user' : 'Make admin'}
                          </button>
                          <button
                            className="ml-3 text-sm font-medium text-red-700 hover:underline"
                            onClick={() =>
                              setPending({
                                u,
                                patch: { status: u.status === 'active' ? 'suspended' : 'active' },
                                text:
                                  u.status === 'active'
                                    ? `Suspend ${u.email}? They will be signed out of every protected page.`
                                    : `Reactivate ${u.email}?`,
                              })
                            }
                          >
                            {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pending && (
        <Confirm
          title="Change access?"
          text={pending.text}
          confirmLabel="Confirm"
          busy={m.isPending}
          onConfirm={() => m.mutate(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
