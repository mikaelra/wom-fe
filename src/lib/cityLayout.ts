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

/**
 * The ground the city stands on.
 *
 * Only a little above the water: this is a low limestone island, and every
 * extra unit buries more of the buildings, whose models each start at their
 * own y = 0. `lib/cityTerrain.ts` builds the surface from this.
 */
export const LAND_LEVEL = SEA_LEVEL + 0.6;

/** Eye height above the ground the viewer stands on. */
export const EYE_HEIGHT = 3.2;

/**
 * How far below its own origin temple.glb's base sits, measured from the GLB
 * (its bounding box runs y -8.07 to 10.45). Needed to stand it ON something:
 * placing its origin at ground level would bury eight units of it.
 */
export const TEMPLE_BASE_DROP = 8.07;

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
export const TEMPLE_POSITION: [number, number, number] = [-29.3, LAND_LEVEL + TEMPLE_BASE_DROP, -34.6];
export const SENATE_POSITION: [number, number, number] = [15, LAND_LEVEL, -22];

/**
 * The bot-ranked Senate (docs/MY_AI.md §9.1) -- a second civic hall touching
 * the first at a corner, its own arm of the ranked fork. Offset diagonally
 * back-and-right from SENATE_POSITION by roughly one building width, so the
 * two read as an L that shares a corner rather than two separate doorways.
 * PROVISIONAL placement -- Mikael's visual pass owns the final pose and the
 * real /modelling building.
 */
export const SENATE_BOT_POSITION: [number, number, number] = [22.5, LAND_LEVEL, -29.5];

/** Between the temple and the Senate and nearer the viewer, so it is read
 *  first. */
export const SIGNPOST_POSITION: [number, number, number] = [0, LAND_LEVEL, -11];

/**
 * Market (right arm) -> the trading post (wom-be docs/MARKET_PLAN.md §3.2).
 *
 * The doc fixes only the bearing: **south-east, the back-right quadrant**
 * relative to the default camera. The scene compass has -Z north and +X
 * east and the camera looks north, so "back" is +Z and "right" is +X --
 * this sits behind the viewer's right shoulder, reached by turning the
 * orbit camera around. The **south-west / back-left** quadrant (-X, +Z) is
 * left deliberately clear: §3.2 reserves it for a later building.
 *
 * Distance and exact offset are by eye, matching the Senate's ~26-unit
 * remove rather than the temple's far backdrop -- it is a doorway you walk
 * to, not scenery across the bay.
 */
export const MARKET_POSITION: [number, number, number] = [17, LAND_LEVEL, 13];

/**
 * The campfire, between the viewer and the signpost.
 *
 * Close enough to the post to light its arms (3 units), far enough forward
 * that its light falls on the faces you read rather than their backs.
 */
export const CAMPFIRE_POSITION: [number, number, number] = [0, LAND_LEVEL, -8];

/** Distance from the viewer, who stands at the origin in x/z. */
export function groundDistance(position: readonly [number, number, number]): number {
  return Math.hypot(position[0], position[2]);
}

/**
 * The signpost that forks the ranked ladder: PLAYERS (the human ladder) vs
 * BOTS (your trained AI's -- docs/MY_AI.md §4).
 *
 * ## Placement
 *
 * It belongs in the notch of the L the two Senates make, but the exact
 * midpoint of their origins put it *inside* the merged colonnade -- the
 * guided camera came to rest nose-to-a-column and the arms speared through
 * marble. So it is pushed out of that notch, along its own readable face, to
 * stand on the open ground in front of both halls (RANKED_FORK_STANDOFF).
 *
 * ## The quarter-turn
 *
 * The two Senate origins lie on a clean NE/SW diagonal -- the offset between
 * them is [+7.5, -7.5], exactly 45 degrees. Turning the post a quarter-turn
 * sets its arms along that diagonal (PLAYERS down-left toward the original
 * Senate, BOTS up-right toward the bot-ranked hall) and, once it is
 * pushed out onto the open ground, presents a flat face to the guided camera
 * that is canted against the colonnade behind it rather than square to it.
 *
 * You never see it on entry: the city signpost's primary RANKED arm guides
 * the camera to RANKED_FORK_VIEW_PIN, and this post's own BACK arm guides it
 * home to the city signpost.
 */
export const RANKED_FORK_SIGNPOST_ROTATION_Y = Math.PI / 4;

/** Outward normal of the post's readable face after the turn, as [x, z]: the
 *  way the labels look, and the side the guided camera watches from. */
const RANKED_FORK_FACE: readonly [number, number] = [
  Math.sin(RANKED_FORK_SIGNPOST_ROTATION_Y),
  Math.cos(RANKED_FORK_SIGNPOST_ROTATION_Y),
];

/** How far the post is pushed out of the Senates' shared-corner notch, along
 *  its readable face, to clear the colonnade and stand on open ground. */
export const RANKED_FORK_STANDOFF = 6;

export const RANKED_FORK_SIGNPOST_POSITION: [number, number, number] = [
  (SENATE_POSITION[0] + SENATE_BOT_POSITION[0]) / 2 + RANKED_FORK_FACE[0] * RANKED_FORK_STANDOFF,
  LAND_LEVEL,
  (SENATE_POSITION[2] + SENATE_BOT_POSITION[2]) / 2 + RANKED_FORK_FACE[1] * RANKED_FORK_STANDOFF,
];

/**
 * How far in front of the fork signpost the guided camera comes to rest --
 * equal to the city signpost's own distance from the viewer on entry, so the
 * fork lands on screen *exactly* as the city signpost does when the scene
 * opens: same distance, same eye height, sign dead ahead.
 */
export const RANKED_FORK_VIEW_DISTANCE = groundDistance(SIGNPOST_POSITION);

/**
 * Where the pinned camera sits while you read the fork: out along the post's
 * readable face by RANKED_FORK_VIEW_DISTANCE, at eye height, looking level
 * back at the sign. The scene's entry pose over the city signpost, carried
 * to the fork and turned with it.
 */
export const RANKED_FORK_VIEW_PIN: [number, number, number] = [
  RANKED_FORK_SIGNPOST_POSITION[0] + RANKED_FORK_FACE[0] * RANKED_FORK_VIEW_DISTANCE,
  LAND_LEVEL + EYE_HEIGHT,
  RANKED_FORK_SIGNPOST_POSITION[2] + RANKED_FORK_FACE[1] * RANKED_FORK_VIEW_DISTANCE,
];

/**
 * Unit direction from the view pin to where the camera floats -- a hair off
 * the pin, opposite the look. `[0, 0, 1]` (a hair south, looking north) is
 * the city-signpost entry pose; this is that, rotated onto the fork's face.
 * CityScene scales it by the orbit radius.
 */
export const RANKED_FORK_VIEW_OFFSET: readonly [number, number, number] = [
  RANKED_FORK_FACE[0], 0, RANKED_FORK_FACE[1],
];
