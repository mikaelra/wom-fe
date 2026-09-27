// The merchants (docs/MERCHANT_PLAN.md). Everything here is pure and
// node-testable, no React/THREE -- src/components/worldmap/MerchantMarker.tsx
// is the only caller that turns this into a scene position.
import { CITIES } from '@/lib/cities';

/** FNV-1a, 32-bit. Deterministic and cheap -- there is no need for
 * cryptographic properties here, only "the same string always gives the
 * same number, spread roughly evenly." */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Where the ??? sits on the globe for a given trigger period.
 *
 * Seeded by `period_start` (the backend's /merchant/offer field) rather
 * than randomised client-side: every player must see the same marker in
 * the same place, and a page refresh must not relocate it mid-moon. Hashing
 * the period's own identity gives both for free, with no coordinates
 * stored anywhere.
 *
 * Latitude is clamped to ±60° -- the poles are unusable label space (the
 * globe's own city markers avoid them too), so the full 32-bit hash range
 * is remapped into a band that's always somewhere sensible to stand a
 * marker and read a "???" label beside it.
 */
export function merchantMarkerLatLng(periodStartIso: string): { lat: number; lng: number } {
  const h = hashString(periodStartIso);
  // Two independent-enough sub-ranges of the same 32-bit hash, rather than
  // hashing twice -- one pass is enough entropy for two coarse coordinates.
  const latBits = h & 0xffff;
  const lngBits = (h >>> 16) & 0xffff;
  const lat = (latBits / 0xffff) * 120 - 60; // [-60, 60]
  const lng = (lngBits / 0xffff) * 360 - 180; // [-180, 180]
  return { lat, lng };
}

/**
 * Where a merchant's marker sits: seeded by its period, plus its event key
 * when it has one. Two conjunctions under one revert share a period_start
 * and would otherwise seed the same spot; the full moon's key is "" and
 * seeds exactly as before.
 */
export function merchantEventLatLng(periodStartIso: string, eventKey: string): { lat: number; lng: number } {
  return merchantMarkerLatLng(eventKey ? `${periodStartIso}|${eventKey}` : periodStartIso);
}

/** How far apart, in degrees of arc, a merchant's marker must stand from a
 *  city's and from every other merchant's -- enough that the labels never
 *  sit on top of each other at the globe's usual zoom. */
export const MARKER_MIN_SEPARATION_DEG = 25;

/** Great-circle distance between two lat/lng points, degrees. */
export function arcDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const cos =
    Math.sin(a.lat * rad) * Math.sin(b.lat * rad) +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((a.lng - b.lng) * rad);
  return Math.acos(Math.max(-1, Math.min(1, cos))) / rad;
}

// Re-rolls before giving up on a clear spot. The band a marker can land in
// is so much larger than the circles it must avoid that this is never
// reached in practice; it only bounds the loop.
const MAX_PLACEMENT_TRIES = 64;

/**
 * Every merchant's marker, placed so none sits on a city or on another
 * merchant.
 *
 * Each starts at its own seeded spot (merchantEventLatLng); one that lands
 * within MARKER_MIN_SEPARATION_DEG of a city or an already-placed merchant
 * re-rolls with a counter on its seed until it is clear. Still
 * deterministic -- same merchants in the same order, same spots for every
 * player -- because the offers arrive in the backend's fixed order and
 * the re-rolls are seeded too.
 */
export function placeMerchantMarkers(
  merchants: readonly { period_start: string; event_key: string }[],
  avoid: readonly { lat: number; lng: number }[] = CITIES,
): { lat: number; lng: number }[] {
  const placed: { lat: number; lng: number }[] = [];
  for (const m of merchants) {
    const base = m.event_key ? `${m.period_start}|${m.event_key}` : m.period_start;
    let spot = merchantMarkerLatLng(base);
    for (let i = 1; i < MAX_PLACEMENT_TRIES; i++) {
      const clear = [...avoid, ...placed].every((p) => arcDegrees(p, spot) >= MARKER_MIN_SEPARATION_DEG);
      if (clear) break;
      spot = merchantMarkerLatLng(`${base}#${i}`);
    }
    placed.push(spot);
  }
  return placed;
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

/** The marker's label: "Merchant" -- the merchant's name without
 *  its article, short enough to float over the globe. */
export function merchantMarkerLabel(merchantName: string): string {
  return merchantName.replace(/^The\s+/i, '');
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
