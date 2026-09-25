/**
 * Sunlight and moonlight on the water (docs/CITY_SCENE_PLAN.md §6.4).
 *
 * The city's sea used to take its highlight from a directional light parked
 * at a fixed [100, 20, 100] -- inherited from the lobby, where there is no
 * real sun to disagree with. In a scene whose whole premise is "the sky is
 * the real sky over Greece" that produced a bright column sitting wherever
 * the constant happened to point, unrelated to the Sun that was actually
 * setting a few degrees away, and far too strong besides.
 *
 * What replaces it is the real thing: a body above the horizon lays a
 * glitter path on the water along its own azimuth. Two of them -- the Sun
 * and, much fainter, the Moon.
 *
 * Pure maths, so the model is testable without a renderer (vitest.config.ts:
 * R3F scene components are not unit-tested here).
 */

/**
 * How much the water's own slope spreads a reflection, in radians.
 *
 * A dead-flat mirror would reflect a body as a single point. Real water is
 * covered in small slopes, and it is those -- not the body's size -- that
 * smear the reflection into the long "road" you see across a sea at sunset.
 * This is the RMS of that slope distribution, and it is the dominant term:
 * a sensible open-water value is a few hundredths of a radian.
 */
export const SEA_SLOPE_RMS = 0.045;

/** Below this altitude the path fades out rather than switching off, so a
 *  moonrise does not pop a stripe onto the water in one frame. */
export const HORIZON_FADE_DEG = 1.5;

/** Peak brightness added to the water under each body. The Sun's is the one
 *  the eye reads as "bright day"; the Moon's is deliberately a tenth of it,
 *  because moonlight on water is a suggestion, not a spotlight. */
export const SUN_GLITTER_PEAK = 0.40;
export const MOON_GLITTER_PEAK = 0.14;

export interface SeaGlitter {
  /** Unit direction toward the body, scene space. The shader mirrors the
   *  view ray about the water and compares it against this. */
  direction: [number, number, number];
  /** Peak brightness of the path. Zero when nothing should be drawn. */
  strength: number;
  /** Angular half-width of the path, radians -- the Gaussian's sigma. */
  sigma: number;
}

export interface SeaGlitterInput {
  direction: [number, number, number];
  /** Degrees above the horizon. At or below zero there is no reflection,
   *  for the same reason there is no body: it is behind the Earth. */
  altitudeDeg: number;
  /** The body's drawn diameter on the sky dome, and the dome's radius --
   *  the very two numbers that scale its sprite. Tying the path's width to
   *  them is what makes the reflection track the body's size: draw a bigger
   *  Moon and its road across the water widens to match, with no second
   *  constant to remember. */
  bodySize: number;
  skyRadius: number;
  peak: number;
  /** Extra dimming: the Moon's illuminated fraction, so a crescent lays down
   *  far less light than a full Moon. Defaults to 1. */
  brightness?: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The glitter path a single body lays on the water.
 *
 * Note what is deliberately NOT here: any falloff with altitude beyond the
 * horizon fade. A low body does not make a fainter path, it makes a longer
 * one, and that emerges in the shader from Fresnel -- water reflects almost
 * nothing when you look straight down into it and almost everything at a
 * grazing angle. So the long road at sunset and the small hot spot at noon
 * both fall out of the geometry rather than being faked with a curve.
 */
export function seaGlitter(input: SeaGlitterInput): SeaGlitter {
  const { direction, altitudeDeg, bodySize, skyRadius, peak, brightness = 1 } = input;

  // Angular radius of the body as drawn, plus the water's own scatter. Added
  // in quadrature because they are independent spreads of the same
  // reflection, the way variances add.
  const angularRadius = bodySize / 2 / skyRadius;
  const sigma = Math.hypot(angularRadius, SEA_SLOPE_RMS);

  return {
    direction,
    strength: peak * brightness * smoothstep(0, HORIZON_FADE_DEG, altitudeDeg),
    sigma,
  };
}
