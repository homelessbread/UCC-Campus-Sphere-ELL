import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { btn, ErrorBox, Field, inputCls, StatusPill } from '../components/ui';
import { Title } from '../components/Title';
import { RoomChip } from '../components/RoomChip';
import { api, list } from '../lib/api';

const PRESETS = [
  ['now', 'Free right now'],
  ['30', 'Free for the next 30 minutes'],
  ['60', 'Free for the next hour'],
  ['custom', 'Pick a time'],
] as const;

export default function FindRoomPage() {
  const [params] = useSearchParams();
  const fromLink = params.get('preset');
  const [preset, setPreset] = useState<string>(
    PRESETS.some(([v]) => v === fromLink) ? (fromLink as string) : 'now',
  );
  const [start, setStart] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [cap, setCap] = useState('');
  const [cat, setCat] = useState('');
  const [bld, setBld] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const cats = useQuery({ queryKey: ['cats'], queryFn: () => list('/room-categories') });
  const blds = useQuery({ queryKey: ['blds'], queryFn: () => list('/buildings') });
  const search = useMutation({
    mutationFn: () =>
      api<any>('/availability/search', {
        preset,
        start: preset === 'custom' ? start : undefined,
        duration_minutes: preset === 'custom' ? Number(minutes) : undefined,
        min_capacity: cap ? Number(cap) : undefined,
        category: cat || undefined,
        building_id: bld || undefined,
      }),
  });
  const r = search.data;
  // Arriving from a "Free now" style shortcut runs the search straight away.
  const auto = useRef(false);
  useEffect(() => {
    if (fromLink && !auto.current && PRESETS.some(([v]) => v === fromLink && v !== 'custom')) {
      auto.current = true;
      search.mutate();
    }
  }, []);

  return (
    <>
      <Title
        title="Find a room"
        text="Tell us when you need a room. We list rooms that are free for the whole time."
      />
      <form
        className="mb-6 neo p-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          if (preset === 'custom' && !start) {
            setFormError('Pick a start time.');
            return;
          }
          search.mutate();
        }}
      >
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="When">
            {(id) => (
              <select
                id={id}
                className={inputCls}
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
              >
                {PRESETS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {preset === 'custom' && (
            <>
              <Field label="Starts (Philippine time)">
                {(id) => (
                  <input
                    id={id}
                    type="datetime-local"
                    className={inputCls}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Minutes needed">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={5}
                    max={720}
                    className={inputCls}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                )}
              </Field>
            </>
          )}
          <Field label="Seats needed (optional)">
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                className={inputCls}
                value={cap}
                onChange={(e) => setCap(e.target.value)}
              />
            )}
          </Field>
          <Field label="Room type (optional)">
            {(id) => (
              <select
                id={id}
                className={inputCls}
                value={cat}
                onChange={(e) => setCat(e.target.value)}
              >
                <option value="">Any</option>
                {(cats.data ?? []).map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Building (optional)">
            {(id) => (
              <select
                id={id}
                className={inputCls}
                value={bld}
                onChange={(e) => setBld(e.target.value)}
              >
                <option value="">Any</option>
                {(blds.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {formError && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {formError}
          </p>
        )}
        <button className={btn.primary} disabled={search.isPending}>
          <Icon name="find" className="mr-2 align-[-0.15em]" />
          {search.isPending ? 'Searching…' : 'Find rooms'}
        </button>
      </form>
      {search.isError && <ErrorBox error={search.error} />}
      {r && (
        <section aria-live="polite">
          <p className="mb-1 font-medium">{r.message}</p>
          <p className="mb-3 text-xs text-ink-mute">
            {r.interval.start_local} to {r.interval.end_local}. {r.basis}
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {r.rooms.map((c: any) => (
              <li key={c.classroom_id} className="neo p-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-semibold">
                    <RoomChip classroomId={c.classroom_id} name={c.name} />
                  </h3>
                  <StatusPill status="free" />
                </div>
                <p className="text-sm text-ink-soft">
                  {c.building.name}, floor {c.floor.level} · {c.capacity} seats · {c.category.name}
                </p>
                <ul className="mt-2 list-disc pl-5 text-sm text-ink-soft">
                  {c.reasons.map((x: string, i: number) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {r.alternatives.free_but_miss_a_filter.length > 0 && (
            <div className="mt-5">
              <h3 className="font-heading mb-1 font-semibold">Free, but not a full match</h3>
              <ul className="space-y-1 text-sm">
                {r.alternatives.free_but_miss_a_filter.map((c: any) => (
                  <li key={c.classroom_id}>
                    <RoomChip classroomId={c.classroom_id} name={c.name} /> ({c.building.name}):{' '}
                    {c.why_not.join(' ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.alternatives.free_later.length > 0 && (
            <div className="mt-5">
              <h3 className="font-heading mb-1 font-semibold">Available later</h3>
              <ul className="space-y-1 text-sm">
                {r.alternatives.free_later.map((c: any) => (
                  <li key={c.classroom_id}>
                    <RoomChip classroomId={c.classroom_id} name={c.name} /> ({c.building.name}) from{' '}
                    {c.start_local}, in {c.wait_minutes} minutes.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}
