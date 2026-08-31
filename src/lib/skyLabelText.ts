import { ORB, separationDeg, type AspectBody, type Sky } from '@/lib/astrology';
import { compassPoint, type HorizonPos } from '@/lib/skyLocal';

/**
 * What a gaze label says (docs/CITY_SCENE_PLAN.md §7.5).
 *
 * Shared by both scenes, because a body must not describe itself one way
 * over the globe and another over Athens -- the same reason §0.4 keeps one
 * `Sky` snapshot. Only the position line differs, and it differs because the
 * two scenes genuinely know different things about where a body is: the city
 * has a horizon to measure against, the globe does not.
 *
 * Pure text, so the wording is testable without a renderer -- R3F scene
 * components are not unit-tested in this repo (see vitest.config.ts), which
 * is why every decision worth asserting lives in src/lib.
 */

export const GLYPH: Record<AspectBody, string> = {
  Sun: '☉', Moon: '☾', Mercury: '☿', Venus: '♀',
  Mars: '♂', Jupiter: '♃', Saturn: '♄',
};

const ALL_BODIES = Object.keys(GLYPH) as AspectBody[];

/**
 * The nearest other body inside this one's own orb, as `☌ ♄ 1.3°`.
 *
 * Reads the same snapshot and the same orbs the aspect maths uses
 * (astrology.ts's ORB), so a conjunction the label announces is exactly the
 * one tinting the body's aura -- no second opinion about what counts as
 * close. Zero new maths, per §7.5.
 *
 * The Sun neither donates nor receives colour (docs/ASPECTS_PLAN.md §1.4),
 * so it announces nothing and is never announced.
 */
export function conjunctionNote(sky: Sky, body: AspectBody): string | null {
  if (body === 'Sun') return null;

  let nearest: AspectBody | null = null;
  let nearestSep = Infinity;
  for (const other of ALL_BODIES) {
    if (other === body || other === 'Sun') continue;
    const sep = separationDeg(sky, body, other);
    if (sep < nearestSep) { nearestSep = sep; nearest = other; }
  }

  if (!nearest || nearestSep > ORB[body]) return null;
  return `☌ ${GLYPH[nearest]} ${nearestSep.toFixed(1)}°`;
}

/** Where a body stands over the city: `24° ESE`. Altitude to the whole
 *  degree -- a tenth of a degree is below what anyone can read off a sky. */
export function horizonNote(horizon: HorizonPos): string {
  return `${Math.round(horizon.altitude)}° ${compassPoint(horizon.azimuth)}`;
}

/**
 * The second line of a body's label: what is notable about it right now.
 *
 * Pass `horizon` in the city scene and the line opens with where the body
 * stands; omit it on the world map, where there is no single observer to
 * measure an altitude from. Everything after that is common to both.
 *
 * Returns null when there is nothing to add, which the label renders as no
 * second line at all rather than as an empty one.
 */
export function labelDetail(
  sky: Sky,
  body: AspectBody,
  horizon?: HorizonPos | null,
): string | null {
  const parts: string[] = [];

  if (horizon) parts.push(horizonNote(horizon));
  if (body === 'Mercury' && sky.mercuryRetrograde) parts.push('RETROGRADE');

  const conjunction = conjunctionNote(sky, body);
  if (conjunction) parts.push(conjunction);

  if (body === 'Moon') parts.push(`${Math.round(sky.moonPhaseFraction * 100)}% LIT`);

  return parts.length ? parts.join('  ·  ') : null;
}
