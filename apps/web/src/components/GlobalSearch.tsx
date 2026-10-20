import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { list } from '../lib/api';
import { useCampus } from '../lib/campus';
import { Icon, type IconName } from './Icon';
import { STATUS } from './ui';

interface Item {
  key: string;
  group: string;
  icon: IconName;
  label: string;
  sub?: string;
  status?: string;
  run: () => void;
}

const MAX = 5;

/** One search box for the whole site: rooms, teachers and subjects, from any page. */
export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const nav = useNavigate();
  const campus = useCampus();
  const teachers = useQuery({ queryKey: ['teachers'], queryFn: () => list('/teachers') });
  const subjects = useQuery({ queryKey: ['subjects-lite'], queryFn: () => list('/subjects') });

  const term = q.trim().toLowerCase();
  const items = useMemo<Item[]>(() => {
    if (!term) return [];
    const done = () => {
      setQ('');
      setOpen(false);
    };
    const rooms: Item[] = campus.rooms
      .filter((r) =>
        `${r.name} ${r.building?.name ?? ''} floor ${r.floor?.level ?? ''}`
          .toLowerCase()
          .includes(term),
      )
      .slice(0, MAX)
      .map((r) => ({
        key: `r-${r.classroom_id}`,
        group: 'Rooms',
        icon: 'rooms' as const,
        label: r.name,
        sub: `${r.building?.name ?? ''}, floor ${r.floor?.level ?? ''}`,
        status: r.status,
        run: () => {
          campus.select(r.classroom_id, { view: true });
          done();
        },
      }));
    const people: Item[] = (teachers.data ?? [])
      .filter((t) => t.is_active && String(t.full_name).toLowerCase().includes(term))
      .slice(0, MAX)
      .map((t) => ({
        key: `t-${t.id}`,
        group: 'Teachers',
        icon: 'teachers' as const,
        label: t.full_name,
        sub: 'Open timetable',
        run: () => {
          nav(`/timetable?teacher=${t.id}`);
          done();
        },
      }));
    const subs: Item[] = (subjects.data ?? [])
      .filter((s) => `${s.code} ${s.title}`.toLowerCase().includes(term))
      .slice(0, MAX)
      .map((s) => ({
        key: `s-${s.id}`,
        group: 'Subjects',
        icon: 'subjects' as const,
        label: `${s.code} ${s.title}`,
        sub: 'What it needs from a room',
        run: () => {
          nav(`/subjects?q=${encodeURIComponent(s.code)}`);
          done();
        },
      }));
    return [...rooms, ...people, ...subs];
  }, [term, campus.rooms, teachers.data, subjects.data]);

  useEffect(() => setActive(0), [term]);

  // "/" jumps to the search box from anywhere, unless the person is already typing in a field.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);

  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, []);

  const show = open && term.length > 0;
  const loading = teachers.isPending || subjects.isPending || campus.isPending;

  return (
    <div ref={box} className="relative w-full" role="search">
      <label htmlFor={`${listId}-in`} className="sr-only">
        Search rooms, teachers and subjects
      </label>
      <div className="neo-in flex items-center gap-2 px-3 py-2">
        <Icon name="find" className="text-ink-mute" />
        <input
          id={`${listId}-in`}
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              input.current?.blur();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && items[active]) {
              e.preventDefault();
              items[active].run();
            }
          }}
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={show && items[active] ? `${listId}-${active}` : undefined}
          placeholder="Search rooms, teachers or subjects"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-mute"
        />
        {q ? (
          <button
            type="button"
            onClick={() => {
              setQ('');
              input.current?.focus();
            }}
            aria-label="Clear search"
            className="text-ink-mute hover:text-ink"
          >
            <Icon name="x" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-line px-1.5 text-xs text-ink-mute sm:inline">
            /
          </kbd>
        )}
      </div>
      {show && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="neo absolute inset-x-0 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto p-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-mute" role="presentation">
              {loading ? 'Searching…' : 'No match. Try a room number, a teacher or a subject code.'}
            </li>
          ) : (
            items.map((it, i) => (
              <li
                key={it.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={it.run}
                className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${i === active ? 'bg-accent text-on-accent' : 'text-ink'}`}
              >
                <Icon name={it.icon} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{it.label}</span>
                  <span
                    className={`block truncate text-xs ${i === active ? 'text-on-accent' : 'text-ink-mute'}`}
                  >
                    {it.group}
                    {it.sub ? ` · ${it.sub}` : ''}
                  </span>
                </span>
                {it.status && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS[it.status]?.cls}`}
                  >
                    {STATUS[it.status]?.label}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
