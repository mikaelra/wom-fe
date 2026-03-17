/**
 * Real-time sun position and dynamic lighting based on geographic coordinates.
 *
 * Uses a simplified solar position algorithm to compute the sun's elevation
 * and azimuth for any lat/lng, then maps that to scene lighting parameters.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ---------- Solar position math ----------

/** Degrees → radians */
const DEG2RAD = Math.PI / 180;

/**
 * Compute the sun's elevation (altitude) and azimuth in degrees
 * for a given UTC date at the specified latitude/longitude.
 */
export function getSolarPosition(date: Date, lat: number, lng: number) {
  const dayOfYear =
    Math.floor(
      (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
        86_400_000,
    );

  // Solar declination (simplified, no nutation)
  const declination = -23.44 * Math.cos(((360 / 365) * (dayOfYear + 10)) * DEG2RAD);

  // Hour angle: how far the sun is from local solar noon
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const solarNoonOffset = lng / 15; // hours offset from UTC
  const localSolarHour = utcHours + solarNoonOffset;
  const hourAngle = (localSolarHour - 12) * 15; // degrees, 15°/hour

  const latRad = lat * DEG2RAD;
  const decRad = declination * DEG2RAD;
  const haRad = hourAngle * DEG2RAD;

  // Elevation (altitude) angle
  const sinElevation =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinElevation))) / DEG2RAD;

  // Azimuth (compass bearing from north, clockwise)
  const cosAzimuth =
    (Math.sin(decRad) - Math.sin(latRad) * sinElevation) /
    (Math.cos(latRad) * Math.cos(elevation * DEG2RAD));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) / DEG2RAD;
  if (hourAngle > 0) azimuth = 360 - azimuth;

  return { elevation, azimuth };
}

// ---------- Lighting parameters ----------

export interface SunLightingParams {
  /** World-space direction vector for the directional light */
  sunDirection: [number, number, number];
  /** Hex colour for the directional light */
  sunColor: string;
  /** Intensity for the directional light */
  sunIntensity: number;
  /** Intensity for the ambient light */
  ambientIntensity: number;
  /** Hex colour for the ambient light */
  ambientColor: string;
  /** Hex colour for the sky / scene background */
  skyColor: string;
  /** 0 = midnight, 1 = high noon — useful for custom blending */
  dayFactor: number;
}

/** Lerp between two hex colours. t in [0,1]. */
function lerpColor(a: string, b: string, t: number): string {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  ca.lerp(cb, t);
  return `#${ca.getHexString()}`;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Clamp t to [0, 1] and apply smoothstep for nice transitions. */
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Convert solar elevation + azimuth into scene lighting parameters.
 *
 * Elevation ranges:
 *   -90 → deep night
 *   -12 to 0 → twilight (dawn/dusk)
 *   0 to 90 → daytime
 */
export function computeLighting(elevation: number, azimuth: number): SunLightingParams {
  // Normalised elevation factors
  const dayFactor = smoothstep(-6, 20, elevation); // 0 at deep twilight, 1 at ~20° elevation
  const twilightFactor = smoothstep(-12, 0, elevation); // 0 at nautical twilight, 1 at horizon
  const nightFactor = 1 - twilightFactor;

  // Sun direction in scene space (Y = up, azimuth rotates in XZ)
  const azRad = azimuth * DEG2RAD;
  const elRad = Math.max(0, elevation) * DEG2RAD; // clamp below horizon to 0
  const sunY = Math.sin(elRad);
  const sunXZ = Math.cos(elRad);
  // Azimuth: 0=North(+Z), 90=East(+X), 180=South(-Z), 270=West(-X)
  const sunX = sunXZ * Math.sin(azRad);
  const sunZ = sunXZ * Math.cos(azRad);

  // At night, keep sun direction below horizon for shadow consistency
  const effectiveSunY = elevation > 0 ? sunY : 0.05;
  const sunDirection: [number, number, number] = [sunX * 10, effectiveSunY * 10, sunZ * 10];

  // Colour palette
  const NOON_SUN = '#ffffff';
  const DAWN_SUN = '#ff8855';
  const NIGHT_SUN = '#334466';

  const NOON_SKY = '#87ceeb';
  const DAWN_SKY = '#cc5533';
  const NIGHT_SKY = '#0a0a1a';

  const NOON_AMBIENT = '#8899bb';
  const DAWN_AMBIENT = '#553322';
  const NIGHT_AMBIENT = '#111122';

  // Dawn/dusk colour when sun is near horizon (elevation 0-8°)
  const dawnBlend = 1 - smoothstep(0, 10, elevation);

  let sunColor: string;
  let skyColor: string;
  let ambientColor: string;

  if (elevation < -6) {
    // Night
    sunColor = NIGHT_SUN;
    skyColor = NIGHT_SKY;
    ambientColor = NIGHT_AMBIENT;
  } else if (elevation < 0) {
    // Twilight transition
    const t = smoothstep(-6, 0, elevation);
    sunColor = lerpColor(NIGHT_SUN, DAWN_SUN, t);
    skyColor = lerpColor(NIGHT_SKY, DAWN_SKY, t);
    ambientColor = lerpColor(NIGHT_AMBIENT, DAWN_AMBIENT, t);
  } else {
    // Daytime — blend from dawn to noon as elevation increases
    sunColor = lerpColor(DAWN_SUN, NOON_SUN, 1 - dawnBlend);
    skyColor = lerpColor(DAWN_SKY, NOON_SKY, 1 - dawnBlend);
    ambientColor = lerpColor(DAWN_AMBIENT, NOON_AMBIENT, 1 - dawnBlend);
  }

  // Intensities
  const sunIntensity = lerp(0.08, 1.2, dayFactor);
  const ambientIntensity = lerp(0.04, 0.5, dayFactor);

  return {
    sunDirection,
    sunColor,
    sunIntensity,
    ambientIntensity,
    ambientColor,
    skyColor,
    dayFactor,
  };
}

// ---------- React hook ----------

/**
 * React Three Fiber hook that returns live sun-lighting parameters
 * for a given geographic location. Updates once per second for efficiency.
 */
export function useSunLighting(lat: number, lng: number): SunLightingParams {
  const paramsRef = useRef<SunLightingParams>(
    computeLighting(...Object.values(getSolarPosition(new Date(), lat, lng)) as [number, number]),
  );
  const lastUpdateRef = useRef(0);

  // Initialise immediately
  useMemo(() => {
    const { elevation, azimuth } = getSolarPosition(new Date(), lat, lng);
    paramsRef.current = computeLighting(elevation, azimuth);
  }, [lat, lng]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    // Recalculate every 1 second — sun doesn't move that fast
    if (elapsed - lastUpdateRef.current > 1) {
      lastUpdateRef.current = elapsed;
      const { elevation, azimuth } = getSolarPosition(new Date(), lat, lng);
      paramsRef.current = computeLighting(elevation, azimuth);
    }
  });

  return paramsRef.current;
}

// ---------- Globe sun direction ----------

/**
 * Compute a directional light position that illuminates the correct
 * side of the globe based on the real sun's position.
 *
 * Returns a [x, y, z] world-space position for the directional light.
 */
export function getGlobeSunDirection(date: Date): [number, number, number] {
  // The sub-solar point: the spot on Earth where the sun is directly overhead.
  // Longitude = based on UTC time (solar noon at lng 0 when UTC 12:00)
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const subSolarLng = (12 - utcHours) * 15; // degrees

  // Declination gives latitude of sub-solar point
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  const declination = -23.44 * Math.cos(((360 / 365) * (dayOfYear + 10)) * DEG2RAD);

  // Convert to a direction vector in the globe's coordinate system
  // Using the same coordinate convention as latLngToVec3 in cities.ts
  const phi = (90 - declination) * DEG2RAD;
  const lngRad = subSolarLng * DEG2RAD;
  const x = -Math.sin(phi) * Math.cos(lngRad);
  const y = Math.cos(phi);
  const z = -Math.sin(phi) * Math.sin(lngRad);

  // Scale to a reasonable light distance
  const dist = 8;
  return [x * dist, y * dist, z * dist];
}
