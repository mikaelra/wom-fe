import { describe, expect, it } from 'vitest';
import {
  TEMPLE_POSITION, SENATE_POSITION, SIGNPOST_POSITION, TEMPLE_EXTENT, groundDistance,
  CAMPFIRE_POSITION, SEA_LEVEL, LAND_LEVEL, TEMPLE_BASE_DROP,
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
