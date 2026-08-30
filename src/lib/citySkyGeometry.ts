import * as THREE from 'three';
import { horizonOfRaDec, type HorizonPos, type LocalFrame } from '@/lib/skyLocal';

/**
 * Placing the sky in the city scene (docs/CITY_SCENE_PLAN.md §6).
 *
 * Pure geometry, kept out of the component so it can be tested without a
 * renderer -- R3F scene components are not unit-tested in this repo (see
 * vitest.config.ts), and getting a frame conversion silently wrong is exactly
 * the failure this plan has already hit once (§6.3's rotation matrix).
 */

const DEG = Math.PI / 180;

/** Bodies sit on this sphere around the viewer -- comfortably outside the
 *  buildings, comfortably inside drei's Sky dome (4500). */
export const SKY_R = 400;
/** Stars and the Milky Way, just beyond the planets. */
export const STAR_R = 420;

const ORIGIN: readonly [number, number, number] = [0, 0, 0];

/**
 * Horizon coordinates to scene space, with the viewer at `eye`.
 *
 * Scene compass, fixed here and nowhere else: **-Z is north, +X is east**.
 * The default camera looks down -Z, so the buildings stand to the north.
 * Arbitrary, but it has to be written down in exactly one place or every
 * later addition quietly picks its own convention.
 */
export function horizonToScene(
  pos: HorizonPos,
  radius: number,
  eye: readonly [number, number, number],
): [number, number, number] {
  const alt = pos.altitude * DEG;
  const az = pos.azimuth * DEG;
  const horizontal = Math.cos(alt) * radius;
  return [
    eye[0] + horizontal * Math.sin(az),
    eye[1] + Math.sin(alt) * radius,
    eye[2] - horizontal * Math.cos(az),
  ];
}

/**
 * Rotation taking the J2000 Y-up frame (`raDecToVec3`'s output, which is also
 * the world map's own world space) into this scene's horizon frame.
 *
 * Built from the images of that frame's three basis vectors rather than by
 * composing matrices by hand: each column goes through the same tested
 * `horizonOfRaDec` -> `horizonToScene` path the stars themselves use, so it
 * cannot disagree with them, and no archaeology is needed about which way
 * astronomy-engine's horizontal axes point.
 *
 *   x-hat <- RA 0h, Dec 0     y-hat <- Dec +90     z-hat <- RA 18h, Dec 0
 */
export function eqjToSceneMatrix(frame: LocalFrame): THREE.Matrix4 {
  const dir = (raH: number, dec: number) => {
    const [x, y, z] = horizonToScene(horizonOfRaDec(raH, dec, frame), 1, ORIGIN);
    return new THREE.Vector3(x, y, z);
  };
  return new THREE.Matrix4().makeBasis(dir(0, 0), dir(0, 90), dir(18, 0));
}
