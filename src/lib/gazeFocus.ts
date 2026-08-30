import * as THREE from 'three';

/**
 * Naming what you look at (docs/CITY_SCENE_PLAN.md §7).
 *
 * A body is labelled only while it sits near the centre of the view, in the
 * city scene and on the world map alike. The sky stays clean and
 * identification becomes an act of attention rather than a permanent legend.
 *
 * Pure maths, so the thresholds and the occlusion rule are testable without
 * a renderer -- R3F scene components are not unit-tested in this repo (see
 * vitest.config.ts), which is exactly why the decisions live here.
 */

/** Fully opaque at or inside this angle from the view axis, in degrees. */
export const FOCUS_INNER_DEG = 4;
/** Fully transparent at or beyond this angle. */
export const FOCUS_OUTER_DEG = 11;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Label opacity for a body sitting `angleDeg` off the view axis.
 *
 * The gap between the two thresholds IS the hysteresis: a body hovering at
 * one edge cannot strobe, because there is no single boundary to sit on.
 * Beyond 90 degrees the body is behind the camera, which `viewAngleDeg`
 * already reports as a large angle, so no separate behind-check is needed.
 */
export function focusOpacity(
  angleDeg: number,
  inner = FOCUS_INNER_DEG,
  outer = FOCUS_OUTER_DEG,
): number {
  if (!Number.isFinite(angleDeg)) return 0;
  return 1 - smoothstep(inner, outer, angleDeg);
}

const _toBody = new THREE.Vector3();

/**
 * Angle between where the camera is pointing and where a body is, in degrees.
 *
 * Deliberately an ANGLE rather than a distance in pixels from screen centre:
 * it is independent of viewport size, aspect ratio and the responsive FOV,
 * so a phone and a desktop agree on what counts as looking at something.
 * Returns > 90 for anything behind the camera, which makes the behind-check
 * free. `forward` must be a unit vector (camera.getWorldDirection).
 */
export function viewAngleDeg(
  cameraPos: THREE.Vector3,
  forward: THREE.Vector3,
  targetPos: THREE.Vector3,
): number {
  _toBody.copy(targetPos).sub(cameraPos);
  if (_toBody.lengthSq() === 0) return 0;
  _toBody.normalize();
  // Guard the domain: accumulated float error can push the dot fractionally
  // outside [-1, 1] and make acos return NaN.
  const dot = Math.min(1, Math.max(-1, forward.dot(_toBody)));
  return THREE.MathUtils.radToDeg(Math.acos(dot));
}

const _oc = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Is a sphere between the camera and the body?
 *
 * Used on the world map, where a planet can sit behind the Earth. Explicitly
 * NOT drei's `<Html occlude>`: CityMarker.tsx records that occlude="blending"
 * was tried there and broke rendering outright on real phones (Safari and
 * Firefox both), and was reverted. A ray/sphere test is a handful of
 * operations and cannot take the page down.
 *
 * The city scene needs none of this -- a body below the horizon is behind the
 * Earth by definition, and `skyLocal`'s altitude already says so.
 */
export function occludedBySphere(
  cameraPos: THREE.Vector3,
  targetPos: THREE.Vector3,
  sphereCenter: THREE.Vector3,
  sphereRadius: number,
): boolean {
  _dir.copy(targetPos).sub(cameraPos);
  const distToTarget = _dir.length();
  if (distToTarget === 0) return false;
  _dir.divideScalar(distToTarget);

  _oc.copy(sphereCenter).sub(cameraPos);
  // A camera inside the sphere is not being occluded by it -- it is in it.
  if (_oc.lengthSq() <= sphereRadius * sphereRadius) return false;

  const alongRay = _oc.dot(_dir);
  if (alongRay <= 0) return false;                       // sphere is behind us

  const perpSq = _oc.lengthSq() - alongRay * alongRay;
  const rSq = sphereRadius * sphereRadius;
  if (perpSq >= rSq) return false;                       // ray misses the sphere

  // Near intersection. Occluding only if it falls between us and the body.
  const nearHit = alongRay - Math.sqrt(rSq - perpSq);
  return nearHit > 0 && nearHit < distToTarget;
}
