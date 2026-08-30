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
 * The quarter points are spelled out -- EAST, SOUTH, WEST -- and the
 * ordinals between them abbreviated. That is the hierarchy you actually
 * navigate by, said in the typography rather than only in the styling.
 *
 * NORTH is absent, and that is not an oversight: the signpost stands due
 * north of the viewer (SIGNPOST_POSITION is straight down -Z), so a north
 * mark sat permanently on top of the one object in the scene that most needs
 * to be read. The direction is hardly lost -- it is the one the signpost
 * itself is standing in, and the two marks either side of it still bracket
 * it.
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

export interface CompassMarkDef {
  label: string;
  /** Degrees clockwise from north, matching HorizonPos.azimuth. */
  azimuth: number;
  /** The quarter points, drawn a little stronger than the ordinals. */
  cardinal: boolean;
}

/**
 * What is drawn, with each mark carrying its own azimuth rather than
 * deriving it from an array index -- so a mark can be dropped (as NORTH has
 * been) without silently rotating every mark after it.
 */
export const COMPASS_MARKS: readonly CompassMarkDef[] = [
  { label: 'NE', azimuth: 45, cardinal: false },
  { label: 'EAST', azimuth: 90, cardinal: true },
  { label: 'SE', azimuth: 135, cardinal: false },
  { label: 'SOUTH', azimuth: 180, cardinal: true },
  { label: 'SW', azimuth: 225, cardinal: false },
  { label: 'WEST', azimuth: 270, cardinal: true },
  { label: 'NW', azimuth: 315, cardinal: false },
];

/** Lifted just off the horizon line. At exactly 0 the letters straddle the
 *  join between sea and sky and are hard to read against either; a couple of
 *  degrees clears them without their ceasing to read as "on the horizon". */
export const COMPASS_ALTITUDE_DEG = 2;

export interface CompassPlacement extends CompassMarkDef {
  position: [number, number, number];
}

export function compassPlacements(
  eye: readonly [number, number, number],
  radius: number,
): CompassPlacement[] {
  return COMPASS_MARKS.map((mark) => ({
    ...mark,
    position: horizonToScene(
      { altitude: COMPASS_ALTITUDE_DEG, azimuth: mark.azimuth },
      radius,
      eye,
    ),
  }));
}
