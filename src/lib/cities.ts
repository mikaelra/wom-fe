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
  { id: 1, name: "Mecca", country: "Saudi Arabia", lat: 21.4225, lng: 39.8262, color: "#f59e0b", tag: "Desert Sands" },
  { id: 2, name: "Jerusalem", country: "Israel", lat: 31.7683, lng: 35.2137, color: "#d97706", tag: "Ancient Gates" },
  { id: 3, name: "Athens", country: "Greece", lat: 37.9838, lng: 23.7275, color: "#3b82f6", tag: "Marble Columns" },
  { id: 4, name: "Varanasi", country: "India", lat: 25.3176, lng: 83.0068, color: "#f97316", tag: "River Ghats" },
  { id: 5, name: "Xi'an", country: "China", lat: 34.3416, lng: 108.9398, color: "#ef4444", tag: "Terracotta" },
  { id: 6, name: "Uluru", country: "Australia", lat: -25.3444, lng: 131.0369, color: "#dc2626", tag: "Sacred Rock" },
  { id: 7, name: "Cusco", country: "Peru", lat: -13.532, lng: -71.9675, color: "#a3e635", tag: "Incan Ruins" },
  { id: 8, name: "Oslo", country: "Norway", lat: 59.9139, lng: 10.7522, color: "#38bdf8", tag: "Viking Fjords" },
  { id: 9, name: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503, color: "#ec4899", tag: "Shinto Gates" },
  { id: 10, name: "House of Hades", country: "Underworld", lat: 36.0, lng: 25.0, color: "#8b5cf6", tag: "Ghostly Flames" },
  { id: 11, name: "Gremlin's Lair", country: "Black Forest", lat: 48.0, lng: 8.2, color: "#22c55e", tag: "Dark Forest", isGremlin: true },
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
