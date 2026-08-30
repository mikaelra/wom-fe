import { describe, expect, it } from 'vitest';
import { TEMPLE_TABLEAU_LIFT, CITY_TABLEAU_MAX_FIGURES } from '@/lib/templeTableau';
import { getBossPlayerPositions, getBossPosition, PLAYER_Y } from '@/lib/sceneConstants';
import { TEMPLE_POSITION, LAND_LEVEL, TEMPLE_BASE_DROP } from '@/lib/cityLayout';

describe('where the tableau stands', () => {
  it('puts the figures on the same floor the lobby stands them on', () => {
    // The lobby places temple.glb at y = 4; the model's base is 8.07 below
    // its origin, so that base sits at -4.07, and the lobby's players stand
    // at PLAYER_Y. Reusing that difference is what makes this a derived
    // number rather than one somebody nudged until it looked right.
    expect(TEMPLE_TABLEAU_LIFT).toBeCloseTo(PLAYER_Y - (4 - TEMPLE_BASE_DROP), 6);
  });

  it('lands the figures inside the temple, not under or over it', () => {
    const figureY = LAND_LEVEL + TEMPLE_TABLEAU_LIFT;
    const templeBase = TEMPLE_POSITION[1] - TEMPLE_BASE_DROP;
    const templeTop = templeBase + 18.52;

    expect(templeBase).toBeCloseTo(LAND_LEVEL, 6);
    expect(figureY).toBeGreaterThan(templeBase);
    expect(figureY).toBeLessThan(templeTop);
  });

  it('keeps every figure within the temple\'s footprint', () => {
    // temple.glb is 35.66 by 63.21 around its origin. A seat outside that
    // would put a player standing in the open air beside the building.
    const halfX = 35.66 / 2;
    const halfZ = 63.21 / 2;
    for (const seat of getBossPlayerPositions(CITY_TABLEAU_MAX_FIGURES)) {
      expect(Math.abs(seat.position[0])).toBeLessThan(halfX);
      expect(Math.abs(seat.position[2])).toBeLessThan(halfZ);
    }
    expect(Math.abs(getBossPosition().position[0])).toBeLessThan(halfX);
    expect(Math.abs(getBossPosition().position[2])).toBeLessThan(halfZ);
  });
});

describe('how many figures', () => {
  it('caps below a full bossfight, since each one is a GLTF clone', () => {
    expect(CITY_TABLEAU_MAX_FIGURES).toBeGreaterThan(4);
    expect(CITY_TABLEAU_MAX_FIGURES).toBeLessThan(24);
  });

  it('still seats everyone it does draw', () => {
    expect(getBossPlayerPositions(CITY_TABLEAU_MAX_FIGURES)).toHaveLength(CITY_TABLEAU_MAX_FIGURES);
  });
});
