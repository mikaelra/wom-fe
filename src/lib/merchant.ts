// The merchants (docs/MERCHANT_PLAN.md). Everything here is pure and
// node-testable, no React/THREE -- src/components/worldmap/MerchantMarker.tsx
// is the only caller that turns this into a scene position.

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
 * and would otherwise stand on the same spot; the full moon's key is ""
 * and seeds exactly as before, so its marker has not moved.
 */
export function merchantEventLatLng(periodStartIso: string, eventKey: string): { lat: number; lng: number } {
  return merchantMarkerLatLng(eventKey ? `${periodStartIso}|${eventKey}` : periodStartIso);
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

// Below this a blend is too dark to read against the globe's night side
// (Mars + Jupiter averages to a maroon); above it, it washes toward white.
const MIN_LIGHTNESS = 0.6;
const MAX_LIGHTNESS = 0.72;

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

/**
 * The blend of two planets' colours -- a conjunction's colour, used for
 * its merchant's marker text and light and wherever the conjunction is
 * named. An even mix of the two, then its lightness pulled into a
 * readable band: the raw average of a warm and a cool planet is dark and
 * muddy, and this has to read as text on a night-side globe. Hue and
 * saturation are the mix's own, so it is still recognisably both planets.
 */
export function blendPlanetColors(a: string, b: string): string {
  const ca = PLANET_COLOR[a];
  const cb = PLANET_COLOR[b];
  if (ca === undefined || cb === undefined) return FULL_MOON_MERCHANT_COLOR;
  const ch = (c: number, shift: number) => ((c >> shift) & 0xff) / 255;
  const mix = (shift: number) => (ch(ca, shift) + ch(cb, shift)) / 2;
  const [h, s, l] = rgbToHsl(mix(16), mix(8), mix(0));
  return toHex(...hslToRgb(h, s, Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l))));
}

/** The colour an event's merchant is drawn in. */
export function merchantEventColor(event: MerchantEvent | null | undefined): string {
  if (event?.kind === 'conjunction' && event.bodies.length === 2) {
    return blendPlanetColors(event.bodies[0], event.bodies[1]);
  }
  return FULL_MOON_MERCHANT_COLOR;
}

/** "Full moon in Aries", "Conjunction between Mercury and Jupiter in Libra"
 *  -- how the revert popup and the merchant's scene name an event. */
export function describeMerchantEvent(event: MerchantEvent): string {
  if (event.kind === 'full_moon') return `Full moon in ${event.sign}`;
  if (event.kind === 'conjunction' && event.bodies.length === 2) {
    return `Conjunction between ${event.bodies[0]} and ${event.bodies[1]} in ${event.sign}`;
  }
  return event.sign ? `${event.kind} in ${event.sign}` : event.kind;
}

/** The line under a merchant's name in his scene: "Appears at the full
 *  moon in Aries", "Appears at the conjunction of Mars and Jupiter in Leo". */
export function merchantArrivalLine(event: MerchantEvent): string {
  if (event.kind === 'full_moon') return `Appears at the full moon in ${event.sign}`;
  if (event.kind === 'conjunction' && event.bodies.length === 2) {
    return `Appears at the conjunction of ${event.bodies[0]} and ${event.bodies[1]} in ${event.sign}`;
  }
  return `Appears at ${describeMerchantEvent(event)}`;
}

/** The marker's label: "Merchant", "Scribe" -- the merchant's name without
 *  its article, short enough to float over the globe. */
export function merchantMarkerLabel(merchantName: string): string {
  return merchantName.replace(/^The\s+/i, '');
}
