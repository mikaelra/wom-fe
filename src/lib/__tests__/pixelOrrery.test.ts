import { describe, expect, it } from 'vitest';
import {
  PLANETS,
  SKY_STARS,
  TURN_MS,
  azimuthAt,
  eclipticStar,
  helioPoint,
  moonPoint,
  orreryColor,
  project,
  projectStar,
  radiusShare,
  sceneBodies,
  startAzimuth,
  turntableCamera,
  type OrbitPoint,
  type Planet,
} from '@/lib/pixelOrrery';
import { STAR_CATALOG } from '@/components/worldmap/starCatalog';

const DATE = new Date('2026-10-10T00:00:00Z');
const planets = Object.fromEntries(PLANETS.map((p) => [p, helioPoint(p, DATE)])) as Record<Planet, OrbitPoint>;
const bodies = sceneBodies(planets, moonPoint(DATE));

describe('pixelOrrery', () => {
  it('finds each planet from the Sun: the Earth 1 AU out, Saturn near 10', () => {
    expect(helioPoint('Earth', DATE).dist).toBeCloseTo(1, 1);
    expect(helioPoint('Saturn', DATE).dist).toBeGreaterThan(9);
    expect(moonPoint(DATE).dist).toBeLessThan(0.003);
  });

  it('orders the orbits outward from the Sun', () => {
    const shares = PLANETS.map((p) => radiusShare(helioPoint(p, DATE).dist));
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
  });

  it('colours every body', () => {
    for (const b of ['Sun', 'Moon', ...PLANETS] as const) expect(orreryColor(b)).toBeGreaterThan(0);
  });

  it('measures the scene from the Earth in Saturn-distances, all on the ecliptic', () => {
    expect(Math.hypot(...bodies.Saturn)).toBeCloseTo(1);
    expect(Math.hypot(...bodies.Sun)).toBeLessThan(1);
    expect(Math.hypot(...bodies.Moon)).toBeLessThan(Math.hypot(...bodies.Sun) / 2); // close round the Earth
    for (const p of Object.values(bodies)) expect(p[2]).toBe(0);
  });

  it('starts the camera opposite the Sun, the Sun behind the Earth', () => {
    const cam = turntableCamera(startAzimuth(bodies.Sun), 50, 100, 46, 96);
    const sun = project(cam, bodies.Sun)!;
    expect(sun.x).toBe(50); // straight behind
    expect(sun.y).toBeLessThan(100); // up the screen: the far side
    expect(sun.near).toBeLessThan(1);
  });

  it('turns once round the Earth in TURN_MS', () => {
    expect(azimuthAt(1, TURN_MS)).toBeCloseTo(1 + 2 * Math.PI);
    expect(azimuthAt(1, TURN_MS / 4)).toBeCloseTo(1 + Math.PI / 2);
  });

  it('draws the near side lower and nearer, the far side higher', () => {
    const cam = turntableCamera(0, 50, 100, 46, 96);
    const near = project(cam, [1, 0, 0])!; // towards the camera
    const far = project(cam, [-1, 0, 0])!;
    expect(near.y).toBeGreaterThan(100);
    expect(far.y).toBeLessThan(100);
    expect(near.near).toBeGreaterThan(1);
    expect(far.near).toBeLessThan(1);
    expect(project(cam, [0, 0, 0])).toEqual({ x: 50, y: 100, near: 1 }); // the Earth, at the centre
  });

  it('brings Saturn to the side of any screen as it swings past, and keeps its circle on screen', () => {
    for (const [halfW, halfH] of [
      [46, 96],
      [96, 46],
      [80, 80],
    ]) {
      const cam = turntableCamera(0, 0, 0, halfW, halfH);
      const side = project(cam, [0, 1, 0])!;
      const near = project(cam, [1, 0, 0])!;
      const far = project(cam, [-1, 0, 0])!;
      expect(Math.abs(side.x)).toBeLessThanOrEqual(halfW + 1);
      expect(Math.abs(near.y)).toBeLessThanOrEqual(halfH + 1);
      expect(Math.abs(far.y)).toBeLessThanOrEqual(halfH + 1);
      // Against one wall or the other.
      expect(Math.max(Math.abs(side.x) / halfW, Math.abs(near.y) / halfH, Math.abs(far.y) / halfH)).toBeGreaterThan(0.97);
    }
  });

  it('turns the real stars to the ecliptic: Regulus sits on it, Polaris high above', () => {
    const regulus = STAR_CATALOG.find((s) => s.name === 'Regulus')!;
    const [, , z] = eclipticStar(regulus.ra[0] + regulus.ra[1] / 60, regulus.dec);
    expect(Math.abs(z)).toBeLessThan(0.02);
    const [, , pole] = eclipticStar(2.5, 89.3); // Polaris
    expect(pole).toBeGreaterThan(0.9);
    expect(SKY_STARS).toHaveLength(STAR_CATALOG.length);
  });

  it('shows only the stars in front of the camera, on screen', () => {
    const cam = turntableCamera(0, 50, 100, 46, 96);
    expect(projectStar(cam, cam.fwd, 100, 200)).toEqual([50, 100]); // dead ahead: the centre
    expect(projectStar(cam, [-cam.fwd[0], -cam.fwd[1], -cam.fwd[2]], 100, 200)).toBeNull(); // behind
    const shown = SKY_STARS.filter((s) => projectStar(cam, s.dir, 100, 200));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(SKY_STARS.length / 2);
  });
});
