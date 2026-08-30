import { describe, expect, it } from 'vitest';
import {
  TEMPLE_POSITION, SENATE_POSITION, SIGNPOST_POSITION, TEMPLE_EXTENT, groundDistance,
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
