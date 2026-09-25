import { describe, expect, it } from 'vitest';
import {
  emergenceAltitudeDeg, twilightVisibility, magnitudeSizeFactor, ALWAYS_VISIBLE_MAG,
  SIZE_EMPHASIS,
} from '@/lib/planetBrightness';

// Representative apparent magnitudes, for ordering rather than precision --
// the real values come from Astronomy.Illumination at the drawn instant.
const VENUS = -4.3;
const JUPITER = -2.5;
const MERCURY = -0.5;
const SATURN = 0.8;
const MARS = 1.5;
const MOON = -12.7;

describe('emergence order', () => {
  it('brings the planets out in order of brightness, brightest first', () => {
    // The bug this replaces showed every planet at one threshold, so Saturn
    // arrived at the same instant as Venus.
    const order = [VENUS, JUPITER, MERCURY, SATURN, MARS].map(emergenceAltitudeDeg);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeLessThanOrEqual(order[i - 1]);
    }
  });

  it('has Venus out essentially at sunset, as the evening star is', () => {
    expect(emergenceAltitudeDeg(VENUS)).toBeGreaterThan(-1);
  });

  it('makes nothing wait for darker than astronomical twilight', () => {
    expect(emergenceAltitudeDeg(6)).toBeGreaterThanOrEqual(-10);
  });

  it('treats the very brightest as always up', () => {
    expect(emergenceAltitudeDeg(MOON)).toBe(90);
    expect(emergenceAltitudeDeg(ALWAYS_VISIBLE_MAG)).toBe(90);
  });
});

describe('twilightVisibility', () => {
  it('shows the Moon in the afternoon', () => {
    expect(twilightVisibility(40, MOON)).toBe(1);
  });

  it('hides a planet while the Sun is well up, and shows it at night', () => {
    expect(twilightVisibility(30, MERCURY)).toBe(0);
    expect(twilightVisibility(-18, MERCURY)).toBe(1);
  });

  it('has Venus already glowing when Saturn is not yet there', () => {
    // The user-visible symptom: at dusk Venus should be out and the faint
    // planets should not.
    const atDusk = -1;
    expect(twilightVisibility(atDusk, VENUS)).toBeGreaterThan(0);
    expect(twilightVisibility(atDusk, SATURN)).toBe(0);
  });

  it('fades rather than switching, so nothing pops on', () => {
    const e = emergenceAltitudeDeg(JUPITER);
    const mid = twilightVisibility(e, JUPITER);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('rises monotonically as the Sun sets', () => {
    let prev = -1;
    for (let alt = 5; alt >= -15; alt -= 1) {
      const v = twilightVisibility(alt, MERCURY);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('magnitudeSizeFactor', () => {
  it('sits half way back from the raw enlargement, which read as too much', () => {
    // Venus came out nearly 3x its old size on the first pass.
    const raw = 1 + 0.2 * 4.3;
    expect(magnitudeSizeFactor(VENUS)).toBeCloseTo(1 + (raw - 1) * SIZE_EMPHASIS, 6);
    expect(magnitudeSizeFactor(VENUS)).toBeLessThan(raw);
  });

  it('draws a brighter planet larger', () => {
    expect(magnitudeSizeFactor(VENUS)).toBeGreaterThan(magnitudeSizeFactor(SATURN));
  });

  it('keeps the range sane rather than following the true flux ratio', () => {
    // Venus really is ~100x Saturn's flux; at that ratio it would be a moon.
    expect(magnitudeSizeFactor(VENUS) / magnitudeSizeFactor(MARS)).toBeLessThan(3);
    // Bounds follow from the raw clamp pulled halfway back by SIZE_EMPHASIS.
    expect(magnitudeSizeFactor(-30)).toBeLessThanOrEqual(1 + 1.2 * SIZE_EMPHASIS);
    expect(magnitudeSizeFactor(20)).toBeGreaterThanOrEqual(1 - 0.25 * SIZE_EMPHASIS);
  });
});
