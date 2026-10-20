import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, ErrorBox, inputCls, Loading } from '../components/ui';
import { Title } from '../components/Title';
import { list } from '../lib/api';

export default function SubjectsPage() {
  const q = useQuery({
    queryKey: ['subjects-page'],
    queryFn: async () => {
      const [subjects, cats, reqs, eq] = await Promise.all([
        list('/subjects'),
        list('/room-categories'),
        list('/subject-equipment-requirements'),
        list('/equipment-types'),
      ]);
      const catName = new Map(cats.map((c) => [c.id, c.name]));
      const eqName = new Map(eq.map((e) => [e.id, e.name]));
      return subjects.map((s) => ({
        ...s,
        room: s.required_category_id ? catName.get(s.required_category_id) : null,
        needs: reqs
          .filter((r) => r.subject_id === s.id)
          .map(
            (r) =>
              `${eqName.get(r.equipment_type_id) ?? 'Equipment'}${r.min_quantity > 1 ? ` ×${r.min_quantity}` : ''}`,
          ),
      }));
    },
  });
  const [params] = useSearchParams();
  const [s, setS] = useState(params.get('q') ?? '');
  const rows = (q.data ?? []).filter((x) =>
    `${x.code} ${x.title}`.toLowerCase().includes(s.toLowerCase()),
  );
  return (
    <>
      <Title title="Subjects" text="What each subject needs from its room." />
      <input
        className={`${inputCls} mb-4 max-w-xs`}
        placeholder="Search by code or title"
        aria-label="Search subjects"
        value={s}
        onChange={(e) => setS(e.target.value)}
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <Empty title={s ? 'No subject matches.' : 'No subjects listed yet.'} />
      ) : (
        <div className="overflow-x-auto neo">
          <table className="w-full text-left text-sm">
            <thead className="bg-raised text-ink-soft">
              <tr>
                {['Code', 'Title', 'Units', 'Room type', 'Needs'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((x) => (
                <tr key={x.id}>
                  <td className="px-3 py-2 font-medium">{x.code}</td>
                  <td className="px-3 py-2">{x.title}</td>
                  <td className="px-3 py-2">{x.units ?? '—'}</td>
                  <td className="px-3 py-2">{x.room ?? 'Any'}</td>
                  <td className="px-3 py-2">{x.needs.length ? x.needs.join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
