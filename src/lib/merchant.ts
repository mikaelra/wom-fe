// The merchants (docs/MERCHANT_PLAN.md). Everything here is pure and
// node-testable, no React/THREE -- src/components/worldmap/MerchantMarker.tsx
// is the only caller that turns this into a scene position.

type Vec3 = readonly [number, number, number];

/**
 * The sky bodies a merchant stands under on the globe: the Moon for the
 * full moon's, the two planets for a conjunction's. Anything else (an
 * event from a backend that predates events) stands under the Moon.
 */
export function merchantSkyBodies(event: MerchantEvent | null | undefined): string[] {
  if (event?.kind === 'conjunction' && event.bodies.length === 2) return [...event.bodies];
  return ['Moon'];
}

/** The direction between several unit directions -- a conjunction's two
 *  planets -- normalised. The sum of nearly-equal directions, so it never
 *  cancels out for bodies that are in fact near each other. */
export function meanDirection(dirs: readonly Vec3[]): [number, number, number] {
  const s = dirs.reduce<[number, number, number]>((a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]], [0, 0, 0]);
  const len = Math.hypot(s[0], s[1], s[2]) || 1;
  return [s[0] / len, s[1] / len, s[2] / len];
}

/**
 * A sky direction brought into the globe's own frame: the sky group has
 * turned by `skyAngle` about Y and the globe group by `globeAngle`, so a
 * point on the globe's surface under that body sits at the direction
 * turned by (skyAngle - globeAngle). Same convention as THREE's
 * rotation.y: x' = x cos + z sin, z' = -x sin + z cos.
 */
export function skyToGlobeLocal(dir: Vec3, skyAngle: number, globeAngle: number): [number, number, number] {
  const a = skyAngle - globeAngle;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [dir[0] * c + dir[2] * s, dir[1], -dir[0] * s + dir[2] * c];
}

/** A merchant-summoning sky event, as /merchant/offer and
 *  /merchant/sky_events describe it. */
export interface MerchantEvent {
  kind: string;
  key: string;
  bodies: string[];
  sign: string;
  at: string;
}

/** The relics that can be sacrificed to turn back time -- what each
 *  merchant sells (wom-be domain/merchant.py REVERT_RELIC_NAMES). */
export const REVERT_RELIC_NAMES: ReadonlySet<string> = new Set(['Stone of Vitality', 'Paper']);

/** The full-moon Merchant's colour -- the purple his marker always had. */
export const FULL_MOON_MERCHANT_COLOR = '#a855f7';

// The planets' identity colours (astrology.ts BASE_COLOR), duplicated
// rather than imported: astrology.ts pulls in THREE and astronomy-engine,
// and this module stays pure. merchant.test.ts pins the two tables equal.
export const PLANET_COLOR: Record<string, number> = {
  Mercury: 0xDB9504,
  Venus: 0xAB9D00,
  Mars: 0xFF0000,
  Jupiter: 0x008296,
  Saturn: 0xA16300,
};

/** Mean radius, km -- which of two conjunct planets is the bigger. */
export const PLANET_RADIUS_KM: Record<string, number> = {
  Mercury: 2440,
  Venus: 6052,
  Mars: 3390,
  Jupiter: 69911,
  Saturn: 58232,
};

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * A merchant marker's colours on the globe. A conjunction's text is the
 * bigger planet's colour inside and the other's outside (its outline and
 * glow), and its light is the bigger planet's. The full moon's stays
 * purple with the dark outline it always had (`outline` null).
 */
export function merchantMarkerColors(
  event: MerchantEvent | null | undefined,
): { fill: string; outline: string | null } {
  if (event?.kind === 'conjunction' && event.bodies.length === 2) {
    const [a, b] = event.bodies;
    if (PLANET_COLOR[a] !== undefined && PLANET_COLOR[b] !== undefined) {
      const [big, other] = (PLANET_RADIUS_KM[b] ?? 0) > (PLANET_RADIUS_KM[a] ?? 0) ? [b, a] : [a, b];
      return { fill: hex(PLANET_COLOR[big]), outline: hex(PLANET_COLOR[other]) };
    }
  }
  return { fill: FULL_MOON_MERCHANT_COLOR, outline: null };
}

/** A conjunction's colour in the Timewarp popup. */
export const CONJUNCTION_COLOR = '#fb923c';

/**
 * What the Timewarp popup lists for one copy's instant: just the kinds of
 * event live then -- "Full moon" in the Merchant's purple, "Conjunction"
 * in orange -- each once, full moon first, whatever the planets or signs.
 */
export function timewarpEventLabels(events: readonly MerchantEvent[]): { text: string; color: string }[] {
  const labels: { text: string; color: string }[] = [];
  if (events.some((e) => e.kind === 'full_moon')) labels.push({ text: 'Full moon', color: FULL_MOON_MERCHANT_COLOR });
  if (events.some((e) => e.kind === 'conjunction')) labels.push({ text: 'Conjunction', color: CONJUNCTION_COLOR });
  return labels;
}

/** The line under the merchant's name in his scene -- by what summons
 *  him, never the particular event: "Appears around the full moon",
 *  "Appears around conjunctions". */
export function merchantArrivalLine(triggerKind: string): string {
  return triggerKind === 'conjunction' ? 'Appears around conjunctions' : 'Appears around the full moon';
}

/** Which model stands behind the counter: the Merchant at the full moon,
 *  the Lady Merchant at a conjunction. */
export function merchantModelFor(triggerKind: string): 'merchant_v1' | 'lady_merchant_v1' {
  return triggerKind === 'conjunction' ? 'lady_merchant_v1' : 'merchant_v1';
}

/** Every merchant's marker on the globe says just this. His name -- John
 *  Dee, Hildegard von Bingen (wom-be merchant_offers) -- is for when you
 *  click it, at the top of his scene. */
export const MERCHANT_MARKER_LABEL = 'Merchant';

/** What the merchant says in his scene when a timewarp brought him: John
 *  Dee at the full moon, Hildegard von Bingen at a conjunction. Word for
 *  word as given. */
export const MERCHANT_QUOTES: Readonly<Record<'full_moon' | 'conjunction', readonly string[]>> = {
  full_moon: [
    'The All is Mind',
    'the heavenly realm can be reached through great effort',
    "did you know that i'm the great-great-great-father of science?",
    'i wish kelly would stop saying he can make gold',
    'angel magic is best magic',
    'elizabeth is just the best',
    "money or knowledge? i just know that i'm in severe debt after all these books i've bought...",
  ],
  conjunction: [
    'love is the water which waters the soul of your body',
    'there is the music of heaven in all things',
    'all thing carries The Word',
  ],
};

/** One of the merchant's quotes, at random -- `random` for tests. */
export function merchantQuote(triggerKind: string, random: () => number = Math.random): string {
  const quotes = MERCHANT_QUOTES[triggerKind === 'conjunction' ? 'conjunction' : 'full_moon'];
  return quotes[Math.min(quotes.length - 1, Math.floor(random() * quotes.length))];
}

/**
 * How far a sphere's surface falls below the tangent plane at a point,
 * `dist` along that plane from it -- what bends a merchant marker's flat
 * rim of light onto the globe instead of letting its edges float off it.
 */
export function sphereDrop(sphereRadius: number, dist: number): number {
  const d = Math.min(Math.abs(dist), sphereRadius);
  return sphereRadius - Math.sqrt(sphereRadius * sphereRadius - d * d);
}
