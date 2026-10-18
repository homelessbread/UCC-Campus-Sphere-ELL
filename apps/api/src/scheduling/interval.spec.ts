import { BadRequestException } from '@nestjs/common';
import { resolveInterval } from './interval';
import { MINUTE, parseInstant } from './time';

const NOW = parseInstant('2026-10-19T08:40');

describe('resolveInterval', () => {
  it('"now" is a one-minute probe starting at the current time', () => {
    expect(resolveInterval({ preset: 'now' }, NOW)).toEqual({ start: NOW, end: NOW + MINUTE });
    expect(resolveInterval({}, NOW)).toEqual({ start: NOW, end: NOW + MINUTE });
  });

  it('30 and 60 mean the next half hour and hour', () => {
    expect(resolveInterval({ preset: '30' }, NOW).end - NOW).toBe(30 * MINUTE);
    expect(resolveInterval({ preset: '60' }, NOW).end - NOW).toBe(60 * MINUTE);
  });

  it('a start can be given with a preset', () => {
    const iv = resolveInterval({ preset: '60', start: '2026-10-20T13:00' }, NOW);
    expect(iv.start).toBe(parseInstant('2026-10-20T13:00'));
    expect(iv.end - iv.start).toBe(60 * MINUTE);
  });

  it('custom takes end or duration', () => {
    expect(
      resolveInterval(
        { preset: 'custom', start: '2026-10-19T09:00', end: '2026-10-19T10:30' },
        NOW,
      ),
    ).toEqual({
      start: parseInstant('2026-10-19T09:00'),
      end: parseInstant('2026-10-19T10:30'),
    });
    expect(resolveInterval({ start: '2026-10-19T09:00', duration_minutes: 45 }, NOW).end).toBe(
      parseInstant('2026-10-19T09:45'),
    );
  });

  it('refuses bad requests', () => {
    expect(() => resolveInterval({ preset: 'custom' }, NOW)).toThrow(BadRequestException);
    expect(() =>
      resolveInterval({ start: '2026-10-19T10:00', end: '2026-10-19T09:00' }, NOW),
    ).toThrow(/later than start/);
    expect(() =>
      resolveInterval({ start: '2026-10-19T10:00', end: '2026-10-19T10:00' }, NOW),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveInterval({ start: '2026-10-19T00:00', duration_minutes: 721 }, NOW),
    ).toThrow(/12 hours/);
    expect(() => resolveInterval({ preset: '30', duration_minutes: 20 }, NOW)).toThrow(
      /preset=custom/,
    );
    expect(() => resolveInterval({ start: 'tomorrow-ish' }, NOW)).toThrow(/not a valid/);
  });
});
