import { describe, expect, it } from 'vitest';
import {
  TIMEWARP_WINDOW_MS, formatWorldClock, warpBands, warpPaint, warpRemaining, worldClockReading,
} from '@/lib/worldClock';

// Built from local parts, so the expected strings hold in any timezone
// the tests run in -- the clock is on the viewer's own clock by design.
const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi);

describe('formatWorldClock', () => {
  it('is HH:MM DD.MM.YYYY, zero-padded', () => {
    expect(formatWorldClock(local(2028, 10, 3, 14, 3))).toBe('14:03 03.10.2028');
    expect(formatWorldClock(local(2026, 1, 9, 0, 0))).toBe('00:00 09.01.2026');
    expect(formatWorldClock(local(2026, 12, 31, 23, 59))).toBe('23:59 31.12.2026');
  });

  it('shows a given timezone\'s time instead of the viewer\'s, through DST and across midnight', () => {
    // Athens is UTC+3 in summer, UTC+2 in winter
    expect(formatWorldClock(new Date('2028-10-03T12:00:00Z'), 'Europe/Athens')).toBe('15:00 03.10.2028');
    expect(formatWorldClock(new Date('2026-01-09T22:30:00Z'), 'Europe/Athens')).toBe('00:30 10.01.2026');
    expect(formatWorldClock(new Date('2026-07-01T21:05:00Z'), 'America/New_York')).toBe('17:05 01.07.2026');
    expect(formatWorldClock(new Date('2026-07-01T00:00:00Z'), 'UTC')).toBe('00:00 01.07.2026');
  });
});

describe('worldClockReading', () => {
  const NOW = Date.UTC(2026, 8, 27, 10, 0);

  it('is the viewer\'s now, not warped, in normal time', () => {
    expect(worldClockReading({
      reverted: false, revertToDate: null, skyDate: null, skyDateReceivedAt: NOW - 5_000, now: NOW,
    })).toEqual({ date: new Date(NOW), warped: false });
  });

  it('is nothing at all until the merchant poll has answered', () => {
    expect(worldClockReading({
      reverted: false, revertToDate: null, skyDate: null, skyDateReceivedAt: null, now: NOW,
    })).toBeNull();
  });

  it('is nothing at all, never NaN, for an instant it cannot read', () => {
    expect(worldClockReading({
      reverted: true, revertToDate: 'not a date', skyDate: null, skyDateReceivedAt: NOW, now: NOW,
    })).toBeNull();
    expect(worldClockReading({
      reverted: false, revertToDate: null, skyDate: 'garbage', skyDateReceivedAt: NOW, now: NOW,
    })).toBeNull();
  });

  it('is the timewarped time, running on, while time is turned back', () => {
    // Half an hour into a timewarp to 12:00 the server said 12:30 a minute
    // ago; the clock has run on to 12:31.
    const reading = worldClockReading({
      reverted: true,
      revertToDate: '2028-10-03T12:00:00Z',
      skyDate: '2028-10-03T12:30:00Z',
      skyDateReceivedAt: NOW - 60_000,
      now: NOW,
    });
    expect(reading).toEqual({ date: new Date('2028-10-03T12:31:00Z'), warped: true });
  });

  it('never runs backwards when its own now is a moment older than the answer', () => {
    expect(worldClockReading({
      reverted: true, revertToDate: null, skyDate: '2028-10-03T12:00:00Z', skyDateReceivedAt: NOW + 800, now: NOW,
    })).toEqual({ date: new Date('2028-10-03T12:00:00Z'), warped: true });
  });

  it('falls back to the instant turned back to when no sky_date came with the revert', () => {
    expect(worldClockReading({
      reverted: true, revertToDate: '2028-10-03T12:00:00Z', skyDate: null, skyDateReceivedAt: NOW, now: NOW,
    })).toEqual({ date: new Date('2028-10-03T12:00:00Z'), warped: true });
  });

  it('follows a moved dev clock, running on from when it was read, as normal time', () => {
    const reading = worldClockReading({
      reverted: false,
      revertToDate: null,
      skyDate: '2028-10-03T12:00:00Z',
      skyDateReceivedAt: NOW - 90_000,
      now: NOW,
    });
    expect(reading).toEqual({ date: new Date(Date.parse('2028-10-03T12:00:00Z') + 90_000), warped: false });
  });

  it('is normal time when reverted is claimed without an instant', () => {
    expect(worldClockReading({
      reverted: true, revertToDate: null, skyDate: null, skyDateReceivedAt: NOW, now: NOW,
    })!.warped).toBe(false);
  });
});

describe('warpBands', () => {
  it('is nothing for no colour or one -- that is just the text colour', () => {
    expect(warpBands([])).toBeNull();
    expect(warpBands(['#a855f7'])).toBeNull();
  });

  it('splits two colours into even, hard-edged horizontal bands, top and bottom', () => {
    expect(warpBands(['#ff0000', '#008296'])).toBe(
      'linear-gradient(to bottom, #ff0000 0.00%, #ff0000 50.00%, #008296 50.00%, #008296 100.00%)',
    );
  });

  it('gives each more colour its own equal band', () => {
    const three = warpBands(['#a855f7', '#db9504', '#008296'])!;
    expect(three).toContain('#a855f7 0.00%, #a855f7 33.33%');
    expect(three).toContain('#db9504 33.33%, #db9504 66.67%');
    expect(three).toContain('#008296 66.67%, #008296 100.00%');
  });
});

describe('the timewarp draining from the clock', () => {
  const end = Date.parse('2026-09-27T13:00:00Z');
  const at = (msBeforeEnd: number) => end - msBeforeEnd;

  it('is the share of the hour left, clamped', () => {
    expect(warpRemaining('2026-09-27T13:00:00Z', at(TIMEWARP_WINDOW_MS))).toBe(1);
    expect(warpRemaining('2026-09-27T13:00:00Z', at(TIMEWARP_WINDOW_MS / 2))).toBe(0.5);
    expect(warpRemaining('2026-09-27T13:00:00Z', at(-1000))).toBe(0);
    expect(warpRemaining('2026-09-27T13:00:00Z', at(2 * TIMEWARP_WINDOW_MS))).toBe(1);
  });

  it('keeps the colour when the end is not known', () => {
    expect(warpRemaining(null, end)).toBe(1);
    expect(warpRemaining('not a date', end)).toBe(1);
  });

  it('lays grey from the left over the colours by the time spent', () => {
    expect(warpPaint(['#a855f7'], 0.5)).toBe(
      'linear-gradient(to right, #6b7280 0%, #6b7280 50.00%, transparent 50.00%, transparent 100%), ' +
        'linear-gradient(#a855f7, #a855f7)',
    );
    expect(warpPaint(['#ff0000', '#008296'], 1)).toContain('#6b7280 0.00%, transparent 0.00%');
    expect(warpPaint(['#ff0000', '#008296'], 1)).toContain(warpBands(['#ff0000', '#008296'])!);
    expect(warpPaint([], 0)).toContain('#6b7280 100.00%');
    expect(warpPaint([], 0)).toContain('#f87171');
  });
});
