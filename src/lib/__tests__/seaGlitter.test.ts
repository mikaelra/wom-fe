import { describe, expect, it } from 'vitest';
import {
  seaGlitter, SEA_SLOPE_RMS, HORIZON_FADE_DEG, SUN_GLITTER_PEAK, MOON_GLITTER_PEAK,
} from '@/lib/seaGlitter';

const SKY_R = 400;
const base = {
  direction: [0, 0.5, -0.87] as [number, number, number],
  altitudeDeg: 30,
  bodySize: 16,
  skyRadius: SKY_R,
  peak: SUN_GLITTER_PEAK,
};

describe('seaGlitter strength', () => {
  it('is nothing at all for a body below the horizon', () => {
    // Below the horizon is behind the Earth, so there is no body to reflect
    // -- the same rule the gaze labels and the sprites use.
    expect(seaGlitter({ ...base, altitudeDeg: -0.1 }).strength).toBe(0);
    expect(seaGlitter({ ...base, altitudeDeg: -40 }).strength).toBe(0);
  });

  it('is nothing exactly on the horizon, and fades in above it', () => {
    expect(seaGlitter({ ...base, altitudeDeg: 0 }).strength).toBe(0);
    const rising = seaGlitter({ ...base, altitudeDeg: HORIZON_FADE_DEG / 2 }).strength;
    expect(rising).toBeGreaterThan(0);
    expect(rising).toBeLessThan(SUN_GLITTER_PEAK);
  });

  it('reaches full strength once clear of the fade and stays there', () => {
    // Deliberately no falloff with altitude: a low body makes a LONGER path,
    // not a fainter one. The shader's Fresnel term is what makes a sunset
    // road long and a noon hot spot small.
    expect(seaGlitter({ ...base, altitudeDeg: HORIZON_FADE_DEG }).strength)
      .toBeCloseTo(SUN_GLITTER_PEAK, 6);
    expect(seaGlitter({ ...base, altitudeDeg: 80 }).strength)
      .toBeCloseTo(SUN_GLITTER_PEAK, 6);
  });

  it('dims with the Moon\'s illuminated fraction', () => {
    const full = seaGlitter({ ...base, peak: MOON_GLITTER_PEAK, brightness: 1 }).strength;
    const half = seaGlitter({ ...base, peak: MOON_GLITTER_PEAK, brightness: 0.5 }).strength;
    const dark = seaGlitter({ ...base, peak: MOON_GLITTER_PEAK, brightness: 0 }).strength;
    expect(half).toBeCloseTo(full / 2, 6);
    expect(dark).toBe(0);
  });

  it('keeps the Moon far dimmer than the Sun, which is the whole point', () => {
    const sun = seaGlitter({ ...base, peak: SUN_GLITTER_PEAK }).strength;
    const moon = seaGlitter({ ...base, peak: MOON_GLITTER_PEAK, brightness: 1 }).strength;
    expect(moon).toBeLessThan(sun / 2);
  });
});

describe('seaGlitter width', () => {
  it('widens with the body, which is what ties the path to the sprite', () => {
    // The reason BODY_SIZE feeds this at all: draw a bigger Moon and its
    // road across the water widens to match, with no second constant.
    const small = seaGlitter({ ...base, bodySize: 14 }).sigma;
    const doubled = seaGlitter({ ...base, bodySize: 28 }).sigma;
    expect(doubled).toBeGreaterThan(small);
  });

  it('never falls below the water\'s own scatter, however small the body', () => {
    // Real water is covered in small slopes, and it is those -- not the
    // body's size -- that smear a reflection into a road. A point-sized body
    // still gets a path.
    expect(seaGlitter({ ...base, bodySize: 0 }).sigma).toBeCloseTo(SEA_SLOPE_RMS, 9);
    expect(seaGlitter({ ...base, bodySize: 4 }).sigma).toBeGreaterThanOrEqual(SEA_SLOPE_RMS);
  });

  it('adds the two spreads in quadrature, the way variances add', () => {
    const bodySize = 28;
    const angularRadius = bodySize / 2 / SKY_R;
    expect(seaGlitter({ ...base, bodySize }).sigma)
      .toBeCloseTo(Math.hypot(angularRadius, SEA_SLOPE_RMS), 12);
  });

  it('stays a narrow path, not a wash across the whole sea', () => {
    // Sanity bound: a few degrees. If this ever reads in radians-of-tens the
    // water would glow uniformly and the effect would be lost.
    expect(seaGlitter({ ...base, bodySize: 28 }).sigma).toBeLessThan(0.12);
  });
});

describe('seaGlitter direction', () => {
  it('passes the body direction straight through, unnormalised and untouched', () => {
    const direction: [number, number, number] = [0.1, 0.2, -0.3];
    expect(seaGlitter({ ...base, direction }).direction).toEqual(direction);
  });
});
