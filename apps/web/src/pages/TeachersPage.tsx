import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorBox, inputCls, Loading } from '../components/ui';
import { Title } from '../components/Title';
import { list } from '../lib/api';

export default function TeachersPage() {
  const q = useQuery({ queryKey: ['teachers'], queryFn: () => list('/teachers') });
  const [s, setS] = useState('');
  const rows = (q.data ?? []).filter(
    (t) => t.is_active && t.full_name.toLowerCase().includes(s.toLowerCase()),
  );
  return (
    <>
      <Title
        title="Teachers"
        text="Open any teacher's timetable to see where and when they teach."
      />
      <input
        className={`${inputCls} mb-4 max-w-xs`}
        placeholder="Search by name"
        aria-label="Search teachers"
        value={s}
        onChange={(e) => setS(e.target.value)}
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <Empty title={s ? 'No teacher matches.' : 'No teachers listed yet.'} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <li key={t.id} className="flex items-center justify-between neo px-3 py-2">
              <span>{t.full_name}</span>
              <Link
                className="text-sm font-medium text-accent-text hover:underline"
                to={`/timetable?teacher=${t.id}`}
              >
                Timetable
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
