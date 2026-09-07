// Shared 3D scene layout for home and lobby
export const TABLE_POSITION: [number, number, number] = [0, 2.55, 0];
export const SCENE_CENTER: [number, number, number] = [0, 3.2, 0];

export const MAX_PLAYERS = 24;
const BASE_PLAYER_RADIUS = 2.1;
export const PLAYER_Y = 3.2;

/**
 * Where the temple's origin stands in a lobby, and where the floor you
 * actually walk on ends up.
 *
 * PLAYER_Y is NOT that floor. A player model's origin sits at its MIDDLE,
 * not under its feet -- frog_green_v1.glb runs from y -0.949 to 0.953 about
 * its own origin -- so a building whose floor is built up to PLAYER_Y cuts
 * every player off at the waist. The temple never showed this because its
 * floor is nowhere near PLAYER_Y: the slab players stand on (Cube.002 in
 * temple.glb) has its top face at local y -1.58, so standing the model at
 * TEMPLE_LOBBY_Y puts that floor at 2.42, a little under the players' feet
 * at 2.251. Everything else in the lobby was authored against that number
 * -- the well sits on it at TABLE_POSITION's 2.55, and the well's splash
 * and glow effects are pinned at 2.4 and 2.3.
 *
 * Any other building staged in a lobby has to put its floor here too, or
 * the ground moves under the players when the building changes. Derived
 * rather than copied so that moving the temple moves the floor with it.
 */
export const TEMPLE_LOBBY_Y = 4;
/** Top face of temple.glb's floor slab, in the model's own coordinates. */
export const TEMPLE_FLOOR_LOCAL_Y = -1.58;
export const LOBBY_FLOOR_Y = TEMPLE_LOBBY_Y + TEMPLE_FLOOR_LOCAL_Y;

// Hades' seat sits this much higher than a regular player's -- composition
// for its much larger model (PlayerAvatars.tsx scales the boss 1.44x vs a
// frog's 0.6x). Exported (not just inlined into getBossPosition below) so
// anything anchoring to the boss's ground level specifically -- rather than
// its seat position -- can subtract it back out; LobbyScene's attack-target
// selection glow does exactly that, otherwise it renders floating partway
// up Hades' body instead of at its feet, level with a frog's.
export const BOSS_Y_LIFT = 0.65;

// Radius grows by 15% for every 6 players: 1–6 → base, 7–12 → +15%, 13–18 → +30%, etc.
// Exported so the lobby camera can back off by the same factor as the seat
// circle grows -- otherwise a full table stays framed the same as a table of
// 4, and players on the far side fall out of view.
export function radiusGrowthFactor(count: number): number {
  return 1 + Math.floor((count - 1) / 6) * 0.15;
}

function playerRadius(count: number): number {
  return BASE_PLAYER_RADIUS * radiusGrowthFactor(count);
}

// Returns `count` seats evenly distributed around The Well.
// Slot 0 is at the near-camera side (z+), proceeding clockwise.
// Call this with the live player count so spacing is always even.
export function getPlayerPositions(count: number): { position: [number, number, number]; rotation: [number, number, number] }[] {
  const radius = playerRadius(count);
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return {
      position: [
        radius * Math.sin(angle),
        PLAYER_Y,
        radius * Math.cos(angle),
      ] as [number, number, number],
      // LobbyScene adds another Math.PI/2 at render time, so storing angle + Math.PI/2
      // here produces a final rotation of angle + Math.PI — facing inward toward center.
      rotation: [0, angle + Math.PI / 2, 0] as [number, number, number],
    };
  });
}

// Boss fight layout: Hades is fixed on the far side (z-), facing the players.
export function getBossPosition(): { position: [number, number, number]; rotation: [number, number, number] } {
  const angle = Math.PI; // far side (z-)
  return {
    position: [
      BASE_PLAYER_RADIUS * Math.sin(angle),
      PLAYER_Y + BOSS_Y_LIFT,
      BASE_PLAYER_RADIUS * Math.cos(angle),
    ] as [number, number, number],
    rotation: [0, angle + Math.PI / 2, 0] as [number, number, number],
  };
}

// Returns `count` seats spread evenly across the near half of The Well (z+ side).
// Players are centered so adding new ones doesn't move Hades.
export function getBossPlayerPositions(count: number): { position: [number, number, number]; rotation: [number, number, number] }[] {
  return Array.from({ length: count }, (_, i) => {
    // Distribute across -π/2 … +π/2 with equal spacing, centered
    const angle = count === 1 ? 0 : -Math.PI / 2 + (Math.PI * (i + 0.5)) / count;
    return {
      position: [
        BASE_PLAYER_RADIUS * Math.sin(angle),
        PLAYER_Y,
        BASE_PLAYER_RADIUS * Math.cos(angle),
      ] as [number, number, number],
      rotation: [0, angle + Math.PI / 2, 0] as [number, number, number],
    };
  });
}

/**
 * Spectators: a ring above the players (docs/CITY_SCENE_PLAN.md is not the
 * home for this -- it is lobby furniture).
 *
 * Where the ring starts is anchored to Hades' seat, a quarter turn away from
 * it, and runs from there around the Well toward the players. Hades sits at
 * a FIXED far-side angle (getBossPosition, theta = PI) whether or not a boss
 * is actually in the lobby, so the anchor is well defined in an ordinary PvP
 * lobby too -- there is simply no model standing on it.
 *
 * Sweeping toward the players (decreasing theta, since the players centre on
 * theta = 0 nearest the camera) is what puts the watchers behind and above
 * the people playing rather than behind Hades where nobody would see them.
 *
 * Spacing is a fixed step so two spectators stand together near the start
 * rather than being flung to opposite ends of an arc, and only compresses
 * once there are enough of them to need the whole circle.
 */
export const SPECTATOR_Y_LIFT = 1.15;
/** Slightly outside the players' ring, so a spectator is never exactly
 *  overhead and read as part of the player below them. */
export const SPECTATOR_RADIUS_FACTOR = 1.22;
/** Comfortable gap between watchers, in radians. */
export const SPECTATOR_ARC_STEP = Math.PI / 8;

export function getSpectatorPositions(
  count: number,
  playerCount: number,
): { position: [number, number, number]; rotation: [number, number, number] }[] {
  const radius = BASE_PLAYER_RADIUS * radiusGrowthFactor(Math.max(playerCount, count)) * SPECTATOR_RADIUS_FACTOR;
  // A quarter turn from Hades' fixed far-side seat.
  const start = Math.PI / 2;
  const step = Math.min(SPECTATOR_ARC_STEP, (Math.PI * 2) / Math.max(count, 1));

  return Array.from({ length: count }, (_, i) => {
    const angle = start - i * step;
    return {
      position: [
        radius * Math.sin(angle),
        PLAYER_Y + SPECTATOR_Y_LIFT,
        radius * Math.cos(angle),
      ] as [number, number, number],
      rotation: [0, angle + Math.PI / 2, 0] as [number, number, number],
    };
  });
}

/**
 * Where a spectator's own camera sits: just over their model's LEFT shoulder.
 *
 * A watcher arriving in a lobby used to get the same establishing view as
 * everyone else, which told them nothing about who they were. Putting the
 * camera on their own ghost's shoulder does two things at once -- it says
 * "this one is you" without a label, and it frames the table the way that
 * figure is already facing.
 *
 * "Left shoulder" is the model's own left, not the screen's: the figure
 * faces the Well, so its left is the world-up cross its facing direction.
 * Get that backwards and the camera lands on the right shoulder, which
 * looks deliberate and is wrong.
 */
export const SPECTATOR_CAM_BACK = 0.75;
export const SPECTATOR_CAM_SIDE = 0.42;
export const SPECTATOR_CAM_LIFT = 0.8;

export function getSpectatorCameraPosition(
  index: number,
  count: number,
  playerCount: number,
): [number, number, number] {
  const seats = getSpectatorPositions(count, playerCount);
  const seat = seats[Math.max(0, Math.min(index, seats.length - 1))];
  if (!seat) return getCameraTargetPosition(1920, 1080);

  const [sx, sy, sz] = seat.position;
  // Facing: from the seat in toward the Well, flattened to the ground plane.
  const len = Math.hypot(SCENE_CENTER[0] - sx, SCENE_CENTER[2] - sz) || 1;
  const fx = (SCENE_CENTER[0] - sx) / len;
  const fz = (SCENE_CENTER[2] - sz) / len;
  // left = worldUp x facing
  const lx = fz;
  const lz = -fx;

  return [
    sx - fx * SPECTATOR_CAM_BACK + lx * SPECTATOR_CAM_SIDE,
    sy + SPECTATOR_CAM_LIFT,
    sz - fz * SPECTATOR_CAM_BACK + lz * SPECTATOR_CAM_SIDE,
  ];
}

// Position "in front of" each seat (further from table) for choice labels.
export const CHOICE_LABEL_OFFSET = 0.6;
export function getPlayerFrontPositions(count: number): [number, number, number][] {
  const radius = playerRadius(count);
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return [
      (radius + CHOICE_LABEL_OFFSET) * Math.sin(angle),
      PLAYER_Y,
      (radius + CHOICE_LABEL_OFFSET) * Math.cos(angle),
    ] as [number, number, number];
  });
}

export const BASE_FOV = 75;

// Initial horizontal orbit of the lobby camera. Rotating the start angle ~30°
// opens up empty space on the player's left where the welcome-tour bubbles sit.
// Flip the sign to turn the other way; the bubble placement follows this value.
export const INITIAL_CAMERA_YAW = -Math.PI / 6;

export function getResponsiveFov(width: number, height: number): number {
  const aspect = width / height;
  // Portrait (phones) widened 75 -> 80: with a full or near-full table of
  // players, the seat circle was running off the sides of a narrow frame.
  return aspect > 1.5 ? 82 : aspect > 1 ? 78 : 80;
}
// `radiusFactor` scales both distance and elevation by however much the seat
// circle itself has grown (see radiusGrowthFactor) -- pass 1 (the default)
// wherever the seat radius never grows, e.g. boss fights.
export function getCameraTargetPosition(width: number, height: number, radiusFactor: number = 1): [number, number, number] {
  const aspect = width / height;
  // Portrait's base distance/elevation (4.03/2.88) weren't backed off enough
  // once a lobby fills up on a phone -- widened alongside the fov bump above.
  const dist = (aspect > 1.5 ? 3.68 : 4.9) * radiusFactor;
  const elevation = (aspect > 1 ? 2.53 : 3.3) * radiusFactor;
  return [0, SCENE_CENTER[1] + elevation, dist];
}

/** How far the standard lobby camera sits from the point it looks at. */
export function standardCameraDistance(width: number, height: number, radiusFactor: number = 1): number {
  const [x, y, z] = getCameraTargetPosition(width, height, radiusFactor);
  return Math.hypot(x - SCENE_CENTER[0], y - SCENE_CENTER[1], z - SCENE_CENTER[2]);
}

/**
 * Push a fixed camera pose straight out along its own line of sight until it
 * stands the same distance from the Well as the standard lobby camera does.
 *
 * The spectator shoulder-cam (getSpectatorCameraPosition) is built by
 * offsetting from a seat, which put it noticeably closer in than the view
 * every other player gets -- close enough to feel like a different scene.
 * Scaling the arm rather than rebuilding the pose keeps the framing exactly
 * as it was, over the watcher's own left shoulder, at the same angle above
 * and behind them; only the distance changes.
 *
 * Because it reads the live canvas size, a spectator also gets the same
 * portrait/landscape backing-off as everyone else.
 */
export function atStandardCameraDistance(
  pose: [number, number, number],
  width: number,
  height: number,
  radiusFactor: number = 1,
): [number, number, number] {
  const ax = pose[0] - SCENE_CENTER[0];
  const ay = pose[1] - SCENE_CENTER[1];
  const az = pose[2] - SCENE_CENTER[2];
  const len = Math.hypot(ax, ay, az);
  // A pose sitting exactly on the look-at point has no line of sight to push
  // along; fall back to the ordinary view rather than dividing by zero.
  if (len === 0) return getCameraTargetPosition(width, height, radiusFactor);
  const scale = standardCameraDistance(width, height, radiusFactor) / len;
  return [
    SCENE_CENTER[0] + ax * scale,
    SCENE_CENTER[1] + ay * scale,
    SCENE_CENTER[2] + az * scale,
  ];
}
