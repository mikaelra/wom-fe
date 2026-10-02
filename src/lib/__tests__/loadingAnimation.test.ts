import { describe, expect, it } from 'vitest';
import {
  LOADING_SPEC,
  echoWeights,
  echoesAt,
  loopDuration,
  poseAt,
  segmentsAt,
  smoothstep,
  spinAngle,
  spinAt,
  spinDuration,
} from '@/lib/loadingAnimation';

// Expected values below come from the Python original
// (wom-tools/animation-generation/loading_animation.py, v8) run against the
// same spec -- the port must play exactly what was signed off there.

describe('timing', () => {
  it('matches the Python loop and spin lengths', () => {
    expect(loopDuration(LOADING_SPEC)).toBeCloseTo(1.9685242518059856, 9);
    expect(spinDuration(LOADING_SPEC)).toBeCloseTo(0.6191950464396285, 9);
  });

  it('spins a whole number of thirds of a turn, so the cube ends where it started', () => {
    const total = spinAngle(LOADING_SPEC, spinDuration(LOADING_SPEC));
    expect(total).toBeCloseTo(720, 6);
    expect(total % 120).toBeCloseTo(0, 6);
  });

  it('revs up from still and back down to still', () => {
    const dt = 1e-4;
    const end = spinDuration(LOADING_SPEC);
    expect(spinAngle(LOADING_SPEC, dt) - spinAngle(LOADING_SPEC, 0)).toBeLessThan(1e-3);
    expect(spinAngle(LOADING_SPEC, end) - spinAngle(LOADING_SPEC, end - dt)).toBeLessThan(1e-3);
    const { topSpeed, speed } = LOADING_SPEC.spin;
    const mid = end / 2;
    expect((spinAngle(LOADING_SPEC, mid + dt) - spinAngle(LOADING_SPEC, mid)) / dt).toBeCloseTo(topSpeed * speed, 0);
  });

  it('eases with smoothstep', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
  });
});

describe('poses', () => {
  it.each([
    [0.0, 0.0, 0.0],
    [0.25, 0.15625, 0.0],
    [0.3, 0.352, 0.0],
    [0.7, 1.0, 0.0],
    [0.9, 1.0, 18.77922],
    [1.1, 1.0, 285.12],
    [1.4, 1.0, 708.341355],
    [1.5, 1.0, 720.0],
    [1.7, 0.896958198, 720.0],
    [1.9, 0.0, 720.0],
  ])('at %s s: swing %s, spin %s deg', (t, progress, spin) => {
    expect(poseAt(LOADING_SPEC, t).progress).toBeCloseTo(progress, 6);
    expect(spinAt(LOADING_SPEC, t)).toBeCloseTo(spin, 4);
  });

  it('loops seamlessly: the end of one loop is the start of the next', () => {
    const loop = loopDuration(LOADING_SPEC);
    expect(poseAt(LOADING_SPEC, loop - 1e-9)).toEqual(poseAt(LOADING_SPEC, 0));
    expect(poseAt(LOADING_SPEC, loop + 0.3).progress).toBeCloseTo(poseAt(LOADING_SPEC, 0.3).progress, 9);
  });

  it('treats times before the loop as still', () => {
    expect(spinAt(LOADING_SPEC, -1)).toBe(0);
  });
});

describe('trail', () => {
  it('weights the sharp copy 1 and fades the rest linearly', () => {
    const w = echoWeights(LOADING_SPEC);
    expect(w).toHaveLength(24);
    expect(w[0]).toBe(1);
    expect(w[1]).toBeCloseTo((1 - 1 / 24) * (8 / 24), 12);
    expect(w[23]).toBeCloseTo((1 / 24) * (8 / 24), 12);
    for (let i = 2; i < w.length; i++) expect(w[i]).toBeLessThan(w[i - 1]);
  });

  it.each([
    [0.0, 0],
    [0.7, 0],
    [0.9, 23],
    [1.1, 23],
    [1.5, 21],
    [1.7, 13],
    [1.9, 4],
  ])('at %s s draws %s trail copies besides the sharp figure', (t, copies) => {
    const echoes = echoesAt(LOADING_SPEC, t);
    expect(echoes).toHaveLength(1 + copies);
    expect(echoes[0].weight).toBe(1);
    expect(echoes[0].spin).toBeCloseTo(spinAt(LOADING_SPEC, t), 9);
  });

  it('wraps times past the loop', () => {
    const loop = loopDuration(LOADING_SPEC);
    expect(echoesAt(LOADING_SPEC, loop + 0.9)).toHaveLength(24);
  });

  it('is just the sharp figure with a one-copy trail', () => {
    const one = { ...LOADING_SPEC, trail: { ...LOADING_SPEC.trail, echoes: 1 } };
    expect(echoWeights(one)).toEqual([1]);
    expect(echoesAt(one, 1.1)).toHaveLength(1);
  });
});

describe('segments', () => {
  it('draws the logo at rest: three spokes, three edges, three copies lying on the spokes', () => {
    const segs = segmentsAt(LOADING_SPEC, 0, 0);
    expect(segs).toHaveLength(9);
    LOADING_SPEC.swing.forEach(({ tip }, i) => {
      const copy = segs[6 + i];
      expect(copy[0]).toBeCloseTo(tip[0], 9);
      expect(copy[1]).toBeCloseTo(tip[1], 9);
      expect(copy[2]).toBeCloseTo(0, 9);
      expect(copy[3]).toBeCloseTo(0, 9);
    });
  });

  it('swings each copy onto its hexagon corner at full progress', () => {
    const segs = segmentsAt(LOADING_SPEC, 1, 0);
    LOADING_SPEC.swing.forEach(({ corner }, i) => {
      // the spec stores 6 decimals, so the landing point is exact to ~1e-6
      expect(segs[6 + i][2]).toBeCloseTo(corner[0], 5);
      expect(segs[6 + i][3]).toBeCloseTo(corner[1], 5);
    });
  });

  it('matches the Python frame halfway out, spun 30 degrees', () => {
    const expected = [
      [0.0, 0.0, -0.942809, -0.0], [0.0, 0.0, 0.471405, 0.816497], [0.0, 0.0, 0.471405, -0.816497],
      [-0.942809, -0.0, -0.471405, 0.816497], [0.471405, 0.816497, 0.942809, 0.0],
      [0.471405, -0.816497, -0.471405, -0.816497], [-0.942809, -0.0, -0.126312, -0.471405],
      [0.471405, 0.816497, -0.345092, 0.345092], [0.471405, -0.816497, 0.471405, 0.126312],
    ];
    const segs = segmentsAt(LOADING_SPEC, 0.5, 30);
    expected.forEach((row, i) => row.forEach((v, j) => expect(segs[i][j]).toBeCloseTo(v, 5)));
  });
});
