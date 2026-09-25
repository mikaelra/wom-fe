import { describe, expect, it } from 'vitest';
import {
  terrainHeight, relief, padFlatness, islandPlacements, templeFloorOffsetFor,
  LAND_LEVEL, SHORE_RADIUS, LAND_RADIUS, RELIEF_HEIGHT,
} from '@/lib/cityTerrain';
import { PLAYER_Y } from '@/lib/sceneConstants';
import { TEMPLE_TABLEAU_LIFT } from '@/lib/templeTableau';
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
  const offset = templeFloorOffsetFor(PLAYER_Y);

  it('puts the ground at the temple\'s base, not at its floor', () => {
    // The bug this replaces: aligning the island to the players' feet put
    // the terrain AT the temple's floor -- ground inside the building. They
    // stand on the floor; only the BASE has anything to do with the terrain.
    const groundUnderTheTable = terrainHeight(0, 0) + offset;
    expect(groundUnderTheTable).toBeCloseTo(PLAYER_Y - TEMPLE_TABLEAU_LIFT, 6);
    expect(groundUnderTheTable).toBeLessThan(PLAYER_Y);
  });

  it('leaves the same gap under the floor as the city does', () => {
    // The whole point: the view out from between the columns should be the
    // one the city gives from inside its temple.
    expect(PLAYER_Y - (terrainHeight(0, 0) + offset)).toBeCloseTo(TEMPLE_TABLEAU_LIFT, 6);
  });

  it('keeps the sea the same distance below the land after the lift', () => {
    // Lifting the whole island rather than the terrain alone is what stops
    // the coastline drowning or stranding.
    const before = LAND_LEVEL - SEA_LEVEL;
    expect((LAND_LEVEL + offset) - (SEA_LEVEL + offset)).toBeCloseTo(before, 6);
  });

  it('is flat where the table stands, not on a hillside', () => {
    for (const [x, z] of [[0, 0], [2, 0], [0, 2], [-2, -2]]) {
      expect(terrainHeight(x, z)).toBeCloseTo(LAND_LEVEL, 6);
    }
  });
});

describe('a building standing at the origin', () => {
  // temple.glb, which the boss lobby puts at 0,0 -- 35.7 wide and 63.2 deep.
  const HALF_X = 17.8;
  const HALF_Z = 31.6;
  const CLEAR = 38;

  it('was growing hills inside the temple before the clear radius existed', () => {
    // The reported bug, kept as the reason this parameter is here: the
    // city's origin pad is 16 units, the temple reaches 31.6, so its far end
    // sat on rising ground more than a unit above its own floor.
    expect(terrainHeight(0, 25)).toBeGreaterThan(LAND_LEVEL + 0.5);
  });

  it('is flat across the whole footprint once cleared', () => {
    for (const x of [-HALF_X, 0, HALF_X]) {
      for (const z of [-HALF_Z, 0, HALF_Z]) {
        expect(terrainHeight(x, z, CLEAR)).toBeCloseTo(LAND_LEVEL, 6);
      }
    }
  });

  it('still has hills further out, so the island is not simply flattened', () => {
    let highest = -Infinity;
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      highest = Math.max(highest, terrainHeight(Math.cos(a) * 70, Math.sin(a) * 70, CLEAR));
    }
    expect(highest).toBeGreaterThan(LAND_LEVEL + 0.5);
  });

  it('leaves the city itself untouched -- the default clears nothing', () => {
    expect(terrainHeight(0, 25, 0)).toBe(terrainHeight(0, 25));
  });
});
