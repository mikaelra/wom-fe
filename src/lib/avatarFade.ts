/**
 * The one definition of how an avatar looks when its player is dead or
 * spectating.
 *
 * This lived inside `Playerv1.tsx` as an effect that traversed the loaded
 * GLB and cloned every material. That was fine while the frog was the only
 * thing in the avatar's group. It stopped being fine the moment a cosmetic
 * was parented alongside it (`docs/ARTIFACT_PLAN.md` §5.5): a sibling
 * object is not in that traversal, so a ghosted frog would carry a fully
 * opaque Parchment.
 *
 * Two consumers, two shapes of geometry, one set of numbers:
 * - `applyFade` handles a loaded GLB, where the materials are whatever the
 *   artist exported and have to be cloned before being touched.
 * - Procedural meshes (`ParchmentModel`) read the constants directly and
 *   set their own material props -- traversing a mesh you authored yourself
 *   to mutate materials you just declared would be a pointless round trip.
 */
import * as THREE from 'three';

/** A dead player: faded, and washed halfway to grey. */
export const DEAD_OPACITY = 0.3;
export const DEAD_GRAY_MIX = 0.5;

/**
 * A spectator: thinner than a corpse, and NOT greyed. A watcher above the
 * ring should read as present but not playing -- they are not dead, so they
 * do not take the death treatment.
 */
export const GHOST_OPACITY = 0.18;

/** Shared by every mesh in the avatar group so the transparent dead state
 *  sorts consistently. A cosmetic sitting beside the body needs the same
 *  value or it fights with the frog it is standing next to. */
export const AVATAR_RENDER_ORDER = 10;

/** Blend a flat grey into the final shaded colour, keeping the texture. */
function greyWash(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( ${DEAD_GRAY_MIX} ), ${DEAD_GRAY_MIX} );`,
    );
  };
}

/**
 * Apply the dead/ghost look to every mesh under `root`.
 *
 * Materials are shared across `scene.clone()` instances, so each one is
 * cloned before being altered -- without that, fading one player would fade
 * every player wearing the same skin. The original is stashed per-mesh in
 * `userData.origMaterial` so the model restores if the player comes back
 * (e.g. a new round).
 */
export function applyFade(
  root: THREE.Object3D,
  { isDead = false, isGhost = false }: { isDead?: boolean; isGhost?: boolean },
): void {
  root.traverse((obj: THREE.Object3D) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const orig = (obj.userData.origMaterial ?? obj.material) as THREE.Material | THREE.Material[];
    obj.userData.origMaterial = orig;

    if (!isGhost && !isDead) {
      obj.material = orig;
      return;
    }

    const fade = (m: THREE.Material) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = isGhost ? GHOST_OPACITY : DEAD_OPACITY;
      c.depthWrite = false;
      // isGhost wins when both are set: a spectator is not a corpse.
      if (!isGhost) greyWash(c);
      c.needsUpdate = true;
      return c;
    };
    obj.material = Array.isArray(orig) ? orig.map(fade) : fade(orig);
  });
}
