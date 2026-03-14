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
  /** If true, this marker launches the Gremlin fight instead of a city hub */
  isGremlin?: boolean;
  /** If true, clicking this marker navigates directly to the vault page */
  isVault?: boolean;
  /** If true, clicking this marker navigates directly to the leaderboards page */
  isLeaderboard?: boolean;
  /** If true, clicking this marker navigates directly to the rules page */
  isRules?: boolean;
}

/**
 * COORDINATE SYSTEM NOTE — read this before adding new cities.
 *
 * The globe texture is offset from standard geographic coordinates.
 * Do NOT use real-world longitude values directly; use the calibrated
 * values below as reference points when placing new markers:
 *
 *   Athens, Greece        → lat: 37.9838,  lng: -25   (real-world lng ≈ 23.7°E)
 *   Gremlin's Lair (central Germany) → lat: 48.5, lng: -5  (real-world lng ≈ 10°E)
 *   The Vault (South Pole) → lat: -90, lng: 0  (no longitude correction needed at the pole)
 *
 * Rule of thumb: subtract roughly 48–49 degrees from the real-world longitude
 * to get the correct visual placement on this globe.
 * Example: real 23.7°E → use -25  (23.7 - 48.7 ≈ -25)
 *          real 10°E   → use -5   (10 - ~15 offset... use the reference cities to interpolate)
 *
 * Latitude values match real-world values without adjustment.
 */
export const CITIES: City[] = [
  { id: 3, name: "Athens", country: "Greece", lat: 37.9838, lng: -25, color: "#fa0202", tag: "Marble Columns" },
  { id: 8, name: "Leaderboards", country: "Norway", lat: 59.9139, lng: -4, color: "#de340d", tag: "Viking Fjords", isLeaderboard: true },
  { id: 13, name: "Rules", country: "North Pole", lat: 90, lng: 0, color: "#ffffff", tag: "The Rules", isRules: true },
  { id: 11, name: "Gremlin's Lair", country: "Black Forest", lat: 48.5, lng: -5, color: "#22c55e", tag: "Dark Forest", isGremlin: true },
  { id: 12, name: "The Vault", country: "South Pole", lat: -90, lng: 0, color: "#FFD700", tag: "The Vault", isVault: true },
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
