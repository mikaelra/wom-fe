/**
 * Where the city's buildings stand (docs/CITY_SCENE_PLAN.md §5.1–5.2).
 *
 * Plain constants in a pure module rather than in CityScene.tsx, so the one
 * thing that must never silently break can be asserted in a test: the
 * building on the left is the one the signpost's LEFT arm points at. Get
 * that backwards and the scene still renders perfectly, the hover
 * highlighting still pairs up, and every player is sent to the wrong fight.
 * R3F scene components are not unit-tested here (vitest.config.ts), which is
 * exactly why this does not live next to the JSX.
 *
 * Scene compass, from lib/citySkyGeometry.ts: **-Z is north, +X is east**,
 * and the default camera looks down -Z. So "in front of the viewer" is
 * negative Z, and -X is the viewer's left.
 *
 * ## The temple is not a building, it is a backdrop
 *
 * **[corrected]** LobbyScene.tsx has said since it was written that
 * temple.glb's "origin sits on one of its corner columns rather than its
 * center", and CityScene repeated it. Measured from the GLB's own accessor
 * bounds, that is **wrong**: the model's visual centre sits within 0.15
 * units of its origin. It is centred.
 *
 * What actually makes it hard to place is its SIZE. temple.glb is
 * **35.7 wide, 18.5 tall and 63.2 deep**. The Senate placeholder is 8.4 by
 * 5.0. They are not peers and cannot be posed as a matching pair: at its old
 * position the temple's footprint swallowed the signpost and the viewer
 * stood inside its bounding box. Treat it as scenery that happens to be
 * clickable, and give it the room a thing that size needs.
 *
 * Its base sits ~8 units below its origin, i.e. below the sea plane, so only
 * the upper ~8.5 units show. That is deliberate and is what keeps a 63-unit
 * building from filling the sky.
 */

/**
 * Height of the water plane everything stands on.
 *
 * Shared with LobbyScene so the two scenes agree on world scale. Note the
 * consequence: buildings and the signpost are pitched at y = 0 and rise
 * THROUGH this plane, so their lowest two units are under water. Anything
 * short enough to drown at y = 0 -- the campfire -- has to be placed on the
 * surface instead.
 */
export const SEA_LEVEL = 2;

/** Half-extents of temple.glb at scale 1, measured from the GLB. Kept here
 *  because every future placement decision needs them and reading them off
 *  the model again is a half-hour nobody should spend twice. */
export const TEMPLE_EXTENT = { x: 17.8, y: 9.3, z: 31.6 } as const;

/**
 * Temple (left) -> Bossfight. Senate (right) -> Ranked (§1.1).
 *
 * The temple is pushed left and further out than the Senate: it is four
 * times the Senate's width and twelve times its depth, so at a matching
 * distance it dominates the scene and crowds the signpost between them.
 *
 * How far out is a judgement call that has been made by eye twice; the
 * bearing has stayed put and only the distance has grown. Scaling the whole
 * vector by 1.33 from [-22, -26] keeps the direction identical and moves the
 * building back from 34.1 units to 45.3.
 *
 * The framing cost of that is worth writing down, because it is not
 * symmetric across devices. A 70 degree vertical FOV in portrait is only
 * about **17.9 degrees** of horizontal half-angle, against ~51 on a 16:9
 * desktop, and because the model is 35.6 wide, moving its centre out mostly
 * slides its bulk out of frame. Measured from the viewer, right edge at
 * x + 17.8:
 *
 *   [-15, -22]  dist 26.6  centre 34.3 deg left, right edge 7.3 deg PAST centre
 *   [-22, -26]  dist 34.1  centre 40.2 deg left, right edge  9.2 deg left
 *   [-29.3, -34.6] dist 45.3  centre 40.2 deg left, right edge 18.4 deg left  <- here
 *
 * So on a desktop it sits comfortably in the default view, and on a phone
 * held upright its edge sits right on the frame boundary -- a turn of a few
 * degrees left brings it in. That is the intended trade: it is scenery
 * across the bay, not a doorway.
 */
export const TEMPLE_POSITION: [number, number, number] = [-29.3, 0, -34.6];
export const SENATE_POSITION: [number, number, number] = [15, 0, -22];

/** Between them and nearer the viewer, so it is read first. */
export const SIGNPOST_POSITION: [number, number, number] = [0, 0, -11];

/**
 * The campfire, between the viewer and the signpost.
 *
 * Its y is the SEA LEVEL rather than 0: the buildings are pitched at y = 0
 * and rise through a water plane at y = 2, but a fire has to sit on the
 * visible surface or it drowns -- the whole thing is barely a unit and a
 * half tall.
 *
 * Close enough to the post to light its arms (3 units), far enough forward
 * that its light falls on the faces you read rather than their backs.
 */
export const CAMPFIRE_POSITION: [number, number, number] = [0, SEA_LEVEL, -8];

/** Distance from the viewer, who stands at the origin in x/z. */
export function groundDistance(position: readonly [number, number, number]): number {
  return Math.hypot(position[0], position[2]);
}
