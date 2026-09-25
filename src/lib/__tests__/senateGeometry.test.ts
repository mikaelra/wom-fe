import { describe, expect, it } from 'vitest';
import { senateColumns } from '@/lib/senateGeometry';

const WIDTH = 8.4;
const DEPTH = 5.0;
const RADIUS = 0.32;
const { positions, interior } = senateColumns(WIDTH, DEPTH, RADIUS, 6, 4);

const key = ([x, z]: [number, number]) => `${x.toFixed(6)},${z.toFixed(6)}`;

describe('the colonnade ring', () => {
  it('places no two columns in the same spot', () => {
    // The bug this file exists for. Looping per side puts a column on each
    // corner twice; the duplicates z-fight and flicker as the camera moves,
    // and nothing about the code would look wrong.
    expect(new Set(positions.map(key)).size).toBe(positions.length);
  });

  it('puts a column on each of the four corners, exactly once', () => {
    const halfW = (WIDTH - RADIUS * 4) / 2;
    const halfD = (DEPTH - RADIUS * 4) / 2;
    for (const corner of [[halfW, halfD], [halfW, -halfD], [-halfW, halfD], [-halfW, -halfD]] as [number, number][]) {
      expect(positions.filter((p) => key(p) === key(corner))).toHaveLength(1);
    }
  });

  it('runs all the way round rather than across the facade only', () => {
    // Front and back rows, plus the two interior columns of each side.
    expect(positions).toHaveLength(6 * 2 + (4 - 2) * 2);
    expect(positions.some(([, z]) => z > 0)).toBe(true);
    expect(positions.some(([, z]) => z < 0)).toBe(true);
    expect(positions.some(([x]) => x > 0)).toBe(true);
    expect(positions.some(([x]) => x < 0)).toBe(true);
  });

  it('is symmetric about both axes', () => {
    const set = new Set(positions.map(key));
    for (const [x, z] of positions) {
      expect(set.has(key([-x, z]))).toBe(true);
      expect(set.has(key([x, -z]))).toBe(true);
    }
  });

  it('leaves a clear middle big enough to stand players in', () => {
    // The whole reason the cella came out. Ranked is up to a handful of
    // players; anything under a couple of units each way would be a cage.
    expect(interior.width).toBeGreaterThan(4);
    expect(interior.depth).toBeGreaterThan(2.5);
    expect(interior.width).toBeLessThan(WIDTH);
    expect(interior.depth).toBeLessThan(DEPTH);
  });
});
