import { describe, expect, it } from 'vitest';
import { CITIES, findCity, latLngToVec3 } from '@/lib/cities';

describe('findCity', () => {
  it('resolves a city by its name slug, case-insensitively', () => {
    expect(findCity('athens')?.name).toBe('Athens');
    expect(findCity('Athens')?.name).toBe('Athens');
    expect(findCity('ATHENS')?.name).toBe('Athens');
    expect(findCity('  athens  ')?.name).toBe('Athens');
  });

  it('also resolves by numeric id, so either form of link works', () => {
    const athens = CITIES.find((c) => c.name === 'Athens')!;
    expect(findCity(String(athens.id))?.name).toBe('Athens');
  });

  it('returns undefined for anything unrecognised rather than guessing', () => {
    expect(findCity('atlantis')).toBeUndefined();
    expect(findCity('')).toBeUndefined();
    expect(findCity('   ')).toBeUndefined();
    expect(findCity(null)).toBeUndefined();
    expect(findCity(undefined)).toBeUndefined();
    expect(findCity('999')).toBeUndefined();
  });
});

describe('marker labels', () => {
  it("labels the Athens sword GREECE -- the country, not the action", () => {
    // docs/CITY_SCENE_PLAN.md §4.2: the sword names the place you are going,
    // because clicking it now opens the city rather than starting a fight.
    // CityMarker renders city.actionLabel verbatim, so this is the whole
    // contract -- the render itself is R3F and not unit-testable here.
    const athens = CITIES.find((c) => c.name === 'Athens')!;
    expect(athens.actionLabel).toBe('GREECE');
  });

  it('leaves New York unlabelled, because its pill is live queue state', () => {
    const ny = CITIES.find((c) => c.name === 'New York');
    // Still present until step 7 moves ranked into the city.
    expect(ny).toBeDefined();
    expect(ny!.actionLabel).toBeUndefined();
  });
});

describe('latLngToVec3', () => {
  it('places a point on the sphere of the requested radius', () => {
    for (const [lat, lng] of [[0, 0], [37.9838, -25], [-90, 0], [90, 0], [12, 170]]) {
      const [x, y, z] = latLngToVec3(lat, lng, 2.5);
      expect(Math.hypot(x, y, z)).toBeCloseTo(2.5, 6);
    }
  });

  it('puts the poles on the Y axis, where longitude is meaningless', () => {
    const [, northY] = latLngToVec3(90, 0, 1);
    const [, southY] = latLngToVec3(-90, 0, 1);
    expect(northY).toBeCloseTo(1, 6);
    expect(southY).toBeCloseTo(-1, 6);
    // Every longitude collapses to the same point at the pole -- which is
    // why cities.ts's header says the poles cannot calibrate the longitude
    // mapping, only the latitude one.
    const a = latLngToVec3(90, 0, 1);
    const b = latLngToVec3(90, 123, 1);
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
  });
});
