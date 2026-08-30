import { describe, expect, it } from 'vitest';
import { ARENA, arenaInteriorHalfExtents, arenaPosition } from '@/lib/rankedArena';
import {
  getCameraTargetPosition, getPlayerPositions, radiusGrowthFactor,
  MAX_PLAYERS, PLAYER_Y,
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
  it('puts its floor at the height the players stand on', () => {
    // The stepped base is built upward from the component's own origin, so
    // the origin has to sit a base's height below PLAYER_Y or the players
    // hover above the floor -- or sink into it.
    const [, y] = arenaPosition();
    expect(y + ARENA.stepHeight * 3).toBeCloseTo(PLAYER_Y, 6);
  });

  it('rests its bottom step on the lobby waterline rather than under it', () => {
    // LobbyScene's sea sits at y = 2. A base starting below that is the
    // half-drowned look the city scene had to be dug out of.
    const [, y] = arenaPosition();
    expect(y).toBeGreaterThanOrEqual(2);
  });

  it('is centred on the table, not offset from it', () => {
    const [x, , z] = arenaPosition();
    expect(x).toBe(0);
    expect(z).toBe(0);
  });
});
