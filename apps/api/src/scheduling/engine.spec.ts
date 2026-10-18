import {
  buildBusy,
  Busy,
  Criteria,
  evaluate,
  nextFreeStart,
  OccurrenceRow,
  RoomInfo,
  search,
  statusAt,
} from './engine';
import { parseInstant as t } from './time';

const room = (over: Partial<RoomInfo> & { id: string; name: string }): RoomInfo => ({
  code: null,
  capacity: 40,
  status: 'active',
  modelObjectId: null,
  categoryCode: 'regular',
  categoryName: 'Regular classroom',
  floorId: 'f1',
  floorLevel: 1,
  buildingId: 'bL',
  buildingCode: 'CONG-L',
  buildingName: 'Left wing',
  equipment: [],
  ...over,
});

const iso = (local: string) => new Date(t(local)).toISOString();
const klass = (
  roomId: string,
  from: string,
  to: string,
  subject = 'MATH',
  section = 'A',
  moved = false,
): OccurrenceRow => ({
  classroom_id: roomId,
  starts_at: iso(from),
  ends_at: iso(to),
  subject_code: subject,
  section_code: section,
  teacher_name: 'Sample Teacher',
  is_moved: moved,
});
const D = '2026-10-19'; // a Monday
const at = (hhmm: string) => t(`${D}T${hhmm}`);
const iv = (a: string, b: string) => ({ start: at(a), end: at(b) });

const A = room({
  id: 'A',
  name: 'Room A',
  equipment: [
    { code: 'projector', name: 'Projector', quantity: 1 },
    { code: 'whiteboard', name: 'Whiteboard', quantity: 1 },
  ],
});
const busyOf = (
  rows: OccurrenceRow[],
  maint: { classroom_id: string; starts_at: string; ends_at: string; reason: string | null }[] = [],
) => buildBusy(rows, maint);
const list = (m: Map<string, Busy[]>, id: string) => m.get(id) ?? [];

describe('exact boundaries (intervals are half-open)', () => {
  const busy = list(busyOf([klass('A', `${D}T09:00`, `${D}T10:30`)]), 'A');

  it('a search that ends exactly when a class starts is free', () => {
    expect(evaluate(A, busy, iv('08:30', '09:00'), {}).free).toBe(true);
  });
  it('a search that starts exactly when a class ends is free', () => {
    expect(evaluate(A, busy, iv('10:30', '11:00'), {}).free).toBe(true);
  });
  it('one minute of overlap at either edge blocks the room', () => {
    expect(evaluate(A, busy, iv('08:30', '09:01'), {}).free).toBe(false);
    expect(evaluate(A, busy, iv('10:29', '11:00'), {}).free).toBe(false);
  });
});

describe('overlapping intervals', () => {
  const busy = list(busyOf([klass('A', `${D}T09:00`, `${D}T10:30`)]), 'A');
  it.each([
    ['inside the class', '09:15', '09:45'],
    ['containing the class', '08:00', '11:00'],
    ['overlapping the start', '08:30', '09:30'],
    ['overlapping the end', '10:00', '11:00'],
    ['identical to the class', '09:00', '10:30'],
  ])('is blocked when the search is %s', (_n, a, b) => {
    const c = evaluate(A, busy, iv(a, b), {});
    expect(c.free).toBe(false);
    expect(c.blockers.length).toBeGreaterThan(0);
  });
});

describe('consecutive classes', () => {
  const rows = [
    klass('A', `${D}T09:00`, `${D}T10:30`, 'MATH', 'A'),
    klass('A', `${D}T10:30`, `${D}T12:00`, 'ENG', 'B'),
  ];
  const busy = list(busyOf(rows), 'A');

  it('leave no gap between them', () => {
    expect(evaluate(A, busy, iv('10:30', '10:31'), {}).free).toBe(false);
    expect(evaluate(A, busy, iv('10:29', '10:31'), {}).free).toBe(false);
  });
  it('the next free start follows the whole back-to-back chain', () => {
    expect(nextFreeStart(busy, iv('09:00', '09:30'), at('23:00'))).toBe(at('12:00'));
  });
  it('status follows the chain too: occupied now, available from the end of the last class', () => {
    const s = statusAt(A, busy, at('09:30'));
    expect(s.state).toBe('occupied');
    expect(s.current?.label).toBe('MATH A');
    expect(s.availableFrom).toBe(at('12:00'));
  });
});

describe('maintenance blocks', () => {
  const B = room({ id: 'B', name: 'Room B' });
  const maint = [
    {
      classroom_id: 'B',
      starts_at: iso(`${D}T08:00`),
      ends_at: iso(`${D}T12:00`),
      reason: 'Broken AC',
    },
  ];
  const busy = list(busyOf([klass('B', `${D}T09:00`, `${D}T10:00`)], maint), 'B');

  it('block the room (the reason stays private)', () => {
    const c = evaluate(B, busy, iv('11:00', '11:30'), {});
    expect(c.free).toBe(false);
    expect(c.blockers.join(' ')).toMatch(/Maintenance runs until 12:00/);
    expect(c.blockers.join(' ')).not.toMatch(/Broken AC/);
  });
  it('win over a class in the same slot when reporting status', () => {
    expect(statusAt(B, busy, at('09:30')).state).toBe('maintenance');
  });
  it('end cleanly: free right when the block ends', () => {
    expect(evaluate(B, busy, iv('12:00', '12:30'), {}).free).toBe(true);
    expect(statusAt(B, busy, at('08:30')).availableFrom).toBe(at('12:00'));
  });
  it('a block that starts soon cuts a search short', () => {
    const c = evaluate(B, list(busyOf([], maint), 'B'), iv('07:30', '08:30'), {});
    expect(c.free).toBe(false);
    expect(c.blockers[0]).toMatch(/starts at 08:00, leaving only 30 minutes free/);
  });
});

describe('the 20-minute rule', () => {
  const busy = list(busyOf([klass('A', `${D}T09:00`, `${D}T10:30`)]), 'A');
  it('a class starting in 20 minutes means the room is NOT free for 30 uninterrupted minutes', () => {
    const c = evaluate(A, busy, iv('08:40', '09:10'), {});
    expect(c.free).toBe(false);
    expect(c.blockers[0]).toBe(
      'Class MATH A starts at 09:00, leaving only 20 minutes free (30 needed).',
    );
  });
  it('but it is free for a 15 or 20 minute stay', () => {
    expect(evaluate(A, busy, iv('08:40', '08:55'), {}).free).toBe(true);
    expect(evaluate(A, busy, iv('08:40', '09:00'), {}).free).toBe(true);
  });
});

describe('30 and 60 minute searches', () => {
  // free gap 09:00-10:00 between two classes
  const busy = list(
    busyOf([klass('A', `${D}T08:00`, `${D}T09:00`), klass('A', `${D}T10:00`, `${D}T11:00`)]),
    'A',
  );
  it('a 60-minute gap fits 30 and 60 but not 61 minutes', () => {
    expect(evaluate(A, busy, iv('09:00', '09:30'), {}).free).toBe(true);
    expect(evaluate(A, busy, iv('09:00', '10:00'), {}).free).toBe(true);
    expect(evaluate(A, busy, iv('09:00', '10:01'), {}).free).toBe(false);
  });
  it('reports when the free time started, when it ends, and the next class', () => {
    const c = evaluate(A, busy, iv('09:10', '09:40'), {});
    expect(c.freeFrom).toBe(at('09:00'));
    expect(c.freeUntil).toBe(at('10:00'));
    expect(c.nextClass?.label).toBe('MATH A');
  });
});

describe('inactive rooms', () => {
  const X = room({ id: 'X', name: 'Closed room', status: 'inactive' });
  it('are never free and are reported as inactive', () => {
    expect(evaluate(X, [], iv('09:00', '09:30'), {}).free).toBe(false);
    expect(evaluate(X, [], iv('09:00', '09:30'), {}).blockers).toEqual(['The room is inactive.']);
    expect(statusAt(X, [], at('09:00')).state).toBe('inactive');
  });
});

describe('capacity, room type, equipment, building and floor filters', () => {
  const lab = room({
    id: 'L',
    name: 'Comlab',
    capacity: 30,
    categoryCode: 'comlab',
    categoryName: 'Computer laboratory',
    floorId: 'f2',
    floorLevel: 2,
    buildingId: 'bR',
    buildingCode: 'CONG-R',
    equipment: [{ code: 'computers', name: 'Computers', quantity: 25 }],
  });
  const crit = (c: Criteria) => evaluate(lab, [], iv('09:00', '10:00'), c);

  it('accepts a room that meets every filter', () => {
    expect(
      crit({
        minCapacity: 30,
        category: 'comlab',
        equipment: [{ code: 'computers', quantity: 25 }],
        buildingId: 'bR',
        floorLevel: 2,
      }).mismatches,
    ).toEqual([]);
  });
  it('rejects a room that is too small and explains', () => {
    expect(crit({ minCapacity: 31 }).mismatches).toEqual(['Seats 30, fewer than the 31 needed.']);
  });
  it('rejects the wrong room type', () => {
    expect(crit({ category: 'lab' }).mismatches[0]).toMatch(/not the requested room type/);
  });
  it('rejects missing or too few pieces of equipment', () => {
    expect(crit({ equipment: [{ code: 'projector', quantity: 1 }] }).mismatches).toEqual([
      'Has no projector.',
    ]);
    expect(crit({ equipment: [{ code: 'computers', quantity: 26 }] }).mismatches).toEqual([
      'Has 25 computers, fewer than the 26 needed.',
    ]);
  });
  it('rejects another building or floor', () => {
    expect(crit({ buildingId: 'bL' }).mismatches[0]).toMatch(
      /Not in the requested building \(it is in CONG-R\)/,
    );
    expect(crit({ floorLevel: 3 }).mismatches[0]).toMatch(/Not on floor 3/);
  });
});

describe('search and ranking', () => {
  const rooms = [
    room({ id: 'big', name: 'Hall', capacity: 120, floorLevel: 1 }),
    room({ id: 'fit', name: 'Fit', capacity: 45, floorLevel: 3, floorId: 'f3' }),
    room({
      id: 'fitR',
      name: 'FitR',
      capacity: 44,
      floorLevel: 1,
      buildingId: 'bR',
      buildingCode: 'CONG-R',
    }),
    room({ id: 'ground', name: 'Ground', capacity: 50, floorLevel: 1 }),
    room({ id: 'busy', name: 'Busy', capacity: 45 }),
  ];
  const busy = busyOf([klass('busy', `${D}T09:00`, `${D}T10:00`)]);
  const run = (c: Criteria) =>
    search(rooms, busy, iv('09:00', '09:30'), c, { horizonEnd: at('23:00'), limit: 50 });

  it('returns only rooms free for the whole interval, never the busy one', () => {
    const r = run({ minCapacity: 40 });
    expect(r.qualifying.map((c) => c.room.id)).not.toContain('busy');
  });
  it('puts right-sized rooms before oversized ones, then the lower floor', () => {
    const ids = run({ minCapacity: 40 }).qualifying.map((c) => c.room.id);
    expect(ids.indexOf('big')).toBe(ids.length - 1); // 120 seats for 40 people is oversized
    expect(ids.indexOf('fitR')).toBeLessThan(ids.indexOf('fit')); // floor 1 before floor 3
  });
  it('prefers the requested building', () => {
    const ids = run({ minCapacity: 40, preferredBuildingId: 'bR' }).qualifying.map(
      (c) => c.room.id,
    );
    expect(ids[0]).toBe('fitR');
  });
  it('explains why each room qualifies', () => {
    const top = run({ minCapacity: 40, preferredBuildingId: 'bR' }).qualifying[0];
    expect(top.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Free for the whole requested time/),
        'Seats 44 (40 needed).',
        'In your preferred building (CONG-R).',
      ]),
    );
  });
  it('honours the result limit but still reports the full count in the message', () => {
    const r = search(rooms, busy, iv('09:00', '09:30'), {}, { horizonEnd: at('23:00'), limit: 2 });
    expect(r.qualifying).toHaveLength(2);
    expect(r.message).toMatch(/^4 rooms are free/);
  });
});

describe('when nothing matches', () => {
  const rooms = [
    room({ id: 'r1', name: 'Room 1', capacity: 40 }),
    room({ id: 'small', name: 'Small', capacity: 20 }),
  ];

  it('offers free rooms that miss a filter and rooms that free up later, with honest wording', () => {
    const busy = busyOf([klass('r1', `${D}T09:00`, `${D}T10:00`)]);
    const r = search(
      rooms,
      busy,
      iv('09:00', '09:30'),
      { minCapacity: 35 },
      { horizonEnd: at('23:00'), limit: 10 },
    );
    expect(r.qualifying).toHaveLength(0);
    expect(r.freeButMismatch.map((c) => c.room.id)).toEqual(['small']);
    expect(r.freeButMismatch[0].mismatches[0]).toMatch(/Seats 20/);
    expect(r.laterSlots).toHaveLength(1);
    expect(r.laterSlots[0]).toMatchObject({ start: at('10:00'), waitMinutes: 60 });
    expect(r.message).toMatch(/^No room matches all your filters/);
  });

  it('says so plainly, and invents nothing, when there is no alternative at all', () => {
    const none = [room({ id: 'x', name: 'X', capacity: 10 })];
    const r = search(
      none,
      new Map(),
      iv('09:00', '09:30'),
      { minCapacity: 99 },
      { horizonEnd: at('23:00'), limit: 10 },
    );
    expect(r.qualifying).toHaveLength(0);
    expect(r.laterSlots).toHaveLength(0);
    expect(r.freeButMismatch).toHaveLength(1);
    const empty = search(
      [],
      new Map(),
      iv('09:00', '09:30'),
      {},
      { horizonEnd: at('23:00'), limit: 10 },
    );
    expect(empty.message).toMatch(/none becomes free in the next 24 hours/);
  });

  it('does not suggest a later slot beyond the look-ahead horizon', () => {
    const busy = busyOf([klass('r1', `${D}T09:00`, `${D}T23:30`)]);
    const r = search(
      [rooms[0]],
      busy,
      iv('09:00', '09:30'),
      {},
      { horizonEnd: at('12:00'), limit: 10 },
    );
    expect(r.laterSlots).toHaveLength(0);
  });
});

describe('moved classes (one-date changes) arrive as ordinary occurrences', () => {
  it('block the new room and are labelled as moved', () => {
    const busy = list(busyOf([klass('A', `${D}T13:00`, `${D}T14:00`, 'PHYS', 'A', true)]), 'A');
    expect(evaluate(A, busy, iv('13:30', '14:30'), {}).free).toBe(false);
    expect(busy[0].moved).toBe(true);
  });
});

describe('status at an instant', () => {
  const busy = list(busyOf([klass('A', `${D}T09:00`, `${D}T10:30`)]), 'A');
  it('free rooms report how long they stay free and the next class', () => {
    const s = statusAt(A, busy, at('08:00'));
    expect(s).toMatchObject({ state: 'free', freeUntil: at('09:00') });
    expect(s.nextClass?.label).toBe('MATH A');
  });
  it('a class that ends exactly now no longer occupies the room', () => {
    expect(statusAt(A, busy, at('10:30')).state).toBe('free');
  });
  it('a class that starts exactly now occupies it', () => {
    expect(statusAt(A, busy, at('09:00')).state).toBe('occupied');
  });
});
