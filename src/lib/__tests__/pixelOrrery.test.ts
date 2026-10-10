import { describe, expect, it } from 'vitest';
import {
  PLANETS,
  aroundEarth,
  aroundSun,
  helioPoint,
  moonPoint,
  orbit,
  orreryColor,
  radiusShare,
  scaleFor,
  sunPosition,
} from '@/lib/pixelOrrery';

const DATE = new Date('2026-10-10T00:00:00Z');

describe('pixelOrrery', () => {
  it('finds each planet from the Sun: the Earth 1 AU out, Saturn near 10', () => {
    expect(helioPoint('Earth', DATE).dist).toBeCloseTo(1, 1);
    expect(helioPoint('Saturn', DATE).dist).toBeGreaterThan(9);
    expect(moonPoint(DATE).dist).toBeLessThan(0.003);
  });

  it("traces a planet's whole orbit round the Sun, ending now", () => {
    const mars = orbit('Mars', DATE);
    expect(mars.length).toBe(96);
    expect(mars.at(-1)).toEqual(helioPoint('Mars', DATE));
    const lons = mars.map((p) => p.lon);
    expect(Math.max(...lons) - Math.min(...lons)).toBeGreaterThan(300); // all the way round
  });

  it('puts the Sun beside the Earth at the centre, the Earth on its orbit round it', () => {
    const earth = helioPoint('Earth', DATE);
    const r = scaleFor(100);
    const [sx, sy] = sunPosition(earth, 100, 100, r);
    expect(aroundSun(earth, sx, sy, r)).toEqual([100, 100]); // the Earth, back at the centre
    const sunDist = Math.hypot(sx - 100, sy - 100);
    expect(sunDist).toBeCloseTo(radiusShare(1) * r, 0);
  });

  it("keeps Saturn's orbit on screen wherever the Sun is", () => {
    const r = scaleFor(100);
    expect((1 + radiusShare(1)) * r).toBeCloseTo(100);
    expect(radiusShare(10.1)).toBe(1);
  });

  it('orders the orbits outward from the Sun', () => {
    const shares = PLANETS.map((p) => radiusShare(helioPoint(p, DATE).dist));
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
  });

  it('keeps the Moon a few pixels round the Earth', () => {
    const [x, y] = aroundEarth({ lon: 0, dist: 0.0026 }, 50, 50, 10);
    expect([x, y]).toEqual([53, 50]);
  });

  it('colours every body', () => {
    for (const b of ['Sun', 'Moon', ...PLANETS] as const) expect(orreryColor(b)).toBeGreaterThan(0);
  });
});
