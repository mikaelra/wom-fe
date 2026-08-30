import { horizonToScene } from '@/lib/citySkyGeometry';

/**
 * The compass on the horizon (docs/CITY_SCENE_PLAN.md §5.1).
 *
 * Eight marks standing where their directions actually are, so turning on
 * the spot tells you which way you are facing. Deliberately the 8-point set
 * -- N, NE, E, SE, S, SW, W, NW -- and never the 16-point one: NNE and ESE
 * are three letters of clutter on a horizon, and the extra precision is not
 * something anyone reads off a skyline. The 16-point `compassPoint()` in
 * skyLocal.ts stays as it is; that one is a numeric readout inside a gaze
 * label, where the precision earns its place.
 *
 * Pure, so the placements and the in-frame test are assertable without a
 * renderer (vitest.config.ts: R3F scene components are not unit-tested).
 */

/** Index i sits at azimuth i * 45 degrees, N = 0, going clockwise through
 *  east -- the same convention HorizonPos.azimuth uses. */
export const COMPASS_MARKS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export type CompassMark = (typeof COMPASS_MARKS)[number];

/** Lifted just off the horizon line. At exactly 0 the letters straddle the
 *  join between sea and sky and are hard to read against either; a couple of
 *  degrees clears them without their ceasing to read as "on the horizon". */
export const COMPASS_ALTITUDE_DEG = 2;

/** How many degrees before the edge of frame a mark starts fading. Without
 *  it a mark pops in and out as you pan, which reads as a glitch. */
export const COMPASS_FADE_DEG = 7;

export interface CompassPlacement {
  label: CompassMark;
  azimuth: number;
  /** True for N/E/S/W. The quarter marks are the ones you navigate by, so
   *  they are drawn a little stronger than the ordinals between them. */
  cardinal: boolean;
  position: [number, number, number];
}

export function compassPlacements(
  eye: readonly [number, number, number],
  radius: number,
): CompassPlacement[] {
  return COMPASS_MARKS.map((label, i) => {
    const azimuth = i * 45;
    return {
      label,
      azimuth,
      cardinal: i % 2 === 0,
      position: horizonToScene({ altitude: COMPASS_ALTITUDE_DEG, azimuth }, radius, eye),
    };
  });
}

/**
 * Half the camera's HORIZONTAL field of view, in degrees.
 *
 * Three stores the vertical FOV and widens it by the aspect ratio, so the
 * horizontal half-angle is what decides whether something to your left is on
 * screen. The difference is not academic: a 70 degree vertical FOV is about
 * 51 degrees of horizontal half-angle on a 16:9 desktop and only about 18 on
 * a phone held upright, so a mark that is comfortably in frame on one is
 * well off the edge of the other.
 */
export function horizontalHalfFovDeg(verticalFovDeg: number, aspect: number): number {
  const halfV = (verticalFovDeg * Math.PI) / 360;
  return (Math.atan(Math.tan(halfV) * aspect) * 180) / Math.PI;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge1 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Opacity for a mark sitting `angleDeg` off the view axis: visible while it
 * is in frame, faded out by the time it leaves.
 *
 * Measured as an angle rather than a screen position for the same reason
 * §7.1 gives for the gaze labels -- it is independent of viewport size and
 * pixel density, so the behaviour is identical on a phone and a desktop even
 * though the frame edge sits at a very different angle on each.
 */
export function edgeOpacity(
  angleDeg: number,
  halfFovDeg: number,
  fadeDeg: number = COMPASS_FADE_DEG,
): number {
  if (!Number.isFinite(angleDeg)) return 0;
  return 1 - smoothstep(Math.max(0, halfFovDeg - fadeDeg), halfFovDeg, angleDeg);
}
