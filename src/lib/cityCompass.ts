import { horizonToScene } from '@/lib/citySkyGeometry';

/**
 * The compass on the horizon (docs/CITY_SCENE_PLAN.md §5.1).
 *
 * Eight marks standing where their directions actually are, so turning on
 * the spot tells you which way you are facing. Deliberately the 8-point set
 * and never the 16-point one: NNE and ESE are three letters of clutter on a
 * horizon, and the extra precision is not something anyone reads off a
 * skyline. The 16-point `compassPoint()` in skyLocal.ts stays as it is; that
 * one is a numeric readout inside a gaze label, where precision earns its
 * place.
 *
 * The quarter points are spelled out -- NORTH, EAST, SOUTH, WEST -- and the
 * ordinals between them abbreviated. That is the hierarchy you actually
 * navigate by, said in the typography rather than only in the styling.
 *
 * A mark appears only while you are LOOKING at it, on exactly the same
 * focus-angle rule as the gaze labels (lib/gazeFocus.ts): the horizon is not
 * a legend, and eight permanent captions around the sky is noise. Sharing
 * `focusOpacity` rather than having a second opinion about it means the two
 * families of text fade identically.
 *
 * Pure, so the placements are assertable without a renderer
 * (vitest.config.ts: R3F scene components are not unit-tested).
 */

/** Index i sits at azimuth i * 45 degrees, N = 0, going clockwise through
 *  east -- the same convention HorizonPos.azimuth uses. */
export const COMPASS_MARKS = [
  'NORTH', 'NE', 'EAST', 'SE', 'SOUTH', 'SW', 'WEST', 'NW',
] as const;

export type CompassMark = (typeof COMPASS_MARKS)[number];

/** Lifted just off the horizon line. At exactly 0 the letters straddle the
 *  join between sea and sky and are hard to read against either; a couple of
 *  degrees clears them without their ceasing to read as "on the horizon". */
export const COMPASS_ALTITUDE_DEG = 2;

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
