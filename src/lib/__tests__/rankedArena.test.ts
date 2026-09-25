import { describe, expect, it } from 'vitest';
import { ARENA, arenaInteriorHalfExtents, arenaPosition } from '@/lib/rankedArena';
// LobbyScene's own sea height. Duplicated here rather than imported because
// it is a module-private constant in a component this suite does not touch.
const SEA_LEVEL = 2;
import {
  getCameraTargetPosition, getPlayerPositions, radiusGrowthFactor,
  MAX_PLAYERS, PLAYER_Y, LOBBY_FLOOR_Y, TABLE_POSITION,
} from '@/lib/sceneConstants';

const interior = arenaInteriorHalfExtents();

// The viewports the lobby actually gets rendered at, narrow to wide.
const VIEWPORTS: [number, number][] = [
  [390, 844],   // phone, portrait
  [768, 1024],  // tablet, portrait
  [1024, 768],  // tablet, landscape
  [1440, 900],  // laptop
  [2560, 1080], // ultrawide
];

describe('the camera stays inside the colonnade', () => {
  it('at every viewport and every player count', () => {
    // The failure this exists to prevent: the camera pulls back as a lobby
    // fills, and past a certain point it would sit level with the columns --
    // so a pillar drifts between you and the table, at some player counts,
    // on some screens only.
    for (const [w, h] of VIEWPORTS) {
      for (let count = 1; count <= MAX_PLAYERS; count++) {
        const [, , z] = getCameraTargetPosition(w, h, radiusGrowthFactor(count));
        expect(
          z,
          `${w}x${h} with ${count} players puts the camera at z=${z.toFixed(2)}, outside ${interior.z.toFixed(2)}`,
        ).toBeLessThan(interior.z);
      }
    }
  });

  it('with room to spare, so a small tuning change cannot silently break it', () => {
    const worst = Math.max(
      ...VIEWPORTS.map(([w, h]) => getCameraTargetPosition(w, h, radiusGrowthFactor(MAX_PLAYERS))[2]),
    );
    expect(interior.z - worst).toBeGreaterThan(1.5);
  });
});

describe('the players fit in it', () => {
  it('holds a full lobby well clear of the columns', () => {
    for (const seat of getPlayerPositions(MAX_PLAYERS)) {
      const [x, , z] = seat.position;
      expect(Math.abs(x)).toBeLessThan(interior.x);
      expect(Math.abs(z)).toBeLessThan(interior.z);
    }
  });
});

describe('where it stands', () => {
  it('puts its floor exactly where the temple puts its floor', () => {
    // The one thing that must hold: swapping the building a match is played
    // in must not move the ground under the players. LOBBY_FLOOR_Y is the
    // temple's own floor, derived from the GLB rather than copied.
    const [, y] = arenaPosition();
    expect(y + ARENA.stepHeight * 3).toBeCloseTo(LOBBY_FLOOR_Y, 6);
  });

  it('does not build the floor up to PLAYER_Y, which is a player\'s WAIST', () => {
    // The regression this replaces. A player model's origin is at its
    // middle, not under its feet, so a floor at PLAYER_Y came through
    // everyone at the waist. It read as an obvious bug and had stood since
    // the arena was written, because nothing here had ever been looked at
    // in a real ranked match.
    const [, y] = arenaPosition();
    expect(y + ARENA.stepHeight * 3).toBeLessThan(PLAYER_Y);
  });

  it('leaves the well standing on the floor rather than buried in the base', () => {
    // The other half of the same fault: the base is solid, so a floor above
    // the well swallows it whole and the ranked lobby has no visible well
    // at all. The well's own model is 0.36 tall from TABLE_POSITION up.
    const [, y] = arenaPosition();
    const floor = y + ARENA.stepHeight * 3;
    expect(TABLE_POSITION[1]).toBeGreaterThanOrEqual(floor);
  });

  it('keeps the floor itself above the waterline, so nobody stands in water', () => {
    // Note what this does NOT say. The bottom of the base is below the sea
    // plane at y = 2 and that is correct -- the temple's slabs run far
    // deeper, and a building standing in water is the look. What matters is
    // that the surface players are on is dry. The test that used to sit
    // here asserted the whole base cleared the water, which could only be
    // met by a floor at the wrong height or by steps 0.14 high.
    const [, y] = arenaPosition();
    expect(y + ARENA.stepHeight * 3).toBeGreaterThan(SEA_LEVEL);
  });

  it('is centred on the table, not offset from it', () => {
    const [x, , z] = arenaPosition();
    expect(x).toBe(0);
    expect(z).toBe(0);
  });
});
