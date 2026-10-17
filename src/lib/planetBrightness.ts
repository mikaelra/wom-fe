/**
 * How bright a planet is, and when it emerges from the twilight
 * (docs/CITY_SCENE_PLAN.md §6.4).
 *
 * The city used to hide every planet until `nightness` passed 0.35 -- the
 * Sun about 7 degrees below the horizon -- and show them all at once when it
 * did. That is wrong at both ends. Venus at magnitude -4 is the evening
 * star: it is out while the sky is still orange, which is exactly when it
 * was being hidden. Saturn at +0.8 has no business appearing at the same
 * instant Venus does.
 *
 * So emergence is a function of the body's REAL apparent magnitude, which
 * `Astronomy.Illumination` already computes for the very instant being
 * drawn -- it changes as a planet nears or recedes, and for Venus it swings
 * by more than a magnitude across its cycle. Same principle as the rest of
 * §6: the sky is a function of the ephemeris rather than of constants.
 *
 * Pure, so the ordering can be asserted without a renderer.
 */

/** Brighter than this and the body is simply always visible when it is up:
 *  the Sun, and the Moon, which is plainly there in the afternoon. */
export const ALWAYS_VISIBLE_MAG = -6;

/** Nothing waits for darker than astronomical twilight. */
const LATEST_EMERGENCE_DEG = -10;

/** Fade either side of the emergence altitude, in degrees of Sun altitude. */
const EMERGENCE_FADE_DEG = 1.5;

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The Sun altitude at which a body of this magnitude becomes visible.
 *
 * Returns a number that is compared against the Sun's own altitude, so a
 * larger (less negative) value means "appears earlier in the evening".
 * Venus lands essentially at sunset, Saturn several degrees later, which is
 * the order they actually appear in.
 */
export function emergenceAltitudeDeg(magnitude: number): number {
  if (magnitude <= ALWAYS_VISIBLE_MAG) return 90;
  return Math.max(LATEST_EMERGENCE_DEG, Math.min(0, -(magnitude + 4)));
}

/**
 * 0 to 1: how far out of the twilight a body of this magnitude is, given
 * where the Sun is.
 *
 * Note it does NOT consider the body's own altitude -- that is the caller's
 * business (below the horizon is behind the Earth, and nothing to do with
 * brightness).
 */
export function twilightVisibility(sunAltitudeDeg: number, magnitude: number): number {
  const emergence = emergenceAltitudeDeg(magnitude);
  if (emergence >= 90) return 1;
  // Visibility rises as the Sun falls, hence the reversed edges.
  return smoothstep(emergence + EMERGENCE_FADE_DEG, emergence - EMERGENCE_FADE_DEG, sunAltitudeDeg);
}

/**
 * How much of the raw enlargement below is actually applied.
 *
 * The first pass at this was too strong on screen -- Venus came out nearly
 * three times its old size. This pulls every body half way back toward the
 * size it was drawn at before magnitude entered into it, which keeps the
 * ordering (brighter is bigger) while taking the shout out of it. One
 * number, so the next adjustment is one number.
 */
export const SIZE_EMPHASIS = 0.5;

/**
 * Size multiplier from magnitude, around a reference of magnitude 0.
 *
 * Deliberately gentle and clamped rather than the true brightness ratio: the
 * flux between Venus and Saturn is a factor of 100, and a Venus a hundred
 * times the area of Saturn would be a moon. This keeps the *ordering*
 * honest -- brighter really is bigger -- at a size the scene can hold.
 */
export function magnitudeSizeFactor(magnitude: number): number {
  const full = Math.max(0.75, Math.min(2.2, 1 + 0.2 * -magnitude));
  return 1 + (full - 1) * SIZE_EMPHASIS;
}
