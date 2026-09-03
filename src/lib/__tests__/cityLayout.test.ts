import { describe, expect, it } from 'vitest';
import {
  TEMPLE_POSITION, SENATE_POSITION, SIGNPOST_POSITION, TEMPLE_EXTENT, groundDistance,
  CAMPFIRE_POSITION, SEA_LEVEL, LAND_LEVEL, TEMPLE_BASE_DROP, MARKET_POSITION,
  SENATE_BOT_POSITION, RANKED_FORK_SIGNPOST_POSITION, RANKED_FORK_VIEW_PIN,
  RANKED_FORK_VIEW_DISTANCE, EYE_HEIGHT,
} from '@/lib/cityLayout';

// Scene compass (lib/citySkyGeometry.ts): -Z is north, +X is east, and the
// default camera looks down -Z. So -X is the viewer's LEFT and -Z is in
// front of them.

describe('which building is on which side', () => {
  it('puts the Temple on the LEFT, where the signpost\'s left arm points', () => {
    // The one invariant that must never break. Swap these and the scene
    // still renders perfectly, the hover highlighting still pairs an arm
    // with a building, and every player is sent to the wrong fight.
    // Temple -> Bossfight (left arm), Senate -> Ranked (right arm), §1.1.
    expect(TEMPLE_POSITION[0]).toBeLessThan(0);
    expect(SENATE_POSITION[0]).toBeGreaterThan(0);
  });

  it('keeps them on opposite sides of the signpost, not merely both off-centre', () => {
    expect(Math.sign(TEMPLE_POSITION[0])).not.toBe(Math.sign(SENATE_POSITION[0]));
    expect(SIGNPOST_POSITION[0]).toBe(0);
  });
});

describe('the Market (wom-be docs/MARKET_PLAN.md §3.2)', () => {
  it('sits in the back-right quadrant: right of centre, behind the viewer', () => {
    // "south-east" -- right is +X, "back" (away from a viewer looking
    // north / down -Z) is +Z. Pairs with the signpost's right-side MARKET
    // arm, same as Senate on the right.
    expect(MARKET_POSITION[0]).toBeGreaterThan(0);
    expect(MARKET_POSITION[2]).toBeGreaterThan(0);
  });

  it('leaves the back-left (south-west) quadrant clear for a later building', () => {
    // §3.2 reserves -X / +Z. The Market must not stray into it.
    expect(MARKET_POSITION[0]).toBeGreaterThan(0);
  });

  it('stands on the land like the rest of the city', () => {
    expect(MARKET_POSITION[1]).toBe(LAND_LEVEL);
  });

  it('is a doorway you walk to, not a far backdrop like the temple', () => {
    expect(groundDistance(MARKET_POSITION)).toBeLessThan(groundDistance(TEMPLE_POSITION));
  });
});

describe('depth', () => {
  it('stands everything in front of the viewer', () => {
    for (const p of [TEMPLE_POSITION, SENATE_POSITION, SIGNPOST_POSITION]) {
      expect(p[2]).toBeLessThan(0);
    }
  });

  it('reads the signpost first, with both buildings beyond it', () => {
    expect(groundDistance(SIGNPOST_POSITION)).toBeLessThan(groundDistance(TEMPLE_POSITION));
    expect(groundDistance(SIGNPOST_POSITION)).toBeLessThan(groundDistance(SENATE_POSITION));
  });

  it('sets the Temple further out than the Senate, because it is far bigger', () => {
    // 35.7 wide and 63.2 deep against the Senate's 8.4 by 5.0. At a matching
    // distance it dominates the scene and crowds the signpost between them.
    expect(groundDistance(TEMPLE_POSITION)).toBeGreaterThan(groundDistance(SENATE_POSITION));
  });
});

describe('the temple has the room its size needs', () => {
  it('keeps its bulk clear of the centre line, so the signpost is not inside it', () => {
    // Its old position (x = -15) put the right-hand edge of a 35.7-wide
    // model past x = 0 -- the signpost stood inside the building's footprint
    // and the viewer inside its bounding box.
    const rightEdge = TEMPLE_POSITION[0] + TEMPLE_EXTENT.x;
    expect(rightEdge).toBeLessThan(SIGNPOST_POSITION[0]);
  });

  it('does not reach across into the Senate', () => {
    expect(TEMPLE_POSITION[0] + TEMPLE_EXTENT.x).toBeLessThan(SENATE_POSITION[0]);
  });
});

describe('the ranked fork', () => {
  it('stands the fork signpost squarely between the two Senates', () => {
    // "between the two senates" -- the midpoint of the shared-corner gap, not
    // pulled off toward one hall or the viewer.
    const midX = (SENATE_POSITION[0] + SENATE_BOT_POSITION[0]) / 2;
    const midZ = (SENATE_POSITION[2] + SENATE_BOT_POSITION[2]) / 2;
    expect(RANKED_FORK_SIGNPOST_POSITION[0]).toBeCloseTo(midX, 6);
    expect(RANKED_FORK_SIGNPOST_POSITION[2]).toBeCloseTo(midZ, 6);
    expect(RANKED_FORK_SIGNPOST_POSITION[1]).toBe(LAND_LEVEL);
  });

  it('frames the fork exactly like the scene frames the city signpost on entry', () => {
    // Same distance the viewer stands from the city signpost at the origin,
    // so the two posts land on screen at the same size and pitch.
    expect(RANKED_FORK_VIEW_DISTANCE).toBeCloseTo(groundDistance(SIGNPOST_POSITION), 6);
  });

  it('parks the guided camera due south of the fork at eye height', () => {
    // Due south (+Z) and dead level: the camera looks down -Z, the scene's
    // entry pose, carried bodily to the fork.
    expect(RANKED_FORK_VIEW_PIN[0]).toBeCloseTo(RANKED_FORK_SIGNPOST_POSITION[0], 6);
    expect(RANKED_FORK_VIEW_PIN[1]).toBeCloseTo(LAND_LEVEL + EYE_HEIGHT, 6);
    expect(RANKED_FORK_VIEW_PIN[2]).toBeCloseTo(
      RANKED_FORK_SIGNPOST_POSITION[2] + RANKED_FORK_VIEW_DISTANCE, 6);
    // In front of the sign (nearer the viewer's homeland), and the sign is
    // in front of both Senates from there.
    expect(RANKED_FORK_VIEW_PIN[2]).toBeGreaterThan(RANKED_FORK_SIGNPOST_POSITION[2]);
  });
});

describe('the campfire', () => {
  it('sits between the viewer and the signpost, lighting the arms\' faces', () => {
    // In front of the post, not behind it: light on the back of a signpost
    // reads it out as a silhouette.
    expect(CAMPFIRE_POSITION[2]).toBeGreaterThan(SIGNPOST_POSITION[2]);
    expect(CAMPFIRE_POSITION[2]).toBeLessThan(0);
  });

  it('is close enough to the signpost to actually light it', () => {
    const gap = Math.hypot(
      CAMPFIRE_POSITION[0] - SIGNPOST_POSITION[0],
      CAMPFIRE_POSITION[2] - SIGNPOST_POSITION[2],
    );
    expect(gap).toBeLessThan(6);
  });

  it('stands on the ground, like everything else now does', () => {
    // Before there was ground, everything was pitched at y = 0 and rose
    // through a water plane -- the Senate's steps and two units of the
    // signpost were permanently submerged, and the fire had to be floated
    // at SEA_LEVEL on its own to avoid drowning. They all sit on the land
    // now, and the special case is gone.
    expect(CAMPFIRE_POSITION[1]).toBe(LAND_LEVEL);
    expect(SIGNPOST_POSITION[1]).toBe(LAND_LEVEL);
    expect(SENATE_POSITION[1]).toBe(LAND_LEVEL);
    expect(LAND_LEVEL).toBeGreaterThan(SEA_LEVEL);
  });

  it('lifts the temple by its own base drop, not by its origin', () => {
    // temple.glb's bounding box runs from y -8.07 to 10.45 around its
    // origin, so putting the origin on the ground would bury eight units of
    // it -- which is exactly what used to happen.
    expect(TEMPLE_POSITION[1]).toBeCloseTo(LAND_LEVEL + TEMPLE_BASE_DROP, 6);
    expect(TEMPLE_POSITION[1] - TEMPLE_BASE_DROP).toBeCloseTo(LAND_LEVEL, 6);
  });
});
