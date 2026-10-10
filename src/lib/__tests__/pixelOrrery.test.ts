import { describe, expect, it } from 'vitest';
import { ORRERY_BODIES, geoPoint, orreryColor, radiusShare, toXY, trail } from '@/lib/pixelOrrery';

const DATE = new Date('2026-10-10T00:00:00Z');

describe('pixelOrrery', () => {
  it('finds each body from Earth: the Sun 1 AU away, the Moon close by', () => {
    const sun = geoPoint('Sun', DATE);
    expect(sun.dist).toBeGreaterThan(0.98);
    expect(sun.dist).toBeLessThan(1.02);
    expect(sun.lon).toBeGreaterThanOrEqual(0);
    expect(sun.lon).toBeLessThan(360);
    expect(geoPoint('Moon', DATE).dist).toBeLessThan(0.003);
  });

  it('trails each body back over its span, oldest first, ending now', () => {
    const mars = trail('Mars', DATE);
    expect(mars.length).toBe(Math.floor(780 / 4) + 1);
    expect(mars.at(-1)).toEqual(geoPoint('Mars', DATE));
  });

  it("shows Mars' retrograde loop: somewhere in two years its longitude runs backwards", () => {
    const mars = trail('Mars', DATE);
    const steps = mars.slice(1).map((p, i) => ((p.lon - mars[i].lon + 540) % 360) - 180);
    expect(steps.some((d) => d < 0)).toBe(true);
    expect(steps.some((d) => d > 0)).toBe(true);
  });

  it('puts the Moon on its own ring, and farther bodies farther out', () => {
    expect(radiusShare('Moon', 0.0026)).toBeLessThan(radiusShare('Venus', 0.26));
    expect(radiusShare('Mars', 2)).toBeGreaterThan(radiusShare('Sun', 1));
    expect(radiusShare('Saturn', 50)).toBe(1);
  });

  it('draws 0° to the right and 90° up', () => {
    expect(toXY('Sun', { lon: 0, dist: 11 }, 50, 50, 40)).toEqual([90, 50]);
    expect(toXY('Sun', { lon: 90, dist: 11 }, 50, 50, 40)).toEqual([50, 10]);
  });

  it('colours every body', () => {
    for (const b of ORRERY_BODIES) expect(orreryColor(b)).toBeGreaterThan(0);
  });
});
