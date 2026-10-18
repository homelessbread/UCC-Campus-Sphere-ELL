import { SCHOOL_TIME_ZONE } from '@ucc/shared';

/**
 * Time handling for the school's time zone (Asia/Manila). Instants are epoch milliseconds (UTC).
 * Local school times are written "YYYY-MM-DD" plus minutes after midnight. Nothing here uses the server's own zone.
 */
const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export interface LocalParts {
  /** YYYY-MM-DD in school time. */
  date: string;
  /** Minutes after local midnight. */
  minutes: number;
  /** ISO weekday: 1 = Monday ... 7 = Sunday. */
  isoWeekday: number;
}

function read(ms: number) {
  const o: Record<string, number> = {};
  for (const p of parts.formatToParts(new Date(ms)))
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}

export function localParts(ms: number): LocalParts {
  const p = read(ms);
  const date = `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const wd = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { date, minutes: p.hour * 60 + p.minute, isoWeekday: wd === 0 ? 7 : wd };
}

function offsetMs(ms: number): number {
  const p = read(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant at which the school clock reads `date` + `minutes`. */
export function localToInstant(date: string, minutes: number): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - offsetMs(guess);
  return guess - offsetMs(first);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** "2026-10-19 08:30" in school time. */
export function formatLocal(ms: number): string {
  const l = localParts(ms);
  return `${l.date} ${hhmm(l.minutes)}`;
}

/** "08:30", or "2026-10-20 08:30" when the date differs from `relativeTo`'s date. */
export function formatShort(ms: number, relativeTo: number): string {
  const l = localParts(ms);
  return l.date === localParts(relativeTo).date ? hhmm(l.minutes) : `${l.date} ${hhmm(l.minutes)}`;
}

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Reads an ISO 8601 timestamp. With a "Z" or an offset it is an exact instant. WITHOUT one, it is read as school
 * time, so "2026-10-19T08:30" means 08:30 in Manila. Returns NaN when it cannot be read.
 */
export function parseInstant(text: string): number {
  if (HAS_OFFSET.test(text)) return Date.parse(text);
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim());
  if (!m) return NaN;
  const probe = Date.parse(`${m[1]}T00:00:00Z`);
  if (Number.isNaN(probe)) return NaN;
  return (
    localToInstant(m[1], Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) + Number(m[4] ?? 0) * 1000
  );
}
