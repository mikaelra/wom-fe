import { describe, expect, it } from 'vitest';
import {
  boundaryIndexAt,
  buildSlices,
  computeViewportGeometry,
  createSeededRng,
  oddsTable,
  pickTargetRotation,
  screenAngleOf,
  spinDistance,
  wheelKindFromString,
  type OddsEntry,
} from '@/lib/wheelGeometry';

const TWO_PI = Math.PI * 2;

describe('oddsTable', () => {
  it('normal wheel is uniform over the 6 non-green commons', () => {
    const table = oddsTable('normal');
    expect(table).toHaveLength(6);
    expect(table.map((t) => t.skin)).not.toContain('frog_green_v1');
    for (const entry of table) {
      expect(entry.probability).toBeCloseTo(1 / 6, 10);
    }
  });

  it('special wheel matches the documented weights over 30000', () => {
    const table = oddsTable('special');
    const bySkin = Object.fromEntries(table.map((t) => [t.skin, t]));
    expect(bySkin.frog_silver_v1.weight).toBe(18_900);
    expect(bySkin.frog_gold_v1.weight).toBe(9_000);
    expect(bySkin.frog_rainbow_v2.weight).toBe(2_000);
    expect(bySkin.frog_bling_v1.weight).toBe(100);
    expect(bySkin.frog_bling_v1.probability).toBeCloseTo(100 / 30_000, 10);
    const total = table.reduce((s, t) => s + t.probability, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('wheelKindFromString', () => {
  it('recognizes special, defaults everything else to normal', () => {
    expect(wheelKindFromString('special')).toBe('special');
    expect(wheelKindFromString('normal')).toBe('normal');
    expect(wheelKindFromString('anything_else')).toBe('normal');
  });
});

describe('buildSlices', () => {
  const desktopGeom = { R: 2400, H: 460 };
  const phoneGeom = { R: 487.5, H: 200 };

  it('clamps slice count into [24, 210] and produces that many slices', () => {
    const { slices, N } = buildSlices(oddsTable('special'), desktopGeom);
    expect(N).toBeGreaterThanOrEqual(24);
    expect(N).toBeLessThanOrEqual(210);
    expect(slices).toHaveLength(N);
  });

  it('respects the low clamp on a small phone', () => {
    const { N } = buildSlices(oddsTable('special'), phoneGeom);
    expect(N).toBeGreaterThanOrEqual(24);
  });

  it('every color gets at least one slice, even a 0.33% one', () => {
    const { slices } = buildSlices(oddsTable('special'), phoneGeom);
    const skins = new Set(slices.map((s) => s.skin));
    expect(skins.has('frog_bling_v1')).toBe(true);
  });

  it('per-color total angle is exact regardless of how N rounds', () => {
    const table = oddsTable('special');
    for (const geom of [desktopGeom, phoneGeom, { R: 900, H: 260 }]) {
      const { slices } = buildSlices(table, geom);
      for (const entry of table) {
        const totalAngle = slices
          .filter((s) => s.skin === entry.skin)
          .reduce((sum, s) => sum + (s.endAngle - s.startAngle), 0);
        expect(totalAngle).toBeCloseTo(TWO_PI * entry.probability, 9);
      }
    }
  });

  it('slices tile the full circle with no gaps or overlaps', () => {
    const { slices } = buildSlices(oddsTable('special'), desktopGeom);
    expect(slices[0].startAngle).toBeCloseTo(0, 9);
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].startAngle).toBeCloseTo(slices[i - 1].endAngle, 9);
    }
    expect(slices[slices.length - 1].endAngle).toBeCloseTo(TWO_PI, 9);
  });

  it('is deterministic for the same rng seed', () => {
    const table = oddsTable('special');
    const a = buildSlices(table, desktopGeom, createSeededRng(42));
    const b = buildSlices(table, desktopGeom, createSeededRng(42));
    expect(a).toEqual(b);
  });

  it('the color arrangement differs between seeds, but per-color counts stay identical', () => {
    const table = oddsTable('special');
    const a = buildSlices(table, desktopGeom, createSeededRng(1));
    const b = buildSlices(table, desktopGeom, createSeededRng(2));

    expect(a.slices.map((s) => s.skin)).not.toEqual(b.slices.map((s) => s.skin));

    const countsOf = (slices: typeof a.slices) => {
      const counts = new Map<string, number>();
      for (const s of slices) counts.set(s.skin, (counts.get(s.skin) ?? 0) + 1);
      return counts;
    };
    expect(countsOf(a.slices)).toEqual(countsOf(b.slices));
  });

  it('handles a single-entry table', () => {
    const table: OddsEntry[] = [{ skin: 'only', weight: 1, probability: 1 }];
    const { slices, N } = buildSlices(table, desktopGeom);
    expect(slices).toHaveLength(N);
    expect(slices.every((s) => s.skin === 'only')).toBe(true);
  });
});

describe('createSeededRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createSeededRng(7);
    const b = createSeededRng(7);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces values in [0, 1)', () => {
    const rng = createSeededRng(123);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds produce different sequences', () => {
    const a = createSeededRng(1)();
    const b = createSeededRng(2)();
    expect(a).not.toBe(b);
  });
});

describe('computeViewportGeometry', () => {
  it('R = 1.25 * W, clamped to [480, 2400]', () => {
    expect(computeViewportGeometry(390, 844).R).toBeCloseTo(487.5, 5); // 1.25*390, unclamped
    expect(computeViewportGeometry(100, 800).R).toBeCloseTo(480, 5); // 1.25*100=125, clamped up to 480
    expect(computeViewportGeometry(3440, 1440).R).toBeCloseTo(2400, 5); // 1.25*3440=4300, clamped down
    expect(computeViewportGeometry(1000, 800).R).toBeCloseTo(1250, 5); // unclamped
  });

  it('halfArc reads roughly the same 47-64deg total arc on phone and widescreen', () => {
    const phone = computeViewportGeometry(390, 844);
    const desktop = computeViewportGeometry(2560, 1440);
    const phoneArcDeg = (2 * phone.halfArc * 180) / Math.PI;
    const desktopArcDeg = (2 * desktop.halfArc * 180) / Math.PI;
    expect(phoneArcDeg).toBeGreaterThanOrEqual(40);
    expect(phoneArcDeg).toBeLessThanOrEqual(70);
    expect(desktopArcDeg).toBeGreaterThanOrEqual(40);
    expect(desktopArcDeg).toBeLessThanOrEqual(70);
  });

  it('H respects the minH floor (200 default, 180 landscape override)', () => {
    expect(computeViewportGeometry(800, 50).H).toBeCloseTo(200, 5);
    expect(computeViewportGeometry(800, 50, 180).H).toBeCloseTo(180, 5);
    expect(computeViewportGeometry(800, 5000).H).toBeCloseTo(460, 5);
  });

  it('R_inner never goes below 0.25 * R', () => {
    const g = computeViewportGeometry(2560, 1440);
    expect(g.R_inner).toBeGreaterThanOrEqual(0.25 * g.R - 1e-9);
  });

  it('cy places the centre far below the viewport (cy > R)', () => {
    const g = computeViewportGeometry(800, 800);
    expect(g.cy).toBeGreaterThan(g.R);
  });
});

describe('boundaryIndexAt', () => {
  it('finds the boundary nearest the pointer at zero rotation', () => {
    const table = oddsTable('normal');
    const { slices } = buildSlices(table, { R: 900, H: 260 });
    const idx = boundaryIndexAt(slices, 0);
    // The nearest boundary to angle 0 is either the very first or very last.
    expect([0, slices.length - 1]).toContain(idx);
  });

  it('tracks rotation continuously: index changes as rotation sweeps a full turn', () => {
    const table = oddsTable('normal');
    const { slices } = buildSlices(table, { R: 900, H: 260 });
    const seen = new Set<number>();
    const steps = 500;
    for (let i = 0; i < steps; i++) {
      seen.add(boundaryIndexAt(slices, (TWO_PI * i) / steps));
    }
    // Every boundary should be visited at least once over a full sweep.
    expect(seen.size).toBeGreaterThan(slices.length * 0.9);
  });
});

describe('screenAngleOf', () => {
  it('a slice at local angle 0 sits at the pointer when rotation is 0', () => {
    const slice = { skin: 'x', startAngle: 0, endAngle: 0.1 };
    expect(screenAngleOf(slice, 0)).toBeCloseTo(0.05, 9);
  });

  it('wraps a negative sum into [0, 2π)', () => {
    const slice = { skin: 'x', startAngle: 0, endAngle: 0.1 }; // mid = 0.05
    const result = screenAngleOf(slice, -1);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(TWO_PI);
    expect(result).toBeCloseTo(TWO_PI - 0.95, 9);
  });
});

describe('pickTargetRotation', () => {
  it('the chosen rotation places the chosen slice at the pointer, within jitter', () => {
    const table = oddsTable('special');
    const { slices } = buildSlices(table, { R: 900, H: 260 });
    const rng = () => 0.5; // deterministic: middle candidate, zero jitter
    const { rotation, sliceIndex } = pickTargetRotation(slices, 'frog_bling_v1', rng);
    expect(slices[sliceIndex].skin).toBe('frog_bling_v1');
    const s = slices[sliceIndex];
    const a = screenAngleOf(s, rotation);
    const dist = Math.min(a, TWO_PI - a);
    const halfWidth = (s.endAngle - s.startAngle) / 2;
    expect(dist).toBeLessThanOrEqual(halfWidth + 1e-9);
  });

  it('sliceIndex always points at a slice matching the requested skin', () => {
    const table = oddsTable('special');
    const { slices } = buildSlices(table, { R: 900, H: 260 });
    for (const rngValue of [0, 0.2, 0.5, 0.8, 0.999]) {
      const { sliceIndex } = pickTargetRotation(slices, 'frog_silver_v1', () => rngValue);
      expect(slices[sliceIndex].skin).toBe('frog_silver_v1');
    }
  });

  it('is uniform-random among multiple slices of the same color across rng draws', () => {
    const table = oddsTable('normal');
    const { slices } = buildSlices(table, { R: 900, H: 260 });
    const skin = slices[0].skin;
    const rngValues = [0, 0.2, 0.4, 0.6, 0.8, 0.99];
    const results = rngValues.map((v) => pickTargetRotation(slices, skin, () => v));
    expect(new Set(results.map((r) => r.sliceIndex)).size).toBeGreaterThan(1);
  });

  it('throws for a skin not on the wheel', () => {
    const table = oddsTable('normal');
    const { slices } = buildSlices(table, { R: 900, H: 260 });
    expect(() => pickTargetRotation(slices, 'nonexistent_skin', () => 0)).toThrow();
  });
});

describe('spinDistance', () => {
  it('always covers at least minRevolutions', () => {
    for (let current = 0; current < TWO_PI; current += 0.3) {
      for (let target = 0; target < TWO_PI; target += 0.3) {
        const d = spinDistance(current, target, 2.5);
        expect(d).toBeGreaterThanOrEqual(2.5 * TWO_PI - 1e-9);
      }
    }
  });

  it('lands exactly on target modulo a full turn', () => {
    const current = 1.2;
    const target = 4.5;
    const d = spinDistance(current, target, 2.5);
    const landed = ((current + d - target) % TWO_PI + TWO_PI) % TWO_PI;
    expect(landed).toBeCloseTo(0, 9);
  });

  it('has no discontinuity as target crosses the current position', () => {
    const current = 0;
    const justBefore = spinDistance(current, -0.001 + TWO_PI, 2.5);
    const justAfter = spinDistance(current, 0.001, 2.5);
    // Distances differ by roughly one small step, not a jump of a full turn.
    expect(Math.abs(justAfter - justBefore)).toBeLessThan(0.01);
  });
});
