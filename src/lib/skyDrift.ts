// How the globe's sky turns (docs/MERCHANT_PLAN.md).
//
// The globe stays put and everything else -- stars, planets, their lights
// and the camera -- turns around it by one small step a frame, which is
// how the scene shows the Earth turning. `angle` is how far WorldMap's
// PlanetSprites group has turned so far, written by it every frame, so
// anything that must stand under a body in that sky (a merchant marker
// under the Moon) reads it rather than keeping its own count.
//
// `boost` speeds the step up: a timewarp (lib/timewarpFx.ts) spins the
// whole sky -- and so, to the eye, the globe -- by raising it, and every
// consumer reads skyStep() so they all stay in step.
export const skyDrift = { angle: 0, boost: 0 };

/** The sky's normal turn per frame, radians. */
export const BASE_SKY_STEP = -0.0002;

/** This frame's turn: the normal step, sped up by any boost. */
export function skyStep(): number {
  return BASE_SKY_STEP * (1 + skyDrift.boost);
}
