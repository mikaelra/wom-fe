import { describe, expect, it } from 'vitest';
import {
  CONJUNCTION_COLOR, FULL_MOON_MERCHANT_COLOR, merchantArrivalLine, timewarpEventLabels,
  merchantEventLatLng, merchantMarkerLabel, merchantMarkerLatLng,
  PLANET_COLOR, REVERT_RELIC_NAMES, arcDegrees, merchantMarkerColors, PLANET_RADIUS_KM, sphereDrop, MARKER_MIN_SEPARATION_DEG, placeMerchantMarkers,
} from '@/lib/merchant';
import { bodyColorHex } from '@/lib/astrology';
import { CITIES } from '@/lib/cities';
import { FULL_MOON_EVENT, MERCURY_JUPITER_EVENT } from '@/lib/__tests__/merchantFixtures';

describe('merchantMarkerLatLng', () => {
  it('is deterministic for the same period', () => {
    const a = merchantMarkerLatLng('2026-09-26T16:49:32Z');
    const b = merchantMarkerLatLng('2026-09-26T16:49:32Z');
    expect(a).toEqual(b);
  });

  it('moves for a different period', () => {
    const a = merchantMarkerLatLng('2026-09-26T16:49:32Z');
    const b = merchantMarkerLatLng('2026-08-28T02:18:11Z');
    expect(a).not.toEqual(b);
  });

  it('stays within the usable lat/lng band, away from the poles', () => {
    const seeds = [
      '2026-09-26T16:49:32Z', '2026-08-28T02:18:11Z', '', 'x', '2040-01-01T00:00:00Z',
    ];
    for (const seed of seeds) {
      const { lat, lng } = merchantMarkerLatLng(seed);
      expect(lat).toBeGreaterThanOrEqual(-60);
      expect(lat).toBeLessThanOrEqual(60);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
  });
});

describe('merchantEventLatLng', () => {
  it('seeds the full moon (no key) exactly as before, so its marker has not moved', () => {
    expect(merchantEventLatLng('2026-09-26T16:49:32Z', '')).toEqual(merchantMarkerLatLng('2026-09-26T16:49:32Z'));
  });

  it('parts two conjunctions that share a period (under one revert)', () => {
    const a = merchantEventLatLng('2026-09-26T16:00:00Z', 'Mercury-Jupiter');
    const b = merchantEventLatLng('2026-09-26T16:00:00Z', 'Venus-Mars');
    expect(a).not.toEqual(b);
  });
});

describe('PLANET_COLOR', () => {
  it('uses the same planet colours the globe draws', () => {
    for (const body of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const) {
      expect(PLANET_COLOR[body]).toBe(bodyColorHex(body));
    }
  });
});

describe('timewarpEventLabels', () => {
  it('is just the kind: Full moon in purple, Conjunction in orange, full moon first', () => {
    expect(timewarpEventLabels([MERCURY_JUPITER_EVENT, FULL_MOON_EVENT])).toEqual([
      { text: 'Full moon', color: FULL_MOON_MERCHANT_COLOR },
      { text: 'Conjunction', color: CONJUNCTION_COLOR },
    ]);
  });

  it('names two conjunctions at one moment once', () => {
    const other = { ...MERCURY_JUPITER_EVENT, key: 'Venus-Mars', bodies: ['Venus', 'Mars'] };
    expect(timewarpEventLabels([MERCURY_JUPITER_EVENT, other])).toEqual([
      { text: 'Conjunction', color: CONJUNCTION_COLOR },
    ]);
  });

  it('is nothing for a quiet moment, or a kind it does not know yet', () => {
    expect(timewarpEventLabels([])).toEqual([]);
    expect(timewarpEventLabels([{ ...MERCURY_JUPITER_EVENT, kind: 'trine' }])).toEqual([]);
  });
});

describe('merchantMarkerLabel', () => {
  it('drops the article', () => {
    expect(merchantMarkerLabel('The Merchant')).toBe('Merchant');
    expect(merchantMarkerLabel('Merchant')).toBe('Merchant');
  });
});

describe('REVERT_RELIC_NAMES', () => {
  it('is what each merchant sells', () => {
    expect([...REVERT_RELIC_NAMES]).toEqual(['Stone of Vitality', 'Paper']);
  });
});

describe('merchantArrivalLine', () => {
  it('is by what summons him, never the particular event', () => {
    expect(merchantArrivalLine('full_moon')).toBe('Appears around the full moon');
    expect(merchantArrivalLine('conjunction')).toBe('Appears around conjunctions');
  });
});

describe('arcDegrees', () => {
  it('measures along the globe', () => {
    expect(arcDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 90 })).toBeCloseTo(90, 9);
    expect(arcDegrees({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBeCloseTo(0, 4);
    expect(arcDegrees({ lat: 90, lng: 0 }, { lat: -90, lng: 0 })).toBeCloseTo(180, 9);
  });
});

describe('placeMerchantMarkers', () => {
  const athens = CITIES[0];
  const clearOfAll = (spots: { lat: number; lng: number }[]) => {
    for (const [i, s] of spots.entries()) {
      for (const city of CITIES) expect(arcDegrees(s, city)).toBeGreaterThanOrEqual(MARKER_MIN_SEPARATION_DEG);
      for (const t of spots.slice(i + 1)) expect(arcDegrees(s, t)).toBeGreaterThanOrEqual(MARKER_MIN_SEPARATION_DEG);
    }
  };

  it('never puts a merchant on Greece -- the Mars-Jupiter seed that landed there live', () => {
    const [spot] = placeMerchantMarkers([{ period_start: '2026-11-16T06:21:58+00:00', event_key: 'Mars-Jupiter' }]);
    expect(arcDegrees(spot, athens)).toBeGreaterThanOrEqual(MARKER_MIN_SEPARATION_DEG);
  });

  it('keeps a seed that is already clear exactly where it was', () => {
    const periods = Array.from({ length: 40 }, (_, i) => `2026-01-${String(i % 28 + 1).padStart(2, '0')}T0${i % 10}:00:00Z`);
    const clearSeed = periods.find((p) => arcDegrees(merchantMarkerLatLng(p), athens) >= MARKER_MIN_SEPARATION_DEG)!;
    expect(placeMerchantMarkers([{ period_start: clearSeed, event_key: '' }])).toEqual([merchantMarkerLatLng(clearSeed)]);
  });

  it('never puts two merchants on top of each other or on a city, across many periods', () => {
    for (let d = 1; d <= 200; d++) {
      const period = new Date(Date.UTC(2026, 0, d)).toISOString();
      clearOfAll(placeMerchantMarkers([
        { period_start: period, event_key: '' },
        { period_start: period, event_key: 'Mercury-Jupiter' },
        { period_start: period, event_key: 'Venus-Mars' },
      ]));
    }
  });

  it('forces a re-roll when a seed collides, and is the same for every player', () => {
    // Avoid a point right on the first seed's spot: it must move, twice alike.
    const seed = { period_start: '2026-09-26T16:49:32Z', event_key: '' };
    const onIt = merchantMarkerLatLng(seed.period_start);
    const a = placeMerchantMarkers([seed], [onIt]);
    const b = placeMerchantMarkers([seed], [onIt]);
    expect(arcDegrees(a[0], onIt)).toBeGreaterThanOrEqual(MARKER_MIN_SEPARATION_DEG);
    expect(a).toEqual(b);
  });

  it('gives up re-rolling after a bounded number of tries rather than looping', () => {
    // A ring of avoid points covering the whole band leaves nowhere clear.
    const everywhere = [];
    for (let lat = -60; lat <= 60; lat += 10) for (let lng = -180; lng < 180; lng += 10) everywhere.push({ lat, lng });
    expect(placeMerchantMarkers([{ period_start: 'x', event_key: '' }], everywhere)).toHaveLength(1);
  });
});

describe('merchantMarkerColors', () => {
  const conj = (a: string, b: string) => ({ kind: 'conjunction', key: `${a}-${b}`, bodies: [a, b], sign: 'Leo', at: 'x' });

  it('fills with the bigger planet and rings with the other, whichever is named first', () => {
    expect(merchantMarkerColors(conj('Mars', 'Jupiter'))).toEqual({ fill: '#008296', outline: '#ff0000' });
    expect(merchantMarkerColors(conj('Jupiter', 'Mars'))).toEqual({ fill: '#008296', outline: '#ff0000' });
    expect(merchantMarkerColors(conj('Mercury', 'Venus'))).toEqual({ fill: '#ab9d00', outline: '#db9504' });
  });

  it('ranks the planets by size: Jupiter, Saturn, Venus, Mars, Mercury', () => {
    const bySize = Object.keys(PLANET_RADIUS_KM).sort((a, b) => PLANET_RADIUS_KM[b] - PLANET_RADIUS_KM[a]);
    expect(bySize).toEqual(['Jupiter', 'Saturn', 'Venus', 'Mars', 'Mercury']);
    expect(merchantMarkerColors(conj('Venus', 'Saturn')).fill).toBe('#a16300');
  });

  it('keeps the full moon purple with no planet outline', () => {
    expect(merchantMarkerColors(FULL_MOON_EVENT)).toEqual({ fill: FULL_MOON_MERCHANT_COLOR, outline: null });
    expect(merchantMarkerColors(null)).toEqual({ fill: FULL_MOON_MERCHANT_COLOR, outline: null });
  });

  it('falls back to the purple for a body it does not know', () => {
    expect(merchantMarkerColors(conj('Mars', 'Pluto'))).toEqual({ fill: FULL_MOON_MERCHANT_COLOR, outline: null });
  });
});

describe('sphereDrop', () => {
  it('is zero at the touching point and grows toward the edge', () => {
    expect(sphereDrop(2.5, 0)).toBe(0);
    expect(sphereDrop(2.5, 0.66)).toBeCloseTo(2.5 - Math.sqrt(2.5 ** 2 - 0.66 ** 2), 12);
    expect(sphereDrop(2.5, -0.66)).toBe(sphereDrop(2.5, 0.66));
  });

  it('bottoms out at the sphere radius rather than going NaN past it', () => {
    expect(sphereDrop(2.5, 10)).toBe(2.5);
  });
});
