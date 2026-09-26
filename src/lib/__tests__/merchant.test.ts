import { describe, expect, it } from 'vitest';
import {
  blendPlanetColors, describeMerchantEvent, FULL_MOON_MERCHANT_COLOR, merchantArrivalLine,
  merchantEventColor, merchantEventLatLng, merchantMarkerLabel, merchantMarkerLatLng,
  PLANET_COLOR, REVERT_RELIC_NAMES,
} from '@/lib/merchant';
import { bodyColorHex } from '@/lib/astrology';
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
    expect(merchantArrivalLine(FULL_MOON_EVENT)).toBe('Appears at the full moon in Aries');
  });

  it('names a conjunction by its two planets and sign', () => {
    expect(describeMerchantEvent(MERCURY_JUPITER_EVENT)).toBe('Conjunction between Mercury and Jupiter in Libra');
    expect(merchantArrivalLine(MERCURY_JUPITER_EVENT)).toBe('Appears at the conjunction of Mercury and Jupiter in Libra');
  });

  it('still says something for a kind it does not know yet', () => {
    const trine = { kind: 'trine', key: 'Venus-Mars', bodies: ['Venus', 'Mars'], sign: 'Leo', at: 'x' };
    expect(describeMerchantEvent(trine)).toBe('trine in Leo');
    expect(merchantArrivalLine(trine)).toBe('Appears at trine in Leo');
    expect(describeMerchantEvent({ ...trine, sign: '' })).toBe('trine');
  });
});

describe('merchantMarkerLabel', () => {
  it('drops the article', () => {
    expect(merchantMarkerLabel('The Merchant')).toBe('Merchant');
    expect(merchantMarkerLabel('The Scribe')).toBe('Scribe');
    expect(merchantMarkerLabel('Scribe')).toBe('Scribe');
  });
});

describe('REVERT_RELIC_NAMES', () => {
  it('is what each merchant sells', () => {
    expect([...REVERT_RELIC_NAMES]).toEqual(['Stone of Vitality', 'Paper']);
  });
});
