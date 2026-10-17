// The conjunction glow in the city's sky (docs/ASPECTS_PLAN.md), the same
// effect the globe draws: a body near another picks up that body's colour
// in a soft aura around it, wider and stronger the tighter they are. Pure,
// so how an aspect turns into a sprite's size and opacity is tested.
//
// The proportions follow the globe's (WorldMap.tsx): opacity rises with
// the aspect's strength at the same gain, and the aura widens with its
// influence by the same ratio the globe's planets use (base 3, growth 4).
// Only the ceiling is lower: the city's halos are faint (HALO_OPACITY
// 0.22), and a full-opacity aura over them would outshine the body.

/** The globe's AURA_GAIN: strength -> opacity. */
const AURA_GAIN = 6;
/** The globe's planet aura growth over its base, 4 / 3. */
const AURA_GROWTH_RATIO = 4 / 3;
/** Brightest a city aura gets. */
export const CITY_AURA_MAX_OPACITY = 0.5;

export interface CityAura {
  /** Sprite width, in the same units as the body's own size. */
  scale: number;
  /** 0 when no conjunction is working on the body: nothing is drawn. */
  opacity: number;
}

/**
 * The aura around a body of drawn size `size` whose normal halo is
 * `haloSize` times wider, for an aspect of this `strength` and `influence`
 * (lib/astrology.ts computeAspects).
 */
export function cityAura(
  size: number,
  haloSize: number,
  aspect: { strength: number; influence: number },
): CityAura {
  const scale = size * haloSize * (1 + AURA_GROWTH_RATIO * aspect.influence);
  const opacity = Math.min(CITY_AURA_MAX_OPACITY, aspect.strength * AURA_GAIN * CITY_AURA_MAX_OPACITY);
  return { scale, opacity: Math.max(0, opacity) };
}
