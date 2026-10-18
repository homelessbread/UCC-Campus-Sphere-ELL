import {
  addDays,
  formatLocal,
  formatShort,
  localParts,
  localToInstant,
  parseInstant,
} from './time';

describe('school time (Asia/Manila)', () => {
  it('reads the same instant from Z, +08:00 and no offset (no offset means Manila time)', () => {
    const a = parseInstant('2026-10-19T08:30:00+08:00');
    expect(parseInstant('2026-10-19T00:30:00Z')).toBe(a);
    expect(parseInstant('2026-10-19T08:30')).toBe(a);
    expect(parseInstant('2026-10-19 08:30:00')).toBe(a);
    expect(parseInstant('2026-10-19')).toBe(parseInstant('2026-10-19T00:00:00+08:00'));
  });

  it('rejects text that is not a date', () => {
    expect(parseInstant('yesterday')).toBeNaN();
    expect(parseInstant('2026-13-45')).toBeNaN();
  });

  it('converts across the date line: 17:00Z on Sunday is 01:00 on Monday in Manila', () => {
    const l = localParts(Date.parse('2026-10-18T17:00:00Z'));
    expect(l).toEqual({ date: '2026-10-19', minutes: 60, isoWeekday: 1 });
  });

  it('numbers weekdays as ISO (Monday 1 ... Sunday 7)', () => {
    expect(localParts(parseInstant('2026-10-19T12:00')).isoWeekday).toBe(1);
    expect(localParts(parseInstant('2026-10-25T12:00')).isoWeekday).toBe(7);
  });

  it('round-trips local date and minutes to an instant', () => {
    const ms = localToInstant('2026-10-19', 9 * 60 + 30);
    expect(new Date(ms).toISOString()).toBe('2026-10-19T01:30:00.000Z');
    expect(localParts(ms)).toMatchObject({ date: '2026-10-19', minutes: 570 });
  });

  it('formats school time and adds days across month ends', () => {
    expect(formatLocal(Date.parse('2026-10-19T01:30:00Z'))).toBe('2026-10-19 09:30');
    expect(formatShort(Date.parse('2026-10-19T01:30:00Z'), parseInstant('2026-10-19T08:00'))).toBe(
      '09:30',
    );
    expect(formatShort(Date.parse('2026-10-20T01:30:00Z'), parseInstant('2026-10-19T08:00'))).toBe(
      '2026-10-20 09:30',
    );
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
