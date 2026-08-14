import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeAspects,
  computeSky,
  conjunctionWeight,
  separationDeg,
  type AspectBody,
  type Sky,
} from '@/lib/astrology';
import { allPresets, resolvePreset } from '@/lib/astrologyPresets';

// ── Test helpers ────────────────────────────────────────────────────────
// Skies here are hand-built (not real ephemeris) so every pair not
// explicitly placed is guaranteed far apart -- real astronomical positions
// on a given date could coincidentally put an untested pair suspiciously
// close, which would make the zero-aspect / isolation tests flaky.

const BODIES: AspectBody[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
const RAD = Math.PI / 180;

// Evenly spread around a great circle: 360/7 ≈ 51.4° apart, comfortably
// beyond the largest orb (Moon's, 10°).
function baselineDir(index: number): THREE.Vector3 {
  const theta = (index / BODIES.length) * 2 * Math.PI;
  return new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
}

// Mirrors astrology.ts's internal rotateByDeg -- duplicated here (not
// exported) purely to construct test fixtures at exact separations. The
// "preset resolution" tests below cross-check the real production
// implementation independently via computeSky's actual override handling.
function rotateByDeg(dir: THREE.Vector3, sepDeg: number): THREE.Vector3 {
  const up = Math.abs(dir.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const axis = dir.clone().cross(up).normalize();
  return dir.clone().applyAxisAngle(axis, sepDeg * RAD);
}

function buildSky(
  overrides: Partial<Record<AspectBody, THREE.Vector3>> = {},
  opts: { mercuryRetrograde?: boolean; moonPhaseFraction?: number } = {},
): Sky {
  const dir = {} as Record<AspectBody, THREE.Vector3>;
  BODIES.forEach((b, i) => { dir[b] = overrides[b] ?? baselineDir(i); });
  return {
    date: new Date('2026-01-01T00:00:00Z'),
    dir,
    mercuryRetrograde: opts.mercuryRetrograde ?? false,
    moonPhaseFraction: opts.moonPhaseFraction ?? 1,
  };
}

const ORB = { Moon: 10, Mercury: 8, Venus: 7, Mars: 5, Jupiter: 4, Saturn: 3, Sun: 6 } as const;

const DONOR_HEX = {
  Moon: 0xcfe3ff, Mercury: 0xFFBC03, Venus: 0xAB9D00, Mars: 0xFF0000, Jupiter: 0x008296, Saturn: 0xA16300,
} as const;

// Deliberately distinct from DONOR_HEX for Mercury (0xDB9504 vs 0xFFBC03,
// per docs/ASPECTS_PLAN.md §2.3) -- what a body shows with NO aspect active.
const BASE_HEX = {
  Moon: 0xcfe3ff, Mercury: 0xDB9504, Venus: 0xAB9D00, Mars: 0xFF0000, Jupiter: 0x008296, Saturn: 0xA16300,
} as const;

// ── Weight curve (§2.2) ─────────────────────────────────────────────────

describe('conjunctionWeight', () => {
  it('is 1 at exact conjunction, for every orb', () => {
    for (const orb of Object.values(ORB)) {
      expect(conjunctionWeight(0, orb)).toBe(1);
    }
  });

  it('is clamped to 0 at and beyond the orb, never negative', () => {
    for (const orb of Object.values(ORB)) {
      expect(conjunctionWeight(orb, orb)).toBe(0);
      expect(conjunctionWeight(orb + 1, orb)).toBe(0);
    }
  });

  it('is strictly decreasing across 0 -> orb', () => {
    const orb = 10;
    let prev = conjunctionWeight(0, orb);
    for (let sep = 1; sep <= orb; sep++) {
      const w = conjunctionWeight(sep, orb);
      expect(w).toBeLessThan(prev);
      prev = w;
    }
  });

  // docs/ASPECTS_PLAN.md §2.2's reference table, to 3dp.
  const TABLE: Record<number, Record<keyof typeof ORB, number>> = {
    0: { Moon: 1.000, Mercury: 1.000, Venus: 1.000, Mars: 1.000, Jupiter: 1.000, Saturn: 1.000, Sun: 1.000 },
    1: { Moon: 0.760, Mercury: 0.725, Venus: 0.701, Mars: 0.631, Jupiter: 0.577, Saturn: 0.494, Sun: 0.671 },
    2: { Moon: 0.631, Mercury: 0.577, Venus: 0.540, Mars: 0.433, Jupiter: 0.349, Saturn: 0.222, Sun: 0.494 },
    3: { Moon: 0.526, Mercury: 0.456, Venus: 0.409, Mars: 0.271, Jupiter: 0.163, Saturn: 0.000, Sun: 0.349 },
    4: { Moon: 0.433, Mercury: 0.349, Venus: 0.293, Mars: 0.129, Jupiter: 0.000, Saturn: 0.000, Sun: 0.222 },
    5: { Moon: 0.349, Mercury: 0.253, Venus: 0.188, Mars: 0.000, Jupiter: 0.000, Saturn: 0.000, Sun: 0.107 },
    6: { Moon: 0.271, Mercury: 0.163, Venus: 0.091, Mars: 0.000, Jupiter: 0.000, Saturn: 0.000, Sun: 0.000 },
    7: { Moon: 0.198, Mercury: 0.079, Venus: 0.000, Mars: 0.000, Jupiter: 0.000, Saturn: 0.000, Sun: 0.000 },
    8: { Moon: 0.129, Mercury: 0.000, Venus: 0.000, Mars: 0.000, Jupiter: 0.000, Saturn: 0.000, Sun: 0.000 },
    9: { Moon: 0.063, Mercury: 0.000, Venus: 0.000, Mars: 0.000, Jupiter: 0.000, Saturn: 0.000, Sun: 0.000 },
    10: { Moon: 0.000, Mercury: 0.000, Venus: 0.000, Mars: 0.000, Jupiter: 0.000, Saturn: 0.000, Sun: 0.000 },
  };

  it('matches the §2.2 reference table to 3dp for all seven orbs', () => {
    for (const [sepStr, row] of Object.entries(TABLE)) {
      const sep = Number(sepStr);
      for (const [body, expected] of Object.entries(row)) {
        const orb = ORB[body as keyof typeof ORB];
        expect(conjunctionWeight(sep, orb)).toBeCloseTo(expected, 3);
      }
    }
  });
});

// ── Mutuality and asymmetric orbs -- the core of this pass ─────────────

describe('mutual, per-body-orb conjunctions', () => {
  it('Jupiter/Saturn at 1°: asymmetric influence, each using its own orb', () => {
    const jupiterI = BODIES.indexOf('Jupiter');
    const jupiterDir = baselineDir(jupiterI);
    const saturnDir = rotateByDeg(jupiterDir, 1);
    const sky = buildSky({ Jupiter: jupiterDir, Saturn: saturnDir });

    const aspects = computeAspects(sky);

    expect(aspects.Jupiter.influence).toBeCloseTo(0.577, 3);
    expect(aspects.Saturn.influence).toBeCloseTo(0.494, 3);
    expect(aspects.Jupiter.influence).not.toBeCloseTo(aspects.Saturn.influence, 2);
  });

  it('Venus/Saturn at 2°: Venus 0.540, Saturn 0.222', () => {
    const venusDir = baselineDir(BODIES.indexOf('Venus'));
    const saturnDir = rotateByDeg(venusDir, 2);
    const sky = buildSky({ Venus: venusDir, Saturn: saturnDir });

    const aspects = computeAspects(sky);

    expect(aspects.Venus.influence).toBeCloseTo(0.540, 3);
    expect(aspects.Saturn.influence).toBeCloseTo(0.222, 3);
  });

  it('Saturn at 3.5° from everything: Saturn is 0 while a wider-orb partner is not', () => {
    const jupiterDir = baselineDir(BODIES.indexOf('Jupiter'));
    const saturnDir = rotateByDeg(jupiterDir, 3.5);
    const sky = buildSky({ Jupiter: jupiterDir, Saturn: saturnDir });

    const aspects = computeAspects(sky);

    expect(aspects.Saturn.influence).toBe(0);
    expect(aspects.Jupiter.influence).toBeGreaterThan(0);
  });

  it('at 0°, a receiver\'s aura equals its single donor\'s DONOR_COLOR exactly, but its own colour is untouched', () => {
    const marsDir = baselineDir(BODIES.indexOf('Mars'));
    const sky = buildSky({ Mars: marsDir, Venus: marsDir.clone() });

    const aspects = computeAspects(sky);

    expect(aspects.Mars.influence).toBeCloseTo(1, 6);
    expect(aspects.Mars.auraColor.getHex()).toBe(DONOR_HEX.Venus);
    expect(aspects.Mars.color.getHex()).toBe(BASE_HEX.Mars);
    expect(aspects.Venus.influence).toBeCloseTo(1, 6);
    expect(aspects.Venus.auraColor.getHex()).toBe(DONOR_HEX.Mars);
    expect(aspects.Venus.color.getHex()).toBe(BASE_HEX.Venus);
  });

  it('a receiver\'s own colour stays its base hue at partial influence too, not just at 0°', () => {
    const jupiterDir = baselineDir(BODIES.indexOf('Jupiter'));
    const sky = buildSky({ Jupiter: jupiterDir, Saturn: rotateByDeg(jupiterDir, 1) });

    const aspects = computeAspects(sky);

    expect(aspects.Jupiter.influence).toBeGreaterThan(0);
    expect(aspects.Jupiter.influence).toBeLessThan(1);
    expect(aspects.Jupiter.color.getHex()).toBe(BASE_HEX.Jupiter);
    expect(aspects.Jupiter.auraColor.getHex()).not.toBe(BASE_HEX.Jupiter);
  });
});

// ── Zero-aspect invariant -- guards the whole refactor ──────────────────

describe('zero-aspect invariant', () => {
  it('every planet is exactly at its base color with 0 influence/strength when nothing is in range', () => {
    const sky = buildSky();
    const aspects = computeAspects(sky);

    for (const body of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const) {
      expect(aspects[body].influence).toBe(0);
      expect(aspects[body].strength).toBe(0);
      expect(aspects[body].color.getHex()).toBe(BASE_HEX[body]);
    }
  });

  it('the Moon falls back to its base strength/color when nothing is in range', () => {
    const phaseFraction = 0.42;
    const sky = buildSky({}, { moonPhaseFraction: phaseFraction });
    const aspects = computeAspects(sky);

    expect(aspects.Moon.influence).toBe(0);
    expect(aspects.Moon.strength).toBeCloseTo(0.05 * phaseFraction, 6);
    expect(aspects.Moon.color.getHex()).toBe(0xcfe3ff);
  });
});

// ── Moon regression (must not change vs. before this module existed) ───

describe('Moon regression', () => {
  it('still uses a 10° orb: non-zero at 9°, zero at 10°', () => {
    const moonDir = baselineDir(BODIES.indexOf('Moon'));
    const at9 = buildSky({ Moon: moonDir, Venus: rotateByDeg(moonDir, 9) });
    const at10 = buildSky({ Moon: moonDir, Venus: rotateByDeg(moonDir, 10) });

    expect(computeAspects(at9).Moon.influence).toBeGreaterThan(0);
    // Floating-point rotation doesn't recover exactly 10.000000° -- a
    // sub-1e-6 residual either side of the orb edge is rotation noise, not
    // a real conjunction weight.
    expect(computeAspects(at10).Moon.influence).toBeLessThan(1e-6);
  });

  it('strength still scales with moonPhaseFraction', () => {
    const moonDir = baselineDir(BODIES.indexOf('Moon'));
    const sky = (phaseFraction: number) =>
      buildSky({ Moon: moonDir, Venus: moonDir.clone() }, { moonPhaseFraction: phaseFraction });

    const full = computeAspects(sky(1)).Moon.strength;
    const half = computeAspects(sky(0.5)).Moon.strength;
    expect(full).toBeGreaterThan(half);
    expect(half).toBeCloseTo(full / 2, 6);
  });

  it('multiple simultaneous donors cap influence at 1', () => {
    const moonDir = baselineDir(BODIES.indexOf('Moon'));
    const sky = buildSky({
      Moon: moonDir,
      Mercury: moonDir.clone(),
      Venus: moonDir.clone(),
      Mars: moonDir.clone(),
      Jupiter: moonDir.clone(),
      Saturn: moonDir.clone(),
    });

    expect(computeAspects(sky).Moon.influence).toBe(1);
  });

  it('with two donors in range, the aura is the STRONGER one\'s pure colour, not an average of both', () => {
    const marsDir = baselineDir(BODIES.indexOf('Mars'));
    const sky = buildSky({
      Mars: marsDir,
      Venus: rotateByDeg(marsDir, 1),   // closer -- should win
      Jupiter: rotateByDeg(marsDir, 3), // farther -- weaker donor
    });

    const aspects = computeAspects(sky);

    expect(aspects.Mars.auraColor.getHex()).toBe(DONOR_HEX.Venus);
    expect(aspects.Mars.auraColor.getHex()).not.toBe(DONOR_HEX.Jupiter);
    // Not some blended-average third colour either.
    const isAverageOfBoth = Math.abs(aspects.Mars.auraColor.r - (new THREE.Color(DONOR_HEX.Venus).r + new THREE.Color(DONOR_HEX.Jupiter).r) / 2) < 0.01;
    expect(isAverageOfBoth).toBe(false);
  });
});

// ── Sun ──────────────────────────────────────────────────────────────────

describe('the Sun', () => {
  it('donates no colour: a planet at 0° from the Sun keeps its own hue', () => {
    const sunDir = baselineDir(BODIES.indexOf('Sun'));
    const sky = buildSky({ Sun: sunDir, Mars: sunDir.clone() });

    const aspects = computeAspects(sky);

    // Hue unchanged (still Mars's own base colour's hue) -- only saturation/strength move.
    const hsl = { h: 0, s: 0, l: 0 };
    aspects.Mars.color.getHSL(hsl);
    const baseHsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(0xFF0000).getHSL(baseHsl);
    expect(hsl.h).toBeCloseTo(baseHsl.h, 6);
  });

  it('receives nothing: aspects.Sun is always inert', () => {
    const sunDir = baselineDir(BODIES.indexOf('Sun'));
    const sky = buildSky({
      Sun: sunDir,
      Mars: sunDir.clone(),
      Venus: sunDir.clone(),
      Mercury: sunDir.clone(),
    });

    const aspects = computeAspects(sky);

    expect(aspects.Sun.influence).toBe(0);
    expect(aspects.Sun.strength).toBe(0);
  });

  it('amplifies strength more the closer a conjunction is to the Sun', () => {
    const marsDir = baselineDir(BODIES.indexOf('Mars'));
    const venusDir = baselineDir(BODIES.indexOf('Venus'));
    // Identical Mars/Venus conjunction geometry in both skies; only the
    // Sun's distance from that pair differs.
    const nearSun = buildSky({
      Mars: marsDir,
      Venus: marsDir.clone(),
      Sun: marsDir.clone(),
    });
    const farFromSun = buildSky({
      Mars: venusDir,
      Venus: venusDir.clone(),
      Sun: baselineDir(BODIES.indexOf('Saturn')), // far from Venus/Mars's shared direction
    });

    expect(computeAspects(nearSun).Mars.strength).toBeGreaterThan(computeAspects(farFromSun).Mars.strength);
  });

  it('corona floor: Moon at 0° from the Sun with moonPhaseFraction 0 still has positive strength', () => {
    const sunDir = baselineDir(BODIES.indexOf('Sun'));
    const sky = buildSky({ Sun: sunDir, Moon: sunDir.clone() }, { moonPhaseFraction: 0 });

    expect(computeAspects(sky).Moon.strength).toBeGreaterThan(0);
  });

  it('purple ramp: the Moon blends toward the solar tint monotonically as Sun separation shrinks, and is untinted at the orb edge', () => {
    const sunDir = baselineDir(BODIES.indexOf('Sun'));
    const purple = new THREE.Color(0x8A2BE2); // astrology.ts's MOON_SOLAR_TINT

    const distanceToPurple = (sepDeg: number) => {
      const sky = buildSky({ Sun: sunDir, Moon: rotateByDeg(sunDir, sepDeg) });
      const c = computeAspects(sky).Moon.color;
      return Math.hypot(c.r - purple.r, c.g - purple.g, c.b - purple.b);
    };

    const distances = [6, 5, 4, 3, 2, 1, 0].map(distanceToPurple);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeLessThan(distances[i - 1]);
    }

    // At the orb edge (6°), sunWeight is 0, so no tint at all -- exactly
    // the un-tinted colour (the Moon's own base colour, nothing else in range).
    const atEdge = buildSky({ Sun: sunDir, Moon: rotateByDeg(sunDir, 6) });
    expect(computeAspects(atEdge).Moon.color.getHex()).toBe(0xcfe3ff);
  });
});

// ── Preset resolution ─────────────────────────────────────────────────────

describe('astrologyPresets', () => {
  it('every preset\'s overrides recover their requested separation through the real computeSky', () => {
    for (const preset of allPresets()) {
      const sky = computeSky(preset.date ?? new Date('2026-06-15T00:00:00Z'), preset.overrides);
      for (const o of preset.overrides) {
        expect(separationDeg(sky, o.body, o.relativeTo)).toBeCloseTo(o.sepDeg, 6);
      }
    }
  });

  it('sign -1 produces the same separation as sign 1', () => {
    const date = new Date('2026-06-15T00:00:00Z');
    const skyPlus = computeSky(date, [{ body: 'Mars', relativeTo: 'Venus', sepDeg: 4, sign: 1 }]);
    const skyMinus = computeSky(date, [{ body: 'Mars', relativeTo: 'Venus', sepDeg: 4, sign: -1 }]);

    expect(separationDeg(skyPlus, 'Mars', 'Venus')).toBeCloseTo(separationDeg(skyMinus, 'Mars', 'Venus'), 6);
  });

  it('an earlier override may be used as a later relativeTo', () => {
    const date = new Date('2026-06-15T00:00:00Z');
    expect(() =>
      computeSky(date, [
        { body: 'Mars', relativeTo: 'Venus', sepDeg: 1 },
        { body: 'Saturn', relativeTo: 'Mars', sepDeg: 1 }, // Mars already resolved above -- fine
      ]),
    ).not.toThrow();
  });

  it('a forward reference throws rather than silently placing a body wrong', () => {
    const date = new Date('2026-06-15T00:00:00Z');
    expect(() =>
      computeSky(date, [
        { body: 'Venus', relativeTo: 'Mars', sepDeg: 1 }, // Mars is overridden below -- not resolved yet
        { body: 'Mars', relativeTo: 'Sun', sepDeg: 1 },
      ]),
    ).toThrow();
  });

  it('a self-reference throws', () => {
    const date = new Date('2026-06-15T00:00:00Z');
    expect(() => computeSky(date, [{ body: 'Mars', relativeTo: 'Mars', sepDeg: 1 }])).toThrow();
  });

  it('an unknown preset id resolves to nothing, so callers fall back to the live sky', () => {
    expect(resolvePreset('not-a-real-preset-id')).toBeUndefined();
    expect(resolvePreset(undefined)).toBeUndefined();
    expect(resolvePreset(null)).toBeUndefined();
  });

  it('ships exactly the 17 presets §6.2 requires', () => {
    expect(allPresets()).toHaveLength(17);
  });
});
