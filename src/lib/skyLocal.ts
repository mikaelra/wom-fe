/**
 * Topocentric sky over one place on Earth (docs/CITY_SCENE_PLAN.md §6).
 *
 * Turns the shared, geocentric `Sky` snapshot from `lib/astrology.ts` into
 * what an observer standing in a specific city actually sees: each body's
 * altitude and azimuth above their horizon, and how dark it is there right
 * now. Pure maths, no React and no R3F, so it is node-testable the same way
 * `astrology.ts` is.
 *
 * The `Sky` snapshot stays the single source of truth for position
 * (docs/ASPECTS_PLAN.md §0). This module rotates those very vectors into a
 * local horizon frame rather than recomputing positions from the ephemeris,
 * so the city scene and the world map cannot disagree about where a planet
 * is -- they are the same vectors, one of which has passed through a matrix.
 */
import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import { ASTRO_BODY, type AspectBody, type Sky } from '@/lib/astrology';

/** Athens, GENUINE geographic coordinates.
 *
 *  NOT the values in `lib/cities.ts`, which are deliberately mirrored
 *  (`system_lng = -1.3 - real_lng`) to land the marker correctly on an
 *  east/west-flipped globe texture. Feeding that mirrored longitude (-25)
 *  to an Observer does not throw -- it silently yields a plausible-looking
 *  sky for the wrong place, putting sunset 3.25 hours out and mirroring
 *  every arc. `skyLocal.test.ts` pins this so the swap fails loudly. */
export const ATHENS = { realLat: 37.9838, realLng: 23.7275 } as const;

export interface LocalFrame {
  observer: Astronomy.Observer;
  time: Astronomy.AstroTime;
  /** J2000 equatorial -> local horizontal. See `horizonFromSnapshot`. */
  rot: Astronomy.RotationMatrix;
}

export interface HorizonPos {
  /** Degrees above the horizon; negative means below it. */
  altitude: number;
  /** Degrees clockwise from north: N=0, E=90, S=180, W=270. */
  azimuth: number;
}

/**
 * Build the rotation from the snapshot's frame into `realLat`/`realLng`'s
 * horizon, at the snapshot's own instant.
 *
 * Deliberately takes bare coordinates rather than a `City`: a `City` carries
 * both a real and a mirrored longitude, and a function that accepts one can
 * be handed the wrong field. This signature makes that mistake unspellable.
 */
export function localFrame(sky: Sky, realLat: number, realLng: number): LocalFrame {
  const observer = new Astronomy.Observer(realLat, realLng, 0);
  const time = new Astronomy.AstroTime(sky.date);
  // Rotation_EQJ_HOR, not _EQD_: astrology.ts builds the snapshot with
  // Astronomy.Equator(..., ofdate=false, ...), i.e. J2000 (EQJ), not
  // equator-of-date. The EQJ matrix folds precession in itself, so this is
  // exact rather than ~0.36 deg of accumulated precession out.
  const rot = Astronomy.Rotation_EQJ_HOR(time, observer);
  return { observer, time, rot };
}

/** astrology.ts's `raDecToVec3` lays vectors out Three.js-style, Y-up:
 *    three.x =  astro.x     three.y = astro.z     three.z = -astro.y
 *  astronomy-engine's equatorial vectors are Z-up (Z toward the celestial
 *  pole), so they have to be unswizzled before its matrices apply. */
/** astronomy-engine treats any falsy refraction option as "no correction"
 *  (`else if (!refraction)` in astronomy.js) but types the parameter as a
 *  required `string`. '' is the falsy value that satisfies both.
 *
 *  Deliberately no refraction anywhere in this module: it would apply to the
 *  recomputed path but not to a rotated snapshot vector, so switching it on
 *  would make the two paths disagree near the horizon by more than the
 *  parallax this module is careful about. Geometric altitude is also what an
 *  ephemeris cross-check expects. A renderer wanting the "sitting on the
 *  horizon" look can add it at the point of use.  */
const NO_REFRACTION = '';

function toAstroVector(v: THREE.Vector3, time: Astronomy.AstroTime): Astronomy.Vector {
  return new Astronomy.Vector(v.x, -v.z, v.y, time);
}

/**
 * Rotate the body's SHARED snapshot vector into the local horizon.
 *
 * This is the invariant-preserving path: exact to ~0.002 deg against a
 * from-scratch topocentric computation for the Sun and every planet
 * (verified in the tests). The Moon is the one exception -- the snapshot is
 * geocentric, and the Moon is close enough for an observer's offset from
 * Earth's centre to matter, measured at ~0.48 deg. Use `horizonOf` unless
 * you specifically want the snapshot's own answer.
 */
export function horizonFromSnapshot(sky: Sky, body: AspectBody, frame: LocalFrame): HorizonPos {
  const rotated = Astronomy.RotateVector(frame.rot, toAstroVector(sky.dir[body], frame.time));
  const sph = Astronomy.HorizonFromVector(rotated, NO_REFRACTION);
  return { altitude: sph.lat, azimuth: sph.lon };
}

/**
 * Recompute the body's position for this observer, including the parallax
 * of standing on Earth's surface rather than at its centre.
 *
 * Only meaningfully different from `horizonFromSnapshot` for the Moon.
 */
export function horizonTopocentric(body: AspectBody, frame: LocalFrame): HorizonPos {
  const eq = Astronomy.Equator(ASTRO_BODY[body], frame.time, frame.observer, true, true);
  const h = Astronomy.Horizon(frame.time, frame.observer, eq.ra, eq.dec, NO_REFRACTION);
  return { altitude: h.altitude, azimuth: h.azimuth };
}

/** Bodies near enough that an observer's offset from Earth's centre shifts
 *  where they appear by more than rendering tolerance. Just the Moon. */
const PARALLAX_SENSITIVE: ReadonlySet<AspectBody> = new Set<AspectBody>(['Moon']);

/**
 * Where a body appears from this place -- the one to render with.
 *
 * Planets take the snapshot path, so their placement is provably the same
 * data the globe draws. The Moon takes the topocentric path, because half a
 * degree is plainly visible when it sits on the horizon. That split is safe
 * for the aspect maths: 0.48 deg is far inside the Moon's 10 deg orb
 * (docs/ASPECTS_PLAN.md §2.1), so it can never flip a conjunction verdict --
 * and aspects read the snapshot directly anyway, never this function.
 */
export function horizonOf(sky: Sky, body: AspectBody, frame: LocalFrame): HorizonPos {
  return PARALLAX_SENSITIVE.has(body)
    ? horizonTopocentric(body, frame)
    : horizonFromSnapshot(sky, body, frame);
}

export function isAboveHorizon(pos: HorizonPos): boolean {
  return pos.altitude > 0;
}

// ── Darkness ──────────────────────────────────────────────────────────────

export type TwilightBand = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night';

/** Sun altitude, in degrees, at each band's dark edge. */
export const TWILIGHT = { day: 0, civil: -6, nautical: -12, astronomical: -18 } as const;

export function twilightBand(sunAltitudeDeg: number): TwilightBand {
  if (sunAltitudeDeg > TWILIGHT.day) return 'day';
  if (sunAltitudeDeg > TWILIGHT.civil) return 'civil';
  if (sunAltitudeDeg > TWILIGHT.nautical) return 'nautical';
  if (sunAltitudeDeg > TWILIGHT.astronomical) return 'astronomical';
  return 'night';
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How dark it is, 0 (full day) to 1 (fully dark), from the Sun's altitude.
 *
 * One continuous scalar rather than five discrete states on purpose: sky
 * gradient, star opacity, ambient light and the buildings' rim lighting all
 * read from this, and switching between bands would pop visibly at each
 * boundary. Smoothstepped across the whole 0 to -18 deg span, so the bands
 * above stay useful for *labelling* what is happening without any renderer
 * having to branch on them.
 */
export function nightness(sunAltitudeDeg: number): number {
  return smoothstep(TWILIGHT.day, TWILIGHT.astronomical, sunAltitudeDeg);
}

/** The Sun's altitude right now, at this place. */
export function sunAltitude(sky: Sky, frame: LocalFrame): number {
  return horizonFromSnapshot(sky, 'Sun', frame).altitude;
}

// ── Rise and set ──────────────────────────────────────────────────────────

export interface SunEvents {
  /** null in the polar cases where the Sun does not cross the horizon. */
  sunrise: Date | null;
  sunset: Date | null;
}

/** Next sunrise and sunset at or after the frame's instant. */
export function sunEvents(frame: LocalFrame, searchDays = 2): SunEvents {
  const at = frame.time.date;
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, frame.observer, +1, at, searchDays);
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Sun, frame.observer, -1, at, searchDays);
  return { sunrise: rise ? rise.date : null, sunset: set ? set.date : null };
}

// ── Labelling ─────────────────────────────────────────────────────────────

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'] as const;

/** 16-point compass name for an azimuth, for gaze labels (§7.5). */
export function compassPoint(azimuthDeg: number): string {
  const norm = ((azimuthDeg % 360) + 360) % 360;
  return COMPASS[Math.round(norm / 22.5) % 16];
}
