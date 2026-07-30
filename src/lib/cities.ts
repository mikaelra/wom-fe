// City definitions matching the 10 sacred cities in Supabase.
// Latitude / longitude converted to spherical coordinates on a unit globe.

export interface City {
  id: number;
  name: string;
  country: string;
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lng: number;
  /** Colour used for the marker glow */
  color: string;
  /** Short thematic label */
  tag: string;
  /** If true, clicking this marker navigates directly to the vault page */
  isVault?: boolean;
  /** If true, clicking this marker navigates directly to the rules page */
  isRules?: boolean;
  /** Sword marker impact glow theme (sprite/ring/point-light colour) — defaults to blue. */
  swordColor?: 'blue' | 'red';
}

/**
 * COORDINATE SYSTEM NOTE — read this before adding new cities.
 *
 * The globe texture is MIRRORED (east/west flipped) relative to standard
 * geographic longitude, not just rotationally offset — a simple "subtract a
 * constant" rule only happens to fit at a single calibration point, then
 * diverges everywhere else (verified: it placed New York's marker over
 * China). The relationship, solved from Athens (the one confirmed-correct
 * marker):
 *
 *   system_lng = -1.3 - real_lng
 *
 * Do NOT use real-world longitude values directly — negate them and shift
 * by -1.3. Reference points:
 *
 *   Athens, Greece → lat: 37.9838, lng: -25   (real-world ≈ 23.7°E)
 *   New York, USA  → lat: 40.7128, lng: 72.7  (real-world ≈ 74.0°W)
 *   The poles      → lng: 0  (longitude is meaningless there — every lng
 *                     value collapses to the same point at lat ±90, so the
 *                     poles cannot calibrate or confirm the longitude
 *                     mapping either way, only the latitude one below)
 *
 * Latitude values match real-world values without adjustment.
 */
export const CITIES: City[] = [
  { id: 3, name: "Athens", country: "Greece", lat: 37.9838, lng: -25, color: "#fa0202", tag: "Marble Columns" },
  { id: 4, name: "New York", country: "USA", lat: 40.7128, lng: 72.7, color: "#ff3333", tag: "Ranked Arena", swordColor: "red" },
  // { id: 13, name: "Rules", country: "North Pole", lat: 90, lng: 0, color: "#ffffff", tag: "The Rules", isRules: true },
  // { id: 12, name: "The Vault", country: "South Pole", lat: -90, lng: 0, color: "#FFD700", tag: "The Vault", isVault: true },
];

/**
 * Convert lat/lng degrees to a Vec3 on a sphere of given radius.
 *
 * Calibrated for Three.js IcosahedronGeometry (PolyhedronGeometry base),
 * whose UV seam sits on the +X axis:
 *   u = atan2(-z, -x) / (2π) + 0.5
 * So lng=0 (prime meridian, u=0.5) → -X axis,
 *    lng=±180 (date line, u=0/1) → +X axis.
 */
export function latLngToVec3(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180); // colatitude
  const lngRad = lng * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(lngRad);
  const y = radius * Math.cos(phi);
  const z = -radius * Math.sin(phi) * Math.sin(lngRad);
  return [x, y, z];
}
