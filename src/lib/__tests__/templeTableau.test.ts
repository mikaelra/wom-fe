import { describe, expect, it } from 'vitest';
import {
  TEMPLE_TABLEAU_LIFT, CITY_TABLEAU_MAX_FIGURES, TABLEAU_ZOOM,
  LOBBY_FIGURE_SCALE, LOBBY_BOSS_SCALE, tableauGroupY,
} from '@/lib/templeTableau';
import { getBossPlayerPositions, getBossPosition, PLAYER_Y } from '@/lib/sceneConstants';
import { TEMPLE_POSITION, LAND_LEVEL, TEMPLE_BASE_DROP, EYE_HEIGHT } from '@/lib/cityLayout';

// Measured from the GLBs (see lib/cityLayout.ts for the same technique on
// temple.glb): a frog is 1.90 units tall, hades_v4 is a unit-sized model,
// and the Well is 9.94 across before Table's own 1.2 scale.
const FROG_HEIGHT = 1.90;
const HADES_HEIGHT = 1.00;
const WELL_WIDTH = 9.94 * 1.2;
const TEMPLE_WIDTH = 35.66;

/** How far the viewer stands from the tableau, eye to figures. */
function viewingDistance(): number {
  const ground = Math.hypot(TEMPLE_POSITION[0], TEMPLE_POSITION[2]);
  const rise = LAND_LEVEL + TEMPLE_TABLEAU_LIFT - (LAND_LEVEL + EYE_HEIGHT);
  return Math.hypot(ground, rise);
}

const degreesTall = (height: number) =>
  (Math.atan(height / viewingDistance()) * 180) / Math.PI;

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

describe('you can actually see them', () => {
  // The regression this exists for, and it shipped: the first version scaled
  // figures by 0.15 -- a number copied from the players-at-a-table demo that
  // step 12 deleted -- which drew a 1.90-unit frog at 0.29 units. From 45
  // units that is about a third of a degree. Reported immediately as "I
  // can't see them".
  it('draws a player big enough to read as a person from across the bay', () => {
    const height = FROG_HEIGHT * LOBBY_FIGURE_SCALE * TABLEAU_ZOOM;
    expect(degreesTall(height)).toBeGreaterThan(2);
  });

  it('draws Hades larger than the players, not smaller', () => {
    // hades_v4.glb is a unit-sized model where the frogs are not, so equal
    // scale numbers do NOT mean equal size -- which is how the boss ended up
    // four times smaller than the people fighting him.
    const player = FROG_HEIGHT * LOBBY_FIGURE_SCALE;
    const hades = HADES_HEIGHT * LOBBY_BOSS_SCALE;
    expect(hades).toBeGreaterThan(player * 2);
  });

  it('still fits the whole arrangement inside the temple', () => {
    // The other side of the trade: zoom far enough and the Well bursts out
    // through the columns.
    expect(WELL_WIDTH * TABLEAU_ZOOM).toBeLessThan(TEMPLE_WIDTH);
  });

  it('puts the scaled group where its floor still lands on the temple floor', () => {
    // A scaled group multiplies its children's local y as well as their
    // spacing, so the offset has to account for the zoom or the figures
    // float above the building.
    const floor = tableauGroupY(LAND_LEVEL, PLAYER_Y) + PLAYER_Y * TABLEAU_ZOOM;
    expect(floor).toBeCloseTo(LAND_LEVEL + TEMPLE_TABLEAU_LIFT, 6);
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
