import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  focusOpacity, viewAngleDeg, occludedBySphere, FOCUS_INNER_DEG, FOCUS_OUTER_DEG,
} from '@/lib/gazeFocus';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('focusOpacity', () => {
  it('is fully opaque on the axis and out to the inner threshold', () => {
    expect(focusOpacity(0)).toBe(1);
    expect(focusOpacity(FOCUS_INNER_DEG)).toBe(1);
  });

  it('is fully transparent at and beyond the outer threshold', () => {
    expect(focusOpacity(FOCUS_OUTER_DEG)).toBe(0);
    expect(focusOpacity(45)).toBe(0);
    expect(focusOpacity(180)).toBe(0);
  });

  it('falls off smoothly in between, never increasing', () => {
    let prev = 1.0001;
    for (let a = 0; a <= 20; a += 0.25) {
      const o = focusOpacity(a);
      expect(o).toBeLessThanOrEqual(prev);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(1);
      prev = o;
    }
  });

  it('has no jump at either threshold -- the gap between them is the hysteresis', () => {
    for (const edge of [FOCUS_INNER_DEG, FOCUS_OUTER_DEG]) {
      const jump = Math.abs(focusOpacity(edge + 0.01) - focusOpacity(edge - 0.01));
      expect(jump).toBeLessThan(0.01);
    }
    // And a body parked exactly on one edge cannot strobe between visible
    // and invisible, because neither edge is the on/off boundary.
    expect(focusOpacity(FOCUS_INNER_DEG + 0.01)).toBeLessThan(1);
    expect(focusOpacity(FOCUS_OUTER_DEG - 0.01)).toBeGreaterThan(0);
  });

  it('honours caller-supplied thresholds', () => {
    expect(focusOpacity(20, 30, 40)).toBe(1);
    expect(focusOpacity(50, 30, 40)).toBe(0);
  });

  it('fails closed on a non-finite angle', () => {
    expect(focusOpacity(NaN)).toBe(0);
    expect(focusOpacity(Infinity)).toBe(0);
  });
});

describe('viewAngleDeg', () => {
  const cam = v(0, 0, 0);
  const forward = v(0, 0, -1); // three.js cameras look down -Z

  it('is zero for a body straight ahead', () => {
    expect(viewAngleDeg(cam, forward, v(0, 0, -50))).toBeCloseTo(0, 6);
  });

  it('is 90 degrees for a body square to the side', () => {
    expect(viewAngleDeg(cam, forward, v(50, 0, 0))).toBeCloseTo(90, 6);
  });

  it('exceeds 90 degrees for a body behind the camera, so no behind-check is needed', () => {
    expect(viewAngleDeg(cam, forward, v(0, 0, 50))).toBeCloseTo(180, 6);
    expect(focusOpacity(viewAngleDeg(cam, forward, v(0, 0, 50)))).toBe(0);
  });

  it('is independent of distance -- only direction matters', () => {
    const near = viewAngleDeg(cam, forward, v(5, 0, -50));
    const far = viewAngleDeg(cam, forward, v(50, 0, -500));
    expect(near).toBeCloseTo(far, 6);
  });

  it('handles a body exactly at the camera without returning NaN', () => {
    expect(viewAngleDeg(cam, forward, v(0, 0, 0))).toBe(0);
  });

  it('never returns NaN from float error at the extremes', () => {
    // A dot product landing fractionally outside [-1,1] would make acos NaN.
    for (const t of [v(0, 0, -1e-9), v(0, 0, 1e9), v(1e-9, 0, -1e9)]) {
      expect(Number.isNaN(viewAngleDeg(cam, forward, t))).toBe(false);
    }
  });
});

describe('occludedBySphere', () => {
  const globe = v(0, 0, 0);
  const R = 2.5;
  const cam = v(0, 0, 10);

  it('hides a body directly behind the globe', () => {
    expect(occludedBySphere(cam, v(0, 0, -46), globe, R)).toBe(true);
  });

  it('shows a body in front of the globe', () => {
    expect(occludedBySphere(cam, v(0, 0, 20), globe, R)).toBe(false);
  });

  it('shows a body off to the side, whose ray misses the globe entirely', () => {
    expect(occludedBySphere(cam, v(46, 0, 0), globe, R)).toBe(false);
    expect(occludedBySphere(cam, v(0, 46, 0), globe, R)).toBe(false);
  });

  it('draws the limb where the silhouette actually falls, not at the radius', () => {
    // Worth pinning because the intuition is wrong: from a camera only 10
    // units out, a 2.5-radius globe hides far more than a 2.5-wide strip of
    // a body 46 units behind it. Solving the ray/sphere tangent for this
    // geometry puts the silhouette edge at ~14.5 units of offset, so:
    expect(occludedBySphere(cam, v(10, 0, -46), globe, R)).toBe(true);   // inside
    expect(occludedBySphere(cam, v(20, 0, -46), globe, R)).toBe(false);  // outside
  });

  it('does not treat a sphere behind the camera as an occluder', () => {
    // Camera between body and globe, looking away from the globe.
    expect(occludedBySphere(v(0, 0, 10), v(0, 0, 50), globe, R)).toBe(false);
  });

  it('reports no occlusion when the camera is inside the sphere', () => {
    expect(occludedBySphere(v(0, 0, 0), v(0, 0, 46), globe, R)).toBe(false);
    expect(occludedBySphere(v(1, 0, 0), v(0, 0, 46), globe, R)).toBe(false);
  });

  it('handles a body at the camera position without dividing by zero', () => {
    expect(occludedBySphere(cam, cam.clone(), globe, R)).toBe(false);
  });

  it('does not hide a body that sits between the camera and the globe', () => {
    // The near intersection is beyond the body, so nothing is in the way.
    expect(occludedBySphere(cam, v(0, 0, 8), globe, R)).toBe(false);
  });
});
