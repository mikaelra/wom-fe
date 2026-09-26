import { describe, expect, it } from 'vitest';
import {
  blendPlanetColors, describeMerchantEvent, FULL_MOON_MERCHANT_COLOR, merchantArrivalLine,
  merchantEventColor, merchantEventLatLng, merchantMarkerLabel, merchantMarkerLatLng,
  PLANET_COLOR, REVERT_RELIC_NAMES, arcDegrees, MARKER_MIN_SEPARATION_DEG, placeMerchantMarkers,
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

/** Lightness of a #rrggbb colour, 0..1. */
function lightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return (Math.max(...c) + Math.min(...c)) / 2;
}

describe('blendPlanetColors', () => {
  it('uses the same planet colours the globe draws', () => {
    for (const body of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const) {
      expect(PLANET_COLOR[body]).toBe(bodyColorHex(body));
    }
  });

  it('is the same whichever planet is named first', () => {
    expect(blendPlanetColors('Mars', 'Jupiter')).toBe(blendPlanetColors('Jupiter', 'Mars'));
  });

  it('keeps every pair readable: no muddy dark average, no wash to white', () => {
    const planets = Object.keys(PLANET_COLOR);
    for (const a of planets) {
      for (const b of planets) {
        if (a === b) continue;
        const color = blendPlanetColors(a, b);
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
        expect(lightness(color)).toBeGreaterThanOrEqual(0.59);
        expect(lightness(color)).toBeLessThanOrEqual(0.73);
      }
    }
  });

  it('lands between the two hues: Mars red and Jupiter teal do not make Mars red', () => {
    const blend = blendPlanetColors('Mars', 'Jupiter');
    expect(blend).not.toBe(blendPlanetColors('Mars', 'Mars'));
    expect(blend).not.toBe(blendPlanetColors('Jupiter', 'Jupiter'));
  });

  it('a grey mix (no saturation) stays grey', () => {
    PLANET_COLOR.Grey = 0x808080;
    try {
      expect(blendPlanetColors('Grey', 'Grey')).toBe('#999999');
    } finally {
      delete PLANET_COLOR.Grey;
    }
  });

  it('falls back to the full-moon purple for a body it does not know', () => {
    expect(blendPlanetColors('Mars', 'Pluto')).toBe(FULL_MOON_MERCHANT_COLOR);
  });
});

describe('merchantEventColor', () => {
  it('is the purple for the full moon, and for no event at all', () => {
    expect(merchantEventColor(FULL_MOON_EVENT)).toBe(FULL_MOON_MERCHANT_COLOR);
    expect(merchantEventColor(null)).toBe(FULL_MOON_MERCHANT_COLOR);
  });

  it('is the blend of the two planets for a conjunction', () => {
    expect(merchantEventColor(MERCURY_JUPITER_EVENT)).toBe(blendPlanetColors('Mercury', 'Jupiter'));
  });
});

describe('describing events', () => {
  it('names the full moon by sign', () => {
    expect(describeMerchantEvent(FULL_MOON_EVENT)).toBe('Full moon in Aries');

  });

  it('names a conjunction by its two planets and sign', () => {
    expect(describeMerchantEvent(MERCURY_JUPITER_EVENT)).toBe('Conjunction between Mercury and Jupiter in Libra');

  });

  it('still says something for a kind it does not know yet', () => {
    const trine = { kind: 'trine', key: 'Venus-Mars', bodies: ['Venus', 'Mars'], sign: 'Leo', at: 'x' };
    expect(describeMerchantEvent(trine)).toBe('trine in Leo');
    expect(describeMerchantEvent({ ...trine, sign: '' })).toBe('trine');
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
