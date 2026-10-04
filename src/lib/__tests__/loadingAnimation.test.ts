import { describe, expect, it } from 'vitest';
import {
  LOADING_SPEC,
  echoWeights,
  foldSpin,
  echoesAt,
  pickLoadingColor,
  pickLoadingStart,
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
    [0.2, 0.028, 2.4],
    [0.25, 0.15625, 15.0],
    [0.3, 0.352, 38.4],
    [0.7, 1.0, 120.0],
    [0.9, 1.0, 138.77922],
    [1.1, 1.0, 405.12],
    [1.4, 1.0, 828.341355],
    [1.5, 1.0, 840.0],
    [1.7, 0.896958198, 849.50424],
    [1.9, 0.0, 960.0],
  ])('at %s s: swing %s, spin %s deg', (t, progress, spin) => {
    expect(poseAt(LOADING_SPEC, t).progress).toBeCloseTo(progress, 6);
    expect(spinAt(LOADING_SPEC, t)).toBeCloseTo(spin, 4);
    expect(poseAt(LOADING_SPEC, t).spin).toBeCloseTo(spin, 4);
  });

  it('loops seamlessly: the end of one loop is the start of the next', () => {
    const loop = loopDuration(LOADING_SPEC);
    // same swing, and a turn that looks the same (the figure repeats every 120 deg)
    const end = poseAt(LOADING_SPEC, loop - 1e-9);
    const start = poseAt(LOADING_SPEC, 0);
    expect(end.progress).toBe(start.progress);
    expect((end.spin - start.spin) % 120).toBeCloseTo(0, 6);
    expect(poseAt(LOADING_SPEC, loop + 0.3).progress).toBeCloseTo(poseAt(LOADING_SPEC, 0.3).progress, 9);
  });

  it('treats times before the loop as still, and past it as the full turn', () => {
    expect(spinAt(LOADING_SPEC, -1)).toBe(0);
    expect(spinAt(LOADING_SPEC, loopDuration(LOADING_SPEC) + 5)).toBeCloseTo(960, 6);
  });

  it('turns a whole number of thirds over the loop, so it restarts where it began', () => {
    const total = spinAt(LOADING_SPEC, loopDuration(LOADING_SPEC));
    expect(total % 120).toBeCloseTo(0, 6);
  });

  it('spins each fold up from still and back down to still', () => {
    expect(foldSpin(0, 120)).toBe(0);
    expect(foldSpin(0.5, 120)).toBe(60);
    expect(foldSpin(1, 120)).toBe(120);
    const du = 1e-4;
    expect(foldSpin(du, 120) - foldSpin(0, 120)).toBeLessThan(1e-3);
    expect(foldSpin(1, 120) - foldSpin(1 - du, 120)).toBeLessThan(1e-3);
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
    [0.2, 23],
    [0.3, 23],
    [0.7, 23],
    [0.9, 23],
    [1.1, 23],
    [1.5, 23],
    [1.7, 23],
    [1.9, 23],
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

  it('never reaches back further than maxDegrees, spacing the copies evenly', () => {
    const max = LOADING_SPEC.trail.maxDegrees!;
    expect(max).toBe(60);
    const loop = loopDuration(LOADING_SPEC);
    for (let t = 0; t < loop; t += 0.01) {
      const echoes = echoesAt(LOADING_SPEC, t);
      const spins = echoes.map((e) => e.spin);
      const reach = Math.max(...spins) - Math.min(...spins);
      expect(reach).toBeLessThanOrEqual(max + 1e-9);
      if (echoes.length === 24) {
        const step = spins[0] - spins[1];
        spins.forEach((s, i) => expect(s).toBeCloseTo(spins[0] - i * step, 9));
      }
    }
  });

  it('spaces the copies in time when the spec has no maxDegrees', () => {
    const old = { ...LOADING_SPEC, trail: { ...LOADING_SPEC.trail, maxDegrees: undefined } };
    const lag = old.trail.seconds / 23;
    const echoes = echoesAt(old, 1.1);
    expect(echoes[1].spin).toBeCloseTo(spinAt(old, 1.1 - lag), 9);
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

describe('segments, starting folded out (v11)', () => {
  it('starts on the bare hexagon: nothing reaches the center, the copies lie on the swung edges', () => {
    const segs = segmentsAt(LOADING_SPEC, 0, 0, true);
    expect(segs).toHaveLength(9);
    const touchesCenter = (x: number, y: number) => Math.hypot(x, y) < 1e-6;
    expect(segs.some(([x0, y0, x1, y1]) => touchesCenter(x0, y0) || touchesCenter(x1, y1))).toBe(false);
    LOADING_SPEC.swing.forEach(({ tip, corner }, i) => {
      expect(segs[i]).toEqual([tip[0], tip[1], corner[0], corner[1]]);
      expect(segs[6 + i][2]).toBeCloseTo(corner[0], 9);
      expect(segs[6 + i][3]).toBeCloseTo(corner[1], 9);
    });
  });

  it('folds each copy into the center at full progress: the cube', () => {
    const segs = segmentsAt(LOADING_SPEC, 1, 0, true);
    for (let i = 6; i < 9; i++) {
      expect(segs[i][2]).toBeCloseTo(0, 5);
      expect(segs[i][3]).toBeCloseTo(0, 5);
    }
  });

  it('matches the Python v11 frame a quarter in, spun 30 degrees', () => {
    const copies = [
      [-0.942809, -0.0, -0.276142, -0.666667], [0.471405, 0.816497, -0.439279, 0.57248],
      [0.471405, -0.816497, 0.715421, 0.094187],
    ];
    const segs = segmentsAt(LOADING_SPEC, 0.25, 30, true);
    copies.forEach((row, i) => row.forEach((v, j) => expect(segs[6 + i][j]).toBeCloseTo(v, 5)));
  });
});

describe('pickLoadingStart', () => {
  it('picks the logo start or the hexagon start by the random number', () => {
    expect(LOADING_SPEC.startsFoldedOut).toEqual([false, true]);
    expect(pickLoadingStart(LOADING_SPEC, () => 0.2)).toBe(false);
    expect(pickLoadingStart(LOADING_SPEC, () => 0.7)).toBe(true);
    expect(pickLoadingStart({ ...LOADING_SPEC, startsFoldedOut: undefined }, () => 0.7)).toBe(false);
  });
});

describe('pickLoadingColor', () => {
  it('picks red, yellow or blue by the random number', () => {
    expect(LOADING_SPEC.colors).toEqual(['#ff0000', '#ffff00', '#0000ff']);
    expect(pickLoadingColor(LOADING_SPEC, () => 0)).toBe('#ff0000');
    expect(pickLoadingColor(LOADING_SPEC, () => 0.5)).toBe('#ffff00');
    expect(pickLoadingColor(LOADING_SPEC, () => 0.999)).toBe('#0000ff');
    expect(pickLoadingColor(LOADING_SPEC, () => 1)).toBe('#0000ff');
  });

  it('falls back to the spec colour when it lists none', () => {
    expect(pickLoadingColor({ ...LOADING_SPEC, colors: undefined }, () => 0.7)).toBe(LOADING_SPEC.color);
  });
});
