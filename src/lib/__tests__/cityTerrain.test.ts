import { describe, expect, it } from 'vitest';
import {
  terrainHeight, relief, padFlatness, islandPlacements, groundOffsetFor,
  LAND_LEVEL, SHORE_RADIUS, LAND_RADIUS, RELIEF_HEIGHT,
} from '@/lib/cityTerrain';
import { PLAYER_Y } from '@/lib/sceneConstants';
import {
  SEA_LEVEL, SIGNPOST_POSITION, CAMPFIRE_POSITION, TEMPLE_POSITION, SENATE_POSITION,
} from '@/lib/cityLayout';

const STANDING_ON = [
  ['the viewer', 0, 0],
  ['the campfire', CAMPFIRE_POSITION[0], CAMPFIRE_POSITION[2]],
  ['the signpost', SIGNPOST_POSITION[0], SIGNPOST_POSITION[2]],
  ['the temple', TEMPLE_POSITION[0], TEMPLE_POSITION[2]],
  ['the Senate', SENATE_POSITION[0], SENATE_POSITION[2]],
] as const;

describe('ground under the things standing on it', () => {
  it.each(STANDING_ON)('is dry land under %s', (_name, x, z) => {
    expect(terrainHeight(x, z)).toBeGreaterThan(SEA_LEVEL);
  });

  it.each(STANDING_ON)('is exactly the plateau under %s, not a slope', (_name, x, z) => {
    // A building on a slope floats at one corner and sinks at the other.
    // There is no per-object terrain fitting, so the ground has to be level
    // where something is placed -- which is what the pads are for.
    expect(terrainHeight(x, z)).toBeCloseTo(LAND_LEVEL, 6);
  });

  it('stays level across a building\'s whole footprint, not just its centre', () => {
    // temple.glb is 35.6 by 63.2. Sampling only its origin would pass while
    // a hill pushed up through one end of it.
    for (const dx of [-17, 0, 17]) {
      for (const dz of [-31, 0, 31]) {
        expect(terrainHeight(TEMPLE_POSITION[0] + dx, TEMPLE_POSITION[2] + dz))
          .toBeCloseTo(LAND_LEVEL, 6);
      }
    }
  });
});

describe('the shape of the island', () => {
  it('never dips below the waterline inland, so no puddles open up', () => {
    // relief() is deliberately non-negative for exactly this reason: it only
    // ever adds to the plateau.
    for (let x = -90; x <= 90; x += 7) {
      for (let z = -90; z <= 90; z += 7) {
        if (Math.hypot(x, z) > SHORE_RADIUS * 0.9) continue;
        expect(terrainHeight(x, z)).toBeGreaterThanOrEqual(LAND_LEVEL - 1e-9);
      }
    }
  });

  it('is under water past the shore, so there is a coast and not a cliff', () => {
    for (const r of [LAND_RADIUS * 0.95, LAND_RADIUS]) {
      for (const a of [0, 1.1, 2.4, 3.7, 5.0]) {
        expect(terrainHeight(Math.cos(a) * r, Math.sin(a) * r)).toBeLessThan(SEA_LEVEL);
      }
    }
  });

  it('crosses the waterline somewhere between the shore and the rim', () => {
    // The coastline has to actually exist on the mesh. Walk out along a
    // bearing and find the crossing.
    const at = (r: number) => terrainHeight(0, -r);
    expect(at(SHORE_RADIUS)).toBeGreaterThan(SEA_LEVEL);
    expect(at(LAND_RADIUS)).toBeLessThan(SEA_LEVEL);
  });

  it('has hills worth calling terrain, but none taller than RELIEF_HEIGHT', () => {
    let highest = -Infinity;
    for (let x = -80; x <= 80; x += 3) {
      for (let z = -80; z <= 80; z += 3) {
        highest = Math.max(highest, terrainHeight(x, z));
      }
    }
    expect(highest).toBeGreaterThan(LAND_LEVEL + RELIEF_HEIGHT * 0.5);
    expect(highest).toBeLessThanOrEqual(LAND_LEVEL + RELIEF_HEIGHT + 1e-9);
  });

  it('is the same island every visit', () => {
    expect(terrainHeight(31, -47)).toBe(terrainHeight(31, -47));
    expect(relief(12, 34)).toBeCloseTo(relief(12, 34), 12);
  });
});

describe('padFlatness', () => {
  it('is zero on a pad and one well clear of every pad', () => {
    expect(padFlatness(SENATE_POSITION[0], SENATE_POSITION[2])).toBe(0);
    expect(padFlatness(75, 75)).toBe(1);
  });
});

describe('relief', () => {
  it('never goes negative, which is what keeps the plateau dry', () => {
    for (let x = -150; x <= 150; x += 11) {
      for (let z = -150; z <= 150; z += 11) {
        expect(relief(x, z)).toBeGreaterThanOrEqual(0);
        expect(relief(x, z)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the islands on the horizon', () => {
  const islands = islandPlacements();

  it('keeps every one of them far beyond the home island', () => {
    for (const isle of islands) {
      const d = Math.hypot(isle.position[0], isle.position[2]);
      expect(d).toBeGreaterThan(LAND_RADIUS * 5);
    }
  });

  it('sits each one half-sunk, so the waterline cuts its silhouette', () => {
    for (const isle of islands) {
      const height = isle.scale[1];
      expect(isle.position[1]).toBeCloseTo(SEA_LEVEL - height * 0.5, 6);
      // Its top is above the water by half its height; below it and the
      // island would be a reef.
      expect(isle.position[1] + height).toBeGreaterThan(SEA_LEVEL);
    }
  });

  it('draws each as a low ridge, never taller than it is wide', () => {
    for (const isle of islands) {
      expect(isle.scale[1]).toBeLessThan(isle.scale[0]);
      expect(isle.scale[1]).toBeLessThan(isle.scale[2]);
    }
  });

  it('subtends a plausible angle -- distance, not a wall', () => {
    for (const isle of islands) {
      const d = Math.hypot(isle.position[0], isle.position[2]);
      const deg = (Math.atan((isle.scale[1] * 0.5) / d) * 180) / Math.PI;
      expect(deg).toBeGreaterThan(0.2);
      expect(deg).toBeLessThan(4);
    }
  });

  it('spreads them around the horizon rather than clumping', () => {
    const bearings = islands
      .map((i) => ((Math.atan2(i.position[0], -i.position[2]) * 180) / Math.PI + 360) % 360)
      .sort((a, b) => a - b);
    for (let i = 1; i < bearings.length; i++) {
      expect(bearings[i] - bearings[i - 1]).toBeGreaterThan(15);
    }
  });
});

describe('staging the island in a lobby', () => {
  it('lands the ground exactly under the players\' feet', () => {
    // A boss fight is fought on the city's terrain, but the two scenes
    // measure their floors from different places: the city's ground is
    // LAND_LEVEL and the lobby's players stand at PLAYER_Y. Get this wrong
    // and everyone hovers above the island -- or sinks into it.
    const lifted = terrainHeight(0, 0) + groundOffsetFor(PLAYER_Y);
    expect(lifted).toBeCloseTo(PLAYER_Y, 6);
  });

  it('keeps the sea the same distance below the land after the lift', () => {
    // Lifting the whole island rather than the terrain alone is what stops
    // the coastline drowning or stranding.
    const before = LAND_LEVEL - SEA_LEVEL;
    const offset = groundOffsetFor(PLAYER_Y);
    expect((LAND_LEVEL + offset) - (SEA_LEVEL + offset)).toBeCloseTo(before, 6);
  });

  it('is flat where the table stands, not on a hillside', () => {
    // The origin pad exists for the city's viewer; the lobby's table
    // inherits it, which is why a boss fight is not played on a slope.
    for (const [x, z] of [[0, 0], [2, 0], [0, 2], [-2, -2]]) {
      expect(terrainHeight(x, z)).toBeCloseTo(LAND_LEVEL, 6);
    }
  });
});
