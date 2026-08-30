import { describe, expect, it } from 'vitest';
import {
  resolveCityTime, athensWallClock, athensToday, tzOffsetMinutes,
  formatAthensClock, formatAthensParam, ATHENS_TZ,
} from '@/lib/cityTime';

describe('tzOffsetMinutes', () => {
  it('follows Athens between EET and EEST rather than hardcoding an offset', () => {
    // Winter: UTC+2. Summer: UTC+3. Getting this wrong puts the whole sky an
    // hour out for half the year.
    expect(tzOffsetMinutes(ATHENS_TZ, new Date('2026-01-15T12:00:00Z'))).toBe(120);
    expect(tzOffsetMinutes(ATHENS_TZ, new Date('2026-07-15T12:00:00Z'))).toBe(180);
  });

  it('reports UTC as zero offset from itself', () => {
    expect(tzOffsetMinutes('UTC', new Date('2026-07-15T12:00:00Z'))).toBe(0);
  });
});

describe('athensWallClock', () => {
  it('maps 02:00 Athens in summer to 23:00 UTC the previous day', () => {
    expect(athensWallClock(2026, 8, 30, 2, 0).toISOString()).toBe('2026-08-29T23:00:00.000Z');
  });

  it('maps 02:00 Athens in winter to 00:00 UTC the same day', () => {
    expect(athensWallClock(2026, 12, 21, 2, 0).toISOString()).toBe('2026-12-21T00:00:00.000Z');
  });

  it('round-trips: the instant it returns reads back as the wall clock asked for', () => {
    for (const [m, d, h] of [[1, 15, 2], [7, 15, 2], [3, 29, 14], [10, 25, 14]]) {
      const at = athensWallClock(2026, m, d, h, 30);
      expect(formatAthensClock(at)).toBe(`${String(h).padStart(2, '0')}:30`);
    }
  });
});

describe('resolveCityTime', () => {
  const now = new Date('2026-08-30T09:00:00Z');

  it('defaults to now, unoverridden, with no parameter', () => {
    for (const p of [null, undefined, '', '   ']) {
      const t = resolveCityTime(p, now);
      expect(t.date).toBe(now);
      expect(t.overridden).toBe(false);
    }
  });

  it('reads a bare HH:MM as Athens local time today', () => {
    const t = resolveCityTime('02:00', now);
    expect(t.overridden).toBe(true);
    expect(formatAthensClock(t.date)).toBe('02:00');
    // Today in Athens, which for 09:00Z is the 30th.
    expect(athensToday(t.date)).toEqual({ year: 2026, month: 8, day: 30 });
  });

  it('reads a date and time without a zone as Athens local', () => {
    const t = resolveCityTime('2026-12-21T02:00', now);
    expect(t.overridden).toBe(true);
    expect(t.date.toISOString()).toBe('2026-12-21T00:00:00.000Z');
  });

  it('respects an explicit offset when one is given', () => {
    const t = resolveCityTime('2026-12-21T02:00:00Z', now);
    expect(t.overridden).toBe(true);
    expect(t.date.toISOString()).toBe('2026-12-21T02:00:00.000Z');
  });

  it('falls back to the real sky rather than throwing on a bad value', () => {
    // A broken link should show what is actually overhead, not a blank page.
    for (const bad of ['not-a-time', '99:99', '25:00', '02:70', 'yesterday']) {
      const t = resolveCityTime(bad, now);
      expect(t.date).toBe(now);
      expect(t.overridden).toBe(false);
    }
  });
});

// ── formatAthensParam: the inverse of resolveCityTime ──────────────────────

describe('formatAthensParam', () => {
  it('round-trips through resolveCityTime to the same minute', () => {
    // What the city's time controls rely on: step an hour, format, put it in
    // the URL, and get back the instant you meant.
    for (const iso of [
      '2026-08-30T23:00:00Z',   // 02:00 Athens, EEST (UTC+3)
      '2026-12-21T00:30:00Z',   // 02:30 Athens, EET  (UTC+2), winter
      '2026-06-15T12:00:00Z',
    ]) {
      const at = new Date(iso);
      const back = resolveCityTime(formatAthensParam(at)).date;
      expect(back.getTime()).toBe(Math.floor(at.getTime() / 60000) * 60000);
    }
  });

  it('carries the date, so stepping past midnight does not snap back', () => {
    // 23:30 Athens + 1h is the NEXT day. The bare HH:MM form cannot say that,
    // which is exactly why the controls emit the full local ISO form.
    const at = new Date('2026-08-30T20:30:00Z');          // 23:30 Athens
    const nextHour = new Date(at.getTime() + 3600_000);   // 00:30, the 31st
    expect(formatAthensParam(at)).toBe('2026-08-30T23:30');
    expect(formatAthensParam(nextHour)).toBe('2026-08-31T00:30');
  });

  it('is marked as an override when it comes back', () => {
    expect(resolveCityTime(formatAthensParam(new Date())).overridden).toBe(true);
  });
});
