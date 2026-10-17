import { describe, expect, it } from 'vitest';
import { conjunctionsBetween, fullMoonsBetween, newMoonsBetween, skyEventsBetween } from '@/lib/skyCalendar';

// Instants wom-be computed (engine/moon.py, engine/conjunctions.py) for
// 2026-10-01 .. 2027-04-01 -- the merchants the globe will actually show.
const start = new Date('2026-10-01T00:00:00Z');
const end = new Date('2027-04-01T00:00:00Z');
const near = (a: Date, iso: string, seconds: number) =>
  expect(Math.abs(a.getTime() - Date.parse(iso)) / 1000).toBeLessThanOrEqual(seconds);

describe('skyCalendar', () => {
  it('full moons follow the backend mean cycle', () => {
    const moons = fullMoonsBetween(start, end);
    expect(moons).toHaveLength(6);
    near(moons[0], '2026-10-26T05:33:34.877Z', 1);
    near(moons[5], '2027-03-22T21:13:49.261Z', 1);
  });

  it('new moons match the backend ephemeris', () => {
    const moons = newMoonsBetween(start, end);
    const want = [
      '2026-10-10T15:50:36Z', '2026-11-09T07:02:42Z', '2026-12-09T00:52:31Z',
      '2027-01-07T20:25:05Z', '2027-02-06T15:56:47Z', '2027-03-08T09:30:07Z',
    ];
    expect(moons).toHaveLength(want.length);
    moons.forEach((m, i) => near(m, want[i], 60));
  });

  it('conjunctions match the backend scan', () => {
    const found = conjunctionsBetween(start, end);
    expect(found.map((c) => c.bodies.join('-'))).toEqual(['Mercury-Venus', 'Mars-Jupiter']);
    near(found[0].at, '2026-10-07T00:05:52Z', 60);
    near(found[1].at, '2026-11-16T06:21:58Z', 60);
  });

  it('lists all of them in time order', () => {
    const events = skyEventsBetween(start, new Date('2026-11-01T00:00:00Z'));
    expect(events.map((e) => e.kind)).toEqual(['conjunction', 'new_moon', 'full_moon']);
    expect(events[2].bodies).toEqual(['Moon']);
  });
});
