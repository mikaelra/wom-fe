// The Merchant encounter (docs/MERCHANT_PLAN.md). Everything here is pure
// and node-testable, no React/THREE -- src/components/worldmap/MerchantMarker.tsx
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
