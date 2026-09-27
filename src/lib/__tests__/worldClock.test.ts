import { describe, expect, it } from 'vitest';
import { formatWorldClock, worldClockReading } from '@/lib/worldClock';

// Built from local parts, so the expected strings hold in any timezone
// the tests run in -- the clock is on the viewer's own clock by design.
const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi);

describe('formatWorldClock', () => {
  it('is HH:MM DD.MM.YYYY, zero-padded', () => {
    expect(formatWorldClock(local(2028, 10, 3, 14, 3))).toBe('14:03 03.10.2028');
    expect(formatWorldClock(local(2026, 1, 9, 0, 0))).toBe('00:00 09.01.2026');
    expect(formatWorldClock(local(2026, 12, 31, 23, 59))).toBe('23:59 31.12.2026');
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
