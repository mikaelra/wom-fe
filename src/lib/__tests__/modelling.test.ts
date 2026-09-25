import { describe, expect, it } from 'vitest';
import {
  MODELLING_MODELS,
  DEFAULT_MODELLING_MODEL,
  findModellingModel,
  boundingRadius,
  orbitFraming,
  orbitCameraPosition,
  gridSizeFor,
} from '@/lib/modelling';

describe('the /modelling model list', () => {
  it('offers the two buildings being sculpted, plus the Senate at city size', () => {
    expect(MODELLING_MODELS.map((m) => m.id)).toEqual(['ranked', 'market', 'senate-city']);
  });

  it('has a unique id and a non-empty caption for every entry', () => {
    const ids = MODELLING_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODELLING_MODELS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.blurb.length).toBeGreaterThan(0);
      expect(m.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('resolves a known ?model= value', () => {
    expect(findModellingModel('market').id).toBe('market');
  });

  it('falls back to the default for junk, null and undefined', () => {
    expect(findModellingModel('temple').id).toBe(DEFAULT_MODELLING_MODEL);
    expect(findModellingModel(null).id).toBe(DEFAULT_MODELLING_MODEL);
    expect(findModellingModel(undefined).id).toBe(DEFAULT_MODELLING_MODEL);
  });

  it('has a default that is actually in the list', () => {
    expect(MODELLING_MODELS.some((m) => m.id === DEFAULT_MODELLING_MODEL)).toBe(true);
  });
});

describe('boundingRadius', () => {
  it('is half the box diagonal', () => {
    expect(boundingRadius({ x: 2, y: 3, z: 6 })).toBeCloseTo(3.5, 10);
  });

  it('does not change when the box is turned on its side', () => {
    const a = boundingRadius({ x: 28, y: 18, z: 22 });
    const b = boundingRadius({ x: 22, y: 18, z: 28 });
    expect(a).toBeCloseTo(b, 10);
  });
});

describe('orbitFraming', () => {
  const size = { x: 28, y: 18, z: 22 };

  it('puts the bounding sphere at exactly fillRatio of the visible half-height', () => {
    const { distance } = orbitFraming(size, { fov: 50, fillRatio: 0.78 });
    const visibleHalfHeight = distance * Math.tan((50 * Math.PI) / 360);
    expect(boundingRadius(size) / visibleHalfHeight).toBeCloseTo(0.78, 10);
  });

  it('backs further off for a bigger model', () => {
    const near = orbitFraming({ x: 7.5, y: 4, z: 4.2 }, { fov: 50 });
    const far = orbitFraming(size, { fov: 50 });
    expect(far.distance).toBeGreaterThan(near.distance);
  });

  it('backs off on a portrait viewport, where width runs out first', () => {
    const landscape = orbitFraming(size, { fov: 50, aspect: 1.8 });
    const portrait = orbitFraming(size, { fov: 50, aspect: 0.5 });
    expect(portrait.distance).toBeCloseTo(landscape.distance * 2, 10);
  });

  it('does not pull the camera IN on a wide viewport -- the model must not overflow vertically', () => {
    const square = orbitFraming(size, { fov: 50, aspect: 1 });
    const wide = orbitFraming(size, { fov: 50, aspect: 2.4 });
    expect(wide.distance).toBeCloseTo(square.distance, 10);
  });

  it('lets the camera get inside the arena: minDistance is well within the model', () => {
    // The ranked Senate is a hollow peristyle you play a match inside; a
    // sandbox that cannot get under the dome cannot show that view.
    const { minDistance } = orbitFraming(size, { fov: 50 });
    expect(minDistance).toBeLessThan(Math.min(size.x, size.z) / 2);
  });

  it('never allows a zero or negative min distance for a degenerate box', () => {
    const { minDistance, distance } = orbitFraming({ x: 0, y: 0, z: 0 }, { fov: 50 });
    expect(minDistance).toBeGreaterThan(0);
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThan(0);
  });

  it('allows pulling back past the framed distance', () => {
    const { distance, maxDistance } = orbitFraming(size, { fov: 50 });
    expect(maxDistance).toBeGreaterThan(distance);
  });
});

describe('orbitCameraPosition', () => {
  it('hovers above the target and stands off along +Z', () => {
    const [x, y, z] = orbitCameraPosition(10, 4, 30);
    expect(x).toBe(0);
    expect(y).toBeCloseTo(4 + 5, 10);
    expect(z).toBeCloseTo(10 * Math.cos(Math.PI / 6), 10);
  });

  it('keeps the requested distance from the target', () => {
    const targetY = 9;
    const [x, y, z] = orbitCameraPosition(20, targetY, 22);
    expect(Math.hypot(x, y - targetY, z)).toBeCloseTo(20, 10);
  });

  it('is level with the target at zero elevation', () => {
    const [, y, z] = orbitCameraPosition(12, 3, 0);
    expect(y).toBeCloseTo(3, 10);
    expect(z).toBeCloseTo(12, 10);
  });
});

describe('gridSizeFor', () => {
  it('outsizes the model footprint', () => {
    expect(gridSizeFor({ x: 28, y: 18, z: 22 })).toBeGreaterThan(28);
  });

  it('rounds to a whole ten so the grid lines stay whole units', () => {
    expect(gridSizeFor({ x: 28, y: 18, z: 22 }) % 10).toBe(0);
  });

  it('has a floor, so a tiny model still gets a readable ground', () => {
    expect(gridSizeFor({ x: 0.4, y: 0.4, z: 0.4 })).toBe(10);
  });
});
