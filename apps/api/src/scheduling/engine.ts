import { formatLocal, formatShort, MINUTE } from './time';

/**
 * The availability engine. Pure functions: rooms + expanded class occurrences + maintenance blocks in,
 * answers out. All intervals are half-open [start, end): a class that ends at 10:30 does NOT block a
 * search that starts at 10:30, and consecutive classes leave no gap. Times are epoch milliseconds.
 */
export interface RoomInfo {
  id: string;
  name: string;
  code: string | null;
  capacity: number;
  status: 'active' | 'inactive';
  modelObjectId: string | null;
  categoryCode: string;
  categoryName: string;
  floorId: string;
  floorLevel: number;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  equipment: { code: string; name: string; quantity: number }[];
}

export interface Busy {
  kind: 'class' | 'maintenance';
  start: number;
  end: number;
  label: string;
  teacher?: string | null;
  moved?: boolean;
}

export type BusyMap = Map<string, Busy[]>;

export interface OccurrenceRow {
  classroom_id: string;
  starts_at: string;
  ends_at: string;
  subject_code: string;
  section_code: string;
  teacher_name: string | null;
  is_moved: boolean;
}
export interface MaintenanceRow {
  classroom_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export function buildBusy(occurrences: OccurrenceRow[], maintenance: MaintenanceRow[]): BusyMap {
  const map: BusyMap = new Map();
  const add = (room: string, b: Busy) => {
    const list = map.get(room) ?? [];
    list.push(b);
    map.set(room, list);
  };
  for (const o of occurrences) {
    add(o.classroom_id, {
      kind: 'class',
      start: Date.parse(o.starts_at),
      end: Date.parse(o.ends_at),
      label: `${o.subject_code} ${o.section_code}`,
      teacher: o.teacher_name,
      moved: o.is_moved,
    });
  }
  for (const m of maintenance) {
    add(m.classroom_id, {
      kind: 'maintenance',
      start: Date.parse(m.starts_at),
      end: Date.parse(m.ends_at),
      label: 'Maintenance', // the reason stays admin-only (maintenance page)
    });
  }
  for (const list of map.values()) list.sort((a, b) => a.start - b.start || a.end - b.end);
  return map;
}

const overlaps = (b: Busy, start: number, end: number) => b.start < end && b.end > start;
const minutes = (ms: number) => Math.round(ms / MINUTE);

/* ------------------------------------------------------------------ status at one instant */

export type RoomState = 'free' | 'occupied' | 'maintenance' | 'inactive';

export interface RoomStatus {
  room: RoomInfo;
  state: RoomState;
  /** What is happening right now (class or maintenance), if anything. */
  current: Busy | null;
  /** When the room stops being blocked (occupied/maintenance), following back-to-back blocks. */
  availableFrom: number | null;
  /** When a free room is next needed. Null means nothing is scheduled within the loaded window. */
  freeUntil: number | null;
  nextClass: Busy | null;
}

export function statusAt(room: RoomInfo, busy: Busy[], at: number): RoomStatus {
  const base = { room, current: null, availableFrom: null, freeUntil: null, nextClass: null };
  if (room.status !== 'active') return { ...base, state: 'inactive' };

  const covering = busy.filter((b) => b.start <= at && at < b.end);
  const current = covering.find((b) => b.kind === 'maintenance') ?? covering[0] ?? null;
  const nextClass =
    busy.find((b) => b.kind === 'class' && b.start > at && !covering.includes(b)) ?? null;

  if (current) {
    let t = Math.max(...covering.map((b) => b.end));
    // follow back-to-back or overlapping blocks so "available from" is when the room is really free
    for (let moved = true; moved;) {
      moved = false;
      for (const b of busy) {
        if (b.start <= t && b.end > t) {
          t = b.end;
          moved = true;
        }
      }
    }
    return {
      ...base,
      state: current.kind === 'maintenance' ? 'maintenance' : 'occupied',
      current,
      availableFrom: t,
      nextClass,
    };
  }
  const next = busy.find((b) => b.start > at);
  return { ...base, state: 'free', freeUntil: next ? next.start : null, nextClass };
}

/* ------------------------------------------------------------------ the finder */

export interface EquipmentNeed {
  code: string;
  quantity: number;
}

export interface Criteria {
  buildingId?: string;
  floorId?: string;
  floorLevel?: number;
  minCapacity?: number;
  category?: string;
  equipment?: EquipmentNeed[];
  preferredBuildingId?: string;
  preferredFloorLevel?: number;
}

export interface Interval {
  start: number;
  end: number;
}

export interface Candidate {
  room: RoomInfo;
  /** True when no class, maintenance block or inactive status touches the requested interval. */
  free: boolean;
  /** Everything that stops the room from being used for the whole interval, in plain words. */
  blockers: string[];
  /** Filters the room does not meet. */
  mismatches: string[];
  freeFrom: number | null;
  freeUntil: number | null;
  nextClass: Busy | null;
  reasons: string[];
}

export function mismatchesFor(room: RoomInfo, c: Criteria): string[] {
  const out: string[] = [];
  if (c.buildingId && room.buildingId !== c.buildingId)
    out.push(`Not in the requested building (it is in ${room.buildingCode}).`);
  if (c.floorId && room.floorId !== c.floorId)
    out.push(`Not on the requested floor (it is on floor ${room.floorLevel}).`);
  if (c.floorLevel !== undefined && room.floorLevel !== c.floorLevel)
    out.push(`Not on floor ${c.floorLevel} (it is on floor ${room.floorLevel}).`);
  if (c.minCapacity !== undefined && room.capacity < c.minCapacity)
    out.push(`Seats ${room.capacity}, fewer than the ${c.minCapacity} needed.`);
  if (c.category && room.categoryCode !== c.category)
    out.push(`Is a ${room.categoryName}, not the requested room type.`);
  for (const need of c.equipment ?? []) {
    const have = room.equipment.find((e) => e.code === need.code)?.quantity ?? 0;
    if (have < need.quantity) {
      out.push(
        have === 0
          ? `Has no ${need.code}.`
          : `Has ${have} ${need.code}, fewer than the ${need.quantity} needed.`,
      );
    }
  }
  return out;
}

export function evaluate(room: RoomInfo, busy: Busy[], iv: Interval, c: Criteria): Candidate {
  const need = minutes(iv.end - iv.start);
  const blockers: string[] = [];
  if (room.status !== 'active') {
    blockers.push('The room is inactive.');
  } else {
    for (const b of busy.filter((x) => overlaps(x, iv.start, iv.end))) {
      const what = b.kind === 'maintenance' ? 'Maintenance' : `Class ${b.label}`;
      if (b.start <= iv.start) {
        blockers.push(
          b.kind === 'maintenance'
            ? `${b.label} runs until ${formatShort(b.end, iv.start)}.`
            : `${what} is in progress until ${formatShort(b.end, iv.start)}.`,
        );
      } else {
        blockers.push(
          `${what} starts at ${formatShort(b.start, iv.start)}, leaving only ${minutes(b.start - iv.start)} minutes free (${need} needed).`,
        );
      }
    }
  }
  const free = blockers.length === 0;
  const mismatches = mismatchesFor(room, c);

  const before = busy.filter((b) => b.end <= iv.start);
  const after = busy.filter((b) => b.start >= iv.end);
  const freeFrom = free && before.length ? Math.max(...before.map((b) => b.end)) : null;
  const freeUntil = free && after.length ? Math.min(...after.map((b) => b.start)) : null;
  const nextClass =
    busy.find((b) => b.kind === 'class' && b.start >= iv.start && !overlaps(b, iv.start, iv.end)) ??
    null;

  const reasons: string[] = [];
  if (free) {
    reasons.push(
      `Free for the whole requested time (${formatShort(iv.start, iv.start)} to ${formatShort(iv.end, iv.start)}).`,
    );
    reasons.push(
      nextClass
        ? `Next class here: ${nextClass.label} at ${formatShort(nextClass.start, iv.start)}.`
        : 'No class is scheduled here in the following 24 hours.',
    );
    if (c.minCapacity !== undefined)
      reasons.push(`Seats ${room.capacity} (${c.minCapacity} needed).`);
    else reasons.push(`Seats ${room.capacity}.`);
    if (c.category) reasons.push(`Is a ${room.categoryName}.`);
    for (const need of c.equipment ?? []) {
      const have = room.equipment.find((e) => e.code === need.code)?.quantity ?? 0;
      if (have >= need.quantity) reasons.push(`Has ${have} ${need.code}.`);
    }
    if (c.preferredBuildingId && room.buildingId === c.preferredBuildingId)
      reasons.push(`In your preferred building (${room.buildingCode}).`);
    reasons.push(`Floor ${room.floorLevel} of ${room.buildingCode}.`);
  }
  return { room, free, blockers, mismatches, freeFrom, freeUntil, nextClass, reasons };
}

/** Sort key, ascending. Order of importance: sensible size, preferred building, nearness to preferred floor, tight fit, ground floor. */
function rankKey(cand: Candidate, c: Criteria): (number | string)[] {
  const r = cand.room;
  const oversized = c.minCapacity !== undefined && r.capacity > c.minCapacity * 1.5 ? 1 : 0;
  const buildingMiss = c.preferredBuildingId && r.buildingId !== c.preferredBuildingId ? 1 : 0;
  const floorDist = Math.abs(r.floorLevel - (c.preferredFloorLevel ?? 1));
  const surplus = c.minCapacity !== undefined ? r.capacity - c.minCapacity : 0;
  return [oversized, buildingMiss, floorDist, surplus, r.floorLevel, r.buildingCode, r.name];
}

function compareKeys(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export interface LaterSlot {
  room: RoomInfo;
  start: number;
  end: number;
  waitMinutes: number;
  reasons: string[];
}

/** Earliest start at or after the requested start where `room` is free for the whole duration, within the horizon. */
export function nextFreeStart(busy: Busy[], iv: Interval, horizonEnd: number): number | null {
  const len = iv.end - iv.start;
  let t = iv.start;
  for (let guard = 0; guard < 500; guard++) {
    if (t + len > horizonEnd) return null;
    const hit = busy.filter((b) => overlaps(b, t, t + len));
    if (!hit.length) return t;
    t = Math.max(...hit.map((b) => b.end));
  }
  return null;
}

export interface SearchResult {
  qualifying: Candidate[];
  freeButMismatch: Candidate[];
  laterSlots: LaterSlot[];
  unavailable: Candidate[];
  message: string;
}

export function search(
  rooms: RoomInfo[],
  busy: BusyMap,
  iv: Interval,
  criteria: Criteria,
  opts: { horizonEnd: number; limit: number },
): SearchResult {
  const all = rooms.map((r) => evaluate(r, busy.get(r.id) ?? [], iv, criteria));
  const sorter = (a: Candidate, b: Candidate) =>
    compareKeys(rankKey(a, criteria), rankKey(b, criteria));

  const qualifying = all.filter((c) => c.free && c.mismatches.length === 0).sort(sorter);
  const freeButMismatch = all
    .filter((c) => c.free && c.mismatches.length > 0)
    .sort((a, b) => a.mismatches.length - b.mismatches.length || sorter(a, b))
    .slice(0, 5);

  const laterSlots: LaterSlot[] = [];
  if (qualifying.length === 0) {
    for (const c of all.filter(
      (x) => !x.free && x.mismatches.length === 0 && x.room.status === 'active',
    )) {
      const start = nextFreeStart(busy.get(c.room.id) ?? [], iv, opts.horizonEnd);
      if (start !== null) {
        const end = start + (iv.end - iv.start);
        laterSlots.push({
          room: c.room,
          start,
          end,
          waitMinutes: minutes(start - iv.start),
          reasons: [
            `Free from ${formatShort(start, iv.start)} to ${formatShort(end, iv.start)}.`,
            ...c.blockers,
          ],
        });
      }
    }
    laterSlots.sort((a, b) => a.start - b.start || a.room.name.localeCompare(b.room.name));
    laterSlots.splice(5);
  }

  const total = qualifying.length;
  const when = `${formatShort(iv.start, iv.start)} to ${formatShort(iv.end, iv.start)}`;
  let message: string;
  if (total > 0) {
    message = `${total} room${total === 1 ? ' is' : 's are'} free from ${when} and match your filters.`;
  } else if (freeButMismatch.length || laterSlots.length) {
    const parts: string[] = [];
    if (freeButMismatch.length)
      parts.push(
        `${freeButMismatch.length} room${freeButMismatch.length === 1 ? ' is' : 's are'} free then but miss at least one filter`,
      );
    if (laterSlots.length)
      parts.push(
        `${laterSlots.length} matching room${laterSlots.length === 1 ? ' becomes' : 's become'} free later`,
      );
    message = `No room matches all your filters for ${when}. ${parts.join(', and ')}.`;
  } else {
    message = `No room matches your filters for ${when}, and none becomes free in the next 24 hours.`;
  }

  return {
    qualifying: qualifying.slice(0, opts.limit),
    freeButMismatch,
    laterSlots,
    unavailable: all.filter((c) => !c.free).sort(sorter),
    message,
  };
}

export { formatLocal };
