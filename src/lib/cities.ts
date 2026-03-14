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
}

export const CITIES: City[] = [
  { id: 3, name: "Athens", country: "Greece", lat: 37.9838, lng: 23.7275, color: "#3b82f6", tag: "Marble Columns" },
  { id: 11, name: "Gremlin's Lair", country: "Black Forest", lat: 48.5, lng: 9.5, color: "#22c55e", tag: "Dark Forest", isGremlin: true },
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
