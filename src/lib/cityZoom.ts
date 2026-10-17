/**
 * Zoom for the city scene.
 *
 * The city camera is pinned to one spot and only turns (CityScene.tsx), so
 * a dolly zoom would slide the viewer off that spot. Zoom narrows the field
 * of view instead -- what a panorama viewer or a pair of binoculars does.
 * The base FOV is the widest; zoom only goes in from there.
 */

/** Narrowest FOV: roughly 3x magnification against the 70° default. */
export const CITY_MIN_FOV = 25;

export function clampCityFov(fov: number, maxFov: number): number {
  return Math.min(maxFov, Math.max(CITY_MIN_FOV, fov));
}

/** One mouse-wheel / trackpad step. Multiplicative so each notch feels the
 *  same whether zoomed in or out; positive deltaY (scroll down) zooms out. */
export function fovAfterWheel(fov: number, deltaY: number, maxFov: number): number {
  return clampCityFov(fov * Math.exp(deltaY * 0.001), maxFov);
}

/** Pinch: spreading the fingers to twice their starting distance halves the FOV. */
export function fovAfterPinch(
  startFov: number, startDistance: number, distance: number, maxFov: number,
): number {
  if (startDistance <= 0 || distance <= 0) return clampCityFov(startFov, maxFov);
  return clampCityFov(startFov * (startDistance / distance), maxFov);
}

/** Drag-to-turn speed scaled with the FOV, so a drag moves the view the
 *  same distance on screen however far in the player has zoomed. */
export function rotateSpeedForFov(baseSpeed: number, fov: number, maxFov: number): number {
  return baseSpeed * (fov / maxFov);
}
