'use client';

import { memo, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import { AVATAR_RENDER_ORDER, applyFade } from '@/lib/avatarFade';
import { PARCHMENT, cosmeticModelUrl } from '@/lib/cosmetics';

/**
 * The Parchment: the scroll that floats beside its owner's avatar.
 *
 * The model (`public/skins/items/pergament_v1.glb`, PR #329) is one mesh
 * with no rig and no animations -- the same shape as a frog skin -- so it
 * needs no more machinery than a clone and a transform.
 *
 * Rendered as a sibling of the avatar inside `PlayerWithName`'s group, so it
 * inherits that group's position, rotation and click handling for free. Two
 * consequences of being a sibling, both handled here (see wom-be
 * `docs/ARTIFACT_PLAN.md` §5.5):
 *
 * - it is NOT in `PlayerV1`'s material traversal, so the dead/ghost fade has
 *   to be applied here too -- from `lib/avatarFade.ts`, so there is one
 *   definition of the look rather than two that drift
 * - it needs the avatar's render order, or it sorts wrongly against the
 *   transparent dead state
 *
 * Deliberately NOT preloaded. The asset is ~6 MB (almost entirely three
 * JPEG textures), and almost nobody owns one -- eagerly fetching it for
 * every player in every lobby would cost far more than it saves. It loads
 * under the Suspense boundary that wraps this component, on the rare
 * occasion someone is actually wearing one.
 */

// Tuned by eye against the real model in the lobby.
//
// The scroll is 1.0 tall in its own space, so 0.5 puts it at roughly 44% of
// the frog's height (which is ~1.14 at its own 0.6 scale) -- a carried
// object rather than a second character.
//
// Placement: held in the frog's hands, tilted outwards.
//
// These three numbers were tuned by eye against the real model in a lobby.
// Do not re-derive them from the measurements below and expect a match --
// the mesh only says where the hands are, not where a scroll looks right
// between them, and the final Y in particular sits well under the hands
// because the model's own pivot is not at its grip.
//
// The measurements, kept because they are the map for any future
// re-tuning (taken off frog_green_v1.glb): the hands are two symmetric
// vertex clusters at x = +/-0.385, y = 0.35, z = 0.38 in model space, which
// at the frog's own 0.6 render scale is a gap 0.46 wide, with the belly
// bulging forward to z = 0.37 at that height. The scroll is 1.0 long in its
// own space, so SCALE 0.5 makes it 0.5 -- close to that hand span.
//
// ROTATION is [x, y, z] in radians. The scroll's long axis is its own Y, so
// it stands upright at zero; x pitches its top away from the chest (the
// "tilted outwards" part) and is at 30 degrees here; z would lay it flat
// across the body instead.
const SCALE = 0.5;
const OFFSET: [number, number, number] = [0, -0.22, 0.24];
const ROTATION: [number, number, number] = [Math.PI / 6, 0, 0];

// PlayerV1 tips a dead player 90 degrees about its own origin and drops it
// 0.5 on Y. A held object has to take the same transform or it detaches and
// hangs in the air beside a toppled frog -- which a floating cosmetic could
// get away with and this one cannot. Kept in sync with Playerv1.tsx by hand;
// there is no shared constant because PlayerV1 applies it to its own
// primitive rather than to the group.
const DEAD_DROP: [number, number, number] = [0, -0.5, 0];
const DEAD_TIP: [number, number, number] = [0, 0, Math.PI / 2];
const NO_TRANSFORM: [number, number, number] = [0, 0, 0];

function ParchmentModelImpl({
  isDead = false,
  isGhost = false,
}: {
  isDead?: boolean;
  isGhost?: boolean;
}) {
  const url = cosmeticModelUrl(PARCHMENT);
  // A cosmetic with no model yet renders nothing rather than guessing a
  // path. Hooks below still run unconditionally -- see the empty-url guard
  // in the loader call.
  const { scene } = useGLTF(url ?? '');
  // Each instance needs its own clone: materials and transforms are shared
  // across users of the same cached GLTF otherwise.
  const sceneClone = useMemo(() => scene.clone(), [scene]);

  useEffect(() => {
    sceneClone.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) obj.renderOrder = AVATAR_RENDER_ORDER;
    });
  }, [sceneClone]);

  useEffect(() => {
    applyFade(sceneClone, { isDead, isGhost });
  }, [sceneClone, isDead, isGhost]);

  if (!url) return null;

  return (
    // Outer group carries the death transform about the avatar's own origin,
    // mirroring what PlayerV1 does to the body, so the scroll stays in the
    // frog's hands when it topples. Inner group is the placement itself.
    <group
      position={isDead ? DEAD_DROP : NO_TRANSFORM}
      rotation={isDead ? DEAD_TIP : NO_TRANSFORM}
    >
      <group position={OFFSET} rotation={ROTATION}>
        <primitive object={sceneClone} scale={SCALE} />
      </group>
    </group>
  );
}

export default memo(ParchmentModelImpl);
