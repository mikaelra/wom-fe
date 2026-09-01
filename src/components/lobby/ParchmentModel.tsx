'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
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
// Offset puts the scroll on +z -- the same "in front of the player" axis the
// deny prompt ([0, 0.1, 0.4]) and the equipped-coin cue ([0, -0.05, 0.55])
// use, but further out at 1.0, so nothing intersects. Note they do line up
// front-to-back: a player with a deny pending or Hades' Coin selected will
// have all three on one line from the camera.
//
// The offset is in the avatar group's space, which PlayerWithName rotates
// with the player, so this stays put relative to them wherever they stand
// in the ring.
const SCALE = 0.5;
const OFFSET: [number, number, number] = [0, 0, 1];

function ParchmentModelImpl({
  isDead = false,
  isGhost = false,
  /** Desynchronises the bob between players, so a lobby's scrolls don't
   *  pulse in lockstep. Pass something stable per player. */
  phase = 0,
}: {
  isDead?: boolean;
  isGhost?: boolean;
  phase?: number;
}) {
  const url = cosmeticModelUrl(PARCHMENT);
  // A cosmetic with no model yet renders nothing rather than guessing a
  // path. Hooks below still run unconditionally -- see the empty-url guard
  // in the loader call.
  const { scene } = useGLTF(url ?? '');
  // Each instance needs its own clone: materials and transforms are shared
  // across users of the same cached GLTF otherwise.
  const sceneClone = useMemo(() => scene.clone(), [scene]);
  const groupRef = useRef<THREE.Group>(null!);

  useEffect(() => {
    sceneClone.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) obj.renderOrder = AVATAR_RENDER_ORDER;
    });
  }, [sceneClone]);

  useEffect(() => {
    applyFade(sceneClone, { isDead, isGhost });
  }, [sceneClone, isDead, isGhost]);

  // A dead player's scroll settles with them -- a relic still bobbing over a
  // corpse reads as a bug rather than a flourish.
  const animated = !isDead;

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    if (!animated) {
      g.position.y = OFFSET[1] - 0.06;
      return;
    }
    const t = state.clock.elapsedTime + phase;
    g.position.y = OFFSET[1] + Math.sin(t * 1.1) * 0.035;
    g.rotation.y = Math.sin(t * 0.5) * 0.4;
  });

  if (!url) return null;

  return (
    <group ref={groupRef} position={OFFSET}>
      <primitive object={sceneClone} scale={SCALE} />
    </group>
  );
}

export default memo(ParchmentModelImpl);
