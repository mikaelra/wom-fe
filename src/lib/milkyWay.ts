import * as THREE from 'three';
import { raDecToVec3 } from '@/lib/astrology';
import { STAR_CATALOG } from '@/components/worldmap/starCatalog';

/**
 * Orientation of the Milky Way panorama texture.
 *
 * The texture is not supplied in any known standard alignment, so this
 * rotation was arrived at empirically rather than derived: a base Euler that
 * lands Sirius correctly, then an exact twist about the Sirius axis (which
 * leaves Sirius fixed by construction) to roll the band into place. It was
 * tuned by eye against the world map and must not be "cleaned up" -- there is
 * no closed form to recover.
 *
 * It maps TEXTURE-SPHERE space into the J2000 equatorial, Y-up frame that
 * `raDecToVec3` produces. That is the world map's own world space, so the map
 * applies it directly; the city scene composes it with a further rotation
 * into Athens' horizon (see CitySky's eqjToSceneMatrix).
 *
 * Extracted here from WorldMap.tsx so both scenes share one definition rather
 * than a magic quaternion copied into two places.
 */

/** Sirius' unit direction in the EQJ Y-up frame -- the twist axis. */
export function siriusDirection(): THREE.Vector3 {
  const sirius = STAR_CATALOG.find((s) => Math.abs(s.mag + 1.46) < 0.01);
  if (!sirius) {
    // Catalogue edit gone wrong. Fall back rather than throw: a misaligned
    // Milky Way is a cosmetic fault, a blank scene is not.
    console.warn('Sirius not found in STAR_CATALOG -- Milky Way alignment will be wrong');
    return new THREE.Vector3(0, 0, 1);
  }
  return raDecToVec3(sirius.ra[0] + sirius.ra[1] / 60, sirius.dec, 1).normalize();
}

const BASE_EULER = new THREE.Euler(-Math.PI / 25.8, -Math.PI / 1.3865, 0, 'XYZ');
const TWIST_ANGLE = -Math.PI / 2.55;

/** Texture-sphere space -> EQJ (Y-up) space. */
export function milkyWayQuaternion(): THREE.Quaternion {
  const base = new THREE.Quaternion().setFromEuler(BASE_EULER);
  const twist = new THREE.Quaternion().setFromAxisAngle(siriusDirection(), TWIST_ANGLE);
  return twist.multiply(base);
}

/** Web build gets the small JPEG; the native bundle carries the big PNG. */
export function milkyWayTexturePath(isNative: boolean): string {
  return isNative ? '/textures/stars/MilkyWay-extreme.png' : '/textures/stars/MilkyWay-HD.jpg';
}

/** Un-mirrors the panorama on a BackSide sphere, whose UVs flip it. */
export function orientMilkyWayTexture(tex: THREE.Texture): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.x = -1;
  tex.offset.x = 1;
  tex.offset.y = 0;
  tex.needsUpdate = true;
}
