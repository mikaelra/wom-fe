import { describe, expect, it } from 'vitest';
import { computeSky } from '@/lib/astrology';
import type { AspectBody } from '@/lib/astrology';
import {
  localFrame, horizonFromSnapshot, horizonTopocentric, horizonOf, horizonOfRaDec,
  isAboveHorizon, nightness, twilightBand, sunAltitude, sunEvents, compassPoint, TWILIGHT,
  sunIsDown,
} from '@/lib/skyLocal';
import { CITIES } from '@/lib/cities';

// Read the coordinates from the real city record rather than a copy: these
// tests exist to guard lib/cities.ts's own realLng against being swapped for
// its mirrored lng, so they have to be looking at the actual shipped data.
const ATHENS = CITIES.find((c) => c.name === 'Athens')!;

// A fixed instant, so every expectation below is a real ephemeris value and
// not a moving target. Summer solstice evening, Athens: the Sun is just
// below the horizon, which exercises the twilight path.
const SOLSTICE = new Date('2026-06-21T20:00:00Z');
const sky = computeSky(SOLSTICE);
const frame = localFrame(sky, ATHENS.realLat, ATHENS.realLng);

// The mirrored value that lib/cities.ts stores for the globe texture.
const MIRRORED_LNG = ATHENS.lng;   // the mirrored value the globe marker uses

const PLANETS: AspectBody[] = ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

describe('the mirrored-longitude guard', () => {
  // The single most valuable test in this file. cities.ts stores Athens at
  // lng: -25 (mirrored for an east/west-flipped globe texture). Handing that
  // to an Observer does not throw -- it just produces a confident, wrong sky.
  it('puts Athens sunset at its real time when given the real longitude', () => {
    const midnight = localFrame(computeSky(new Date('2026-06-21T00:00:00Z')), ATHENS.realLat, ATHENS.realLng);
    const { sunset } = sunEvents(midnight);
    expect(sunset).not.toBeNull();
    // 2026-06-21 sunset over Athens: 17:50:58Z (20:50 local, EEST).
    expect(Math.abs(sunset!.getTime() - Date.parse('2026-06-21T17:50:58Z'))).toBeLessThan(60_000);
  });

  it('diverges by hours if the mirrored longitude is wired in by mistake', () => {
    const sky0 = computeSky(new Date('2026-06-21T00:00:00Z'));
    const real = sunEvents(localFrame(sky0, ATHENS.realLat, ATHENS.realLng)).sunset!;
    const wrong = sunEvents(localFrame(sky0, ATHENS.realLat, MIRRORED_LNG)).sunset!;
    const hoursApart = Math.abs(wrong.getTime() - real.getTime()) / 3.6e6;
    // Measured at 3.25 h. Asserting "> 1 h" keeps the test about the failure
    // being loud rather than about the exact size of the error.
    expect(hoursApart).toBeGreaterThan(1);
  });

  it("keeps Athens' realLng genuine and distinct from its mirrored lng", () => {
    expect(ATHENS.realLng).toBeCloseTo(23.7275, 3);
    expect(ATHENS.realLng).not.toBe(ATHENS.lng);
    // The mirror relation cities.ts documents: system_lng = -1.3 - real_lng.
    expect(-1.3 - ATHENS.realLng).toBeCloseTo(ATHENS.lng, 1);
    // Latitude is NOT mirrored -- the two forms must agree.
    expect(ATHENS.realLat).toBe(ATHENS.lat);
  });

  it('holds the same invariants for every city, so a new one cannot skip them', () => {
    for (const city of CITIES) {
      expect(city.realLat).toBe(city.lat);
      expect(-1.3 - city.realLng).toBeCloseTo(city.lng, 1);
      expect(Math.abs(city.realLat)).toBeLessThanOrEqual(90);
      expect(Math.abs(city.realLng)).toBeLessThanOrEqual(180);
    }
  });
});

describe('rotating the shared snapshot into the local horizon', () => {
  // Proves the Y-up (three) <-> Z-up (astronomy-engine) swizzle in
  // toAstroVector is right: if it were wrong, these would diverge wildly
  // rather than agree to a thousandth of a degree.
  it.each(PLANETS)('matches a from-scratch topocentric computation for %s', (body) => {
    const snap = horizonFromSnapshot(sky, body, frame);
    const topo = horizonTopocentric(body, frame);
    expect(Math.abs(snap.altitude - topo.altitude)).toBeLessThan(0.01);
    const azDelta = Math.abs(((snap.azimuth - topo.azimuth + 540) % 360) - 180);
    expect(azDelta).toBeLessThan(0.01);
  });

  it('differs for the Moon by the parallax of standing on the surface', () => {
    const snap = horizonFromSnapshot(sky, 'Moon', frame);
    const topo = horizonTopocentric('Moon', frame);
    const delta = Math.abs(snap.altitude - topo.altitude);
    // Real and expected: the snapshot is geocentric and the Moon is close.
    expect(delta).toBeGreaterThan(0.1);
    // Still far inside the Moon's 10 deg aspect orb, so it cannot flip a
    // conjunction verdict (docs/ASPECTS_PLAN.md 2.1).
    expect(delta).toBeLessThan(1.5);
  });

  it('renders the Moon topocentrically and the planets from the snapshot', () => {
    expect(horizonOf(sky, 'Moon', frame)).toEqual(horizonTopocentric('Moon', frame));
    expect(horizonOf(sky, 'Jupiter', frame)).toEqual(horizonFromSnapshot(sky, 'Jupiter', frame));
  });

  it('reports altitude and azimuth in the documented ranges', () => {
    for (const body of [...PLANETS, 'Moon' as AspectBody]) {
      const { altitude, azimuth } = horizonOf(sky, body, frame);
      expect(altitude).toBeGreaterThanOrEqual(-90);
      expect(altitude).toBeLessThanOrEqual(90);
      expect(azimuth).toBeGreaterThanOrEqual(0);
      expect(azimuth).toBeLessThan(360);
    }
  });

  it('agrees with isAboveHorizon on the sign of the altitude', () => {
    for (const body of [...PLANETS, 'Moon' as AspectBody]) {
      const pos = horizonOf(sky, body, frame);
      expect(isAboveHorizon(pos)).toBe(pos.altitude > 0);
    }
  });
});

describe('horizonOfRaDec (the star catalogue)', () => {
  // Polaris sits near the celestial pole, so from the northern hemisphere it
  // stands due north at roughly the observer's latitude and barely moves all
  // night while everything else wheels around it. That pins the rotation, the
  // latitude and the time-independence in one assertion.
  //
  // "Near", not "on": at dec +89.26 it is POLAR_DISTANCE off the pole and
  // therefore traces a small circle of that radius, so its altitude varies by
  // +/- 0.74 deg through the night. Tolerances below are that figure plus a
  // margin, NOT slack hiding an error -- an implementation that was actually
  // wrong would be out by degrees, not by less than one.
  const POLARIS = { ra: 2 + 31 / 60, dec: 89.26 };
  const POLAR_DISTANCE = 90 - POLARIS.dec;   // 0.74 deg

  it('stands Polaris due north at roughly the latitude', () => {
    const pos = horizonOfRaDec(POLARIS.ra, POLARIS.dec, frame);
    expect(Math.abs(pos.altitude - ATHENS.realLat)).toBeLessThan(POLAR_DISTANCE + 0.2);
    const offNorth = Math.min(pos.azimuth, 360 - pos.azimuth);
    expect(offNorth).toBeLessThan(2);
  });

  it('keeps Polaris put as the night turns, unlike everything else', () => {
    const later = localFrame(
      computeSky(new Date(SOLSTICE.getTime() + 6 * 3600_000)),
      ATHENS.realLat, ATHENS.realLng,
    );
    const a = horizonOfRaDec(POLARIS.ra, POLARIS.dec, frame);
    const b = horizonOfRaDec(POLARIS.ra, POLARIS.dec, later);
    // Bounded by the diameter of its little circle around the pole.
    expect(Math.abs(a.altitude - b.altitude)).toBeLessThan(2 * POLAR_DISTANCE + 0.2);

    // A star on the celestial equator must have moved far further in the
    // same six hours -- otherwise the rotation is not being applied at all
    // and Polaris' stillness would prove nothing. The CONTRAST is the claim;
    // the absolute figure is not, since how much altitude a star trades for
    // azimuth depends on where in its arc it happens to be (this one moves
    // ~11 deg, another would move more).
    const equatorial = { ra: 6, dec: 0 };
    const e1 = horizonOfRaDec(equatorial.ra, equatorial.dec, frame);
    const e2 = horizonOfRaDec(equatorial.ra, equatorial.dec, later);
    const equatorialMoved = Math.abs(e1.altitude - e2.altitude);
    const polarisMoved = Math.abs(a.altitude - b.altitude);
    expect(equatorialMoved).toBeGreaterThan(5);
    expect(equatorialMoved).toBeGreaterThan(polarisMoved * 5);
  });

  it('puts a far-southern star below the Athens horizon', () => {
    // Canopus, dec -52.7: never rises from 38 deg north.
    const pos = horizonOfRaDec(6 + 24 / 60, -52.7, frame);
    expect(pos.altitude).toBeLessThan(0);
  });
});

describe('day and night', () => {
  it('puts the Sun high at Athens midday and below the horizon at night', () => {
    const noon = localFrame(computeSky(new Date('2026-06-21T09:00:00Z')), ATHENS.realLat, ATHENS.realLng);
    expect(sunAltitude(computeSky(new Date('2026-06-21T09:00:00Z')), noon)).toBeGreaterThan(60);

    const night = localFrame(computeSky(new Date('2026-06-21T22:00:00Z')), ATHENS.realLat, ATHENS.realLng);
    expect(sunAltitude(computeSky(new Date('2026-06-21T22:00:00Z')), night)).toBeLessThan(-18);
  });

  it('names each twilight band from the Sun altitude', () => {
    expect(twilightBand(10)).toBe('day');
    expect(twilightBand(0.1)).toBe('day');
    expect(twilightBand(-3)).toBe('civil');
    expect(twilightBand(-9)).toBe('nautical');
    expect(twilightBand(-15)).toBe('astronomical');
    expect(twilightBand(-25)).toBe('night');
  });

  it('treats each threshold as the dark edge of the band above it', () => {
    expect(twilightBand(TWILIGHT.day)).toBe('civil');
    expect(twilightBand(TWILIGHT.civil)).toBe('nautical');
    expect(twilightBand(TWILIGHT.nautical)).toBe('astronomical');
    expect(twilightBand(TWILIGHT.astronomical)).toBe('night');
  });

  it('says the Sun is down from sunset until sunrise', () => {
    // Drives whether the city's campfire is laid at all.
    expect(sunIsDown(45)).toBe(false);
    expect(sunIsDown(0.1)).toBe(false);
    expect(sunIsDown(-0.1)).toBe(true);
    expect(sunIsDown(-6)).toBe(true);
    expect(sunIsDown(-90)).toBe(true);
  });

  it('puts the Sun down at exactly the altitude twilightBand stops saying day', () => {
    // The two must agree on the crossing, or the fire is alight in a scene
    // still being drawn as daylight (or the reverse).
    expect(sunIsDown(TWILIGHT.day)).toBe(true);
    expect(twilightBand(TWILIGHT.day)).not.toBe('day');
  });

  it('agrees with the real sunset and sunrise it is standing in for', () => {
    // The point of reading the altitude rather than SearchRiseSet is that
    // the two say the same thing; this checks that, either side of a real
    // computed Athens sunset.
    const frameAt = (iso: string) =>
      localFrame(computeSky(new Date(iso)), ATHENS.realLat, ATHENS.realLng);
    const midday = frameAt('2026-06-21T09:00:00Z');
    const { sunset } = sunEvents(midday);
    expect(sunset).not.toBeNull();

    const before = new Date(sunset!.getTime() - 5 * 60_000);
    const after = new Date(sunset!.getTime() + 5 * 60_000);
    expect(sunIsDown(sunAltitude(computeSky(before), frameAt(before.toISOString())))).toBe(false);
    expect(sunIsDown(sunAltitude(computeSky(after), frameAt(after.toISOString())))).toBe(true);
  });

  it('gives nightness 0 in daylight, 1 past astronomical twilight, and clamps outside', () => {
    expect(nightness(45)).toBe(0);
    expect(nightness(0)).toBe(0);
    expect(nightness(-18)).toBe(1);
    expect(nightness(-90)).toBe(1);
  });

  it('increases nightness monotonically as the Sun sinks, with no jump at a band edge', () => {
    let prev = -1;
    for (let alt = 1; alt >= -20; alt -= 0.25) {
      const n = nightness(alt);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    // Continuous across every boundary -- this is what stops the sky popping
    // as the scene crosses from one band into the next.
    for (const edge of [TWILIGHT.civil, TWILIGHT.nautical, TWILIGHT.astronomical]) {
      const jump = Math.abs(nightness(edge + 0.01) - nightness(edge - 0.01));
      expect(jump).toBeLessThan(0.01);
    }
  });

  it('finds a later sunset in summer than in winter at Athens', () => {
    const summer = sunEvents(localFrame(computeSky(new Date('2026-06-21T00:00:00Z')), ATHENS.realLat, ATHENS.realLng));
    const winter = sunEvents(localFrame(computeSky(new Date('2026-12-21T00:00:00Z')), ATHENS.realLat, ATHENS.realLng));
    const utcHour = (d: Date) => d.getUTCHours() + d.getUTCMinutes() / 60;
    expect(utcHour(summer.sunset!)).toBeGreaterThan(utcHour(winter.sunset!) + 2);
    // Both sunrises precede their sunsets on the same day.
    expect(summer.sunrise!.getTime()).toBeLessThan(summer.sunset!.getTime());
  });
});

describe('compassPoint', () => {
  it('names the cardinal and intercardinal directions', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('W');
    expect(compassPoint(45)).toBe('NE');
    expect(compassPoint(225)).toBe('SW');
  });

  it('wraps past 360 and handles negatives', () => {
    expect(compassPoint(360)).toBe('N');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(-90)).toBe('W');
    expect(compassPoint(450)).toBe('E');
  });
});
