import { BadRequestException } from '@nestjs/common';
import { Interval } from './engine';
import { HOUR, MINUTE, parseInstant } from './time';

export type Preset = 'now' | '30' | '60' | 'custom';

export interface IntervalQuery {
  preset?: Preset;
  start?: string;
  end?: string;
  duration_minutes?: number;
}

export const MAX_INTERVAL = 12 * HOUR;

/**
 * Turns the request into the interval to check.
 *   preset=now    free at this moment (a 1-minute probe)
 *   preset=30/60  free for the next 30 or 60 minutes without interruption
 *   preset=custom (or no preset) start plus end, or start plus duration_minutes
 * `start` defaults to the current time, so "free for 60 minutes starting 08:30" is preset=60&start=...
 * A start or end without a Z or offset is read as school time (Asia/Manila).
 */
export function resolveInterval(q: IntervalQuery, now: number): Interval {
  const read = (name: string, text: string) => {
    const ms = parseInstant(text);
    if (Number.isNaN(ms))
      throw new BadRequestException(`${name} is not a valid ISO 8601 date and time.`);
    return ms;
  };
  const preset: Preset = q.preset ?? (q.end || q.duration_minutes ? 'custom' : 'now');
  const fixed = preset === 'custom' ? undefined : { now: 1, '30': 30, '60': 60 }[preset];
  if (fixed !== undefined && (q.end || q.duration_minutes)) {
    throw new BadRequestException(
      'Do not combine preset now/30/60 with end or duration_minutes. Use preset=custom.',
    );
  }
  const start = q.start ? read('start', q.start) : now;
  let end: number;
  if (fixed !== undefined) {
    end = start + fixed * MINUTE;
  } else if (q.end) {
    end = read('end', q.end);
  } else if (q.duration_minutes) {
    end = start + q.duration_minutes * MINUTE;
  } else {
    throw new BadRequestException('A custom interval needs end or duration_minutes.');
  }
  if (end <= start) throw new BadRequestException('end must be later than start.');
  if (end - start > MAX_INTERVAL)
    throw new BadRequestException('The interval can be at most 12 hours.');
  return { start, end };
}
