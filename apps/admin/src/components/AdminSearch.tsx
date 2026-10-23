import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Hit {
  type: string;
  id: string | number;
  label: string;
  sub?: string;
  href: string;
}

const PAGES: Hit[] = [
  { type: 'Page', id: 'dashboard',     label: 'Dashboard',            href: '/admin' },
  { type: 'Page', id: 'schedules',     label: 'Class schedules',       href: '/admin/schedules' },
  { type: 'Page', id: 'timetable',     label: 'Timetable',             href: '/admin/timetable' },
  { type: 'Page', id: 'holidays',      label: 'Holidays',              href: '/admin/holidays' },
  { type: 'Page', id: 'cancellations', label: 'Cancelled classes',     href: '/admin/cancellations' },
  { type: 'Page', id: 'exceptions',    label: 'One-date changes',      href: '/admin/exceptions' },
  { type: 'Page', id: 'buildings',     label: 'Buildings',             href: '/admin/buildings' },
  { type: 'Page', id: 'floors',        label: 'Floors',                href: '/admin/floors' },
  { type: 'Page', id: 'classrooms',    label: 'Classrooms',            href: '/admin/classrooms' },
  { type: 'Page', id: 'maintenance',   label: 'Maintenance',           href: '/admin/maintenance' },
  { type: 'Page', id: 'terms',         label: 'Academic terms',        href: '/admin/terms' },
  { type: 'Page', id: 'subjects',      label: 'Subjects',              href: '/admin/subjects' },
  { type: 'Page', id: 'sections',      label: 'Sections',              href: '/admin/sections' },
  { type: 'Page', id: 'eq-types',      label: 'Equipment types',       href: '/admin/equipment-types' },
  { type: 'Page', id: 'room-eq',       label: 'Room equipment',        href: '/admin/room-equipment' },
  { type: 'Page', id: 'sub-req',       label: 'Subject requirements',  href: '/admin/subject-requirements' },
  { type: 'Page', id: 'teachers',      label: 'Teachers',              href: '/admin/teachers' },
  { type: 'Page', id: 'users',         label: 'Users',                 href: '/admin/users' },
];

export default function AdminSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Fetch rooms/classrooms for search
  const { data: classrooms = [] } = useQuery({
    queryKey: ['search-classrooms'],
    queryFn: () => api<any[]>('/classrooms'),
    staleTime: 60_000,
  });
  const { data: teachers = [] } = useQuery({
    queryKey: ['search-teachers'],
    queryFn: () => api<any[]>('/teachers'),
    staleTime: 60_000,
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ['search-subjects'],
    queryFn: () => api<any[]>('/subjects'),
    staleTime: 60_000,
  });

  const hits: Hit[] = (() => {
    if (!q.trim()) return [];
    const lq = q.toLowerCase();
    const results: Hit[] = [];
    const seen = new Set<string>();
    const add = (h: Hit) => { const k = h.type + ':' + h.id; if (!seen.has(k)) { seen.add(k); results.push(h); } };

    PAGES.filter(p => p.label.toLowerCase().includes(lq)).forEach(add);

    (classrooms as any[]).filter(r =>
      r.name?.toLowerCase().includes(lq) || r.code?.toLowerCase().includes(lq)
    ).slice(0, 5).forEach(r => add({
      type: 'Room', id: r.id, label: r.name ?? r.code,
      sub: r.code ? `Code: ${r.code}` : undefined,
      href: '/admin/classrooms',
    }));

    (teachers as any[]).filter(t =>
      t.full_name?.toLowerCase().includes(lq) || t.email?.toLowerCase().includes(lq)
    ).slice(0, 5).forEach(t => add({
      type: 'Teacher', id: t.id, label: t.full_name ?? t.email,
      sub: t.email,
      href: '/admin/teachers',
    }));

    (subjects as any[]).filter(s =>
      s.name?.toLowerCase().includes(lq) || s.code?.toLowerCase().includes(lq)
    ).slice(0, 5).forEach(s => add({
      type: 'Subject', id: s.id, label: s.name ?? s.code,
      sub: s.code,
      href: '/admin/subjects',
    }));

    return results.slice(0, 12);
  })();

  useEffect(() => { setCursor(0); }, [hits.length, q]);

  // Keyboard shortcut: Ctrl+K or /
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQ('');
  }, [open]);

  function pick(h: Hit) {
    setOpen(false);
    navigate(h.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && hits[cursor]) pick(hits[cursor]);
    else if (e.key === 'Escape') setOpen(false);
  }

  const TYPE_COLOR: Record<string, string> = {
    Page: 'bg-ucc-navy/20 text-blue-300',
    Room: 'bg-emerald-900/40 text-emerald-300',
    Teacher: 'bg-violet-900/40 text-violet-300',
    Subject: 'bg-amber-900/40 text-amber-300',
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
        style={{ background: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text2)' }}
        aria-label="Search (Ctrl+K)"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="9" r="6"/><path d="m15 15 3 3"/>
        </svg>
        <span className="hidden sm:inline">Search…</span>
        <kbd className="hidden sm:inline ml-1 rounded border px-1 py-0.5 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg2)' }}>Ctrl K</kbd>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 modal-bg"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text2)', flexShrink: 0 }}>
                <circle cx="9" cy="9" r="6"/><path d="m15 15 3 3"/>
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search pages, rooms, teachers, subjects…"
                className="flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: 'var(--text)', border: 'none', outline: 'none' }}
              />
              <button onClick={() => setOpen(false)} style={{ color: 'var(--text2)' }} className="text-xs px-2 py-1 rounded hover:opacity-70">Esc</button>
            </div>
            <ul className="max-h-80 overflow-y-auto py-1" role="listbox">
              {!q.trim() && (
                <li className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text2)' }}>
                  Type to search pages, rooms, teachers or subjects
                </li>
              )}
              {q.trim() && hits.length === 0 && (
                <li className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text2)' }}>
                  No results for <strong style={{ color: 'var(--text)' }}>"{q}"</strong>
                </li>
              )}
              {hits.map((h, i) => (
                <li
                  key={h.type + ':' + h.id}
                  role="option"
                  aria-selected={i === cursor}
                  onClick={() => pick(h)}
                  onMouseEnter={() => setCursor(i)}
                  className="flex items-center gap-3 px-4 py-2 cursor-pointer"
                  style={{ background: i === cursor ? 'var(--bg3)' : 'transparent' }}
                >
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLOR[h.type] ?? ''}`}>{h.type}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate" style={{ color: 'var(--text)' }}>{h.label}</span>
                    {h.sub && <span className="block text-xs truncate" style={{ color: 'var(--text2)' }}>{h.sub}</span>}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text2)', flexShrink: 0 }}>
                    <path d="M5 10h10M13 7l3 3-3 3"/>
                  </svg>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
