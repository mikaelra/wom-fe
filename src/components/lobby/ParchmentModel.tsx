'use client';

import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import {
  AVATAR_RENDER_ORDER,
  DEAD_OPACITY,
  GHOST_OPACITY,
} from '@/lib/avatarFade';
import { PARCHMENT_COLORS } from '@/lib/cosmetics';

/**
 * The Parchment: a rolled scroll that floats beside its owner's avatar.
 *
 * Drawn procedurally rather than loaded from a `.glb`. Four primitives are
 * cheaper than the ~1 MB a Meshy export would cost, and a lobby can hold
 * several of these at once. `lib/cosmetics.ts`'s `cosmeticModelUrl()` is the
 * swap point if a real asset ever replaces it -- nothing else needs to know.
 *
 * Rendered as a sibling of the avatar inside `PlayerWithName`'s group, so it
 * inherits that group's position, rotation and click handling for free. Two
 * consequences of being a sibling, both handled here (see
 * `docs/ARTIFACT_PLAN.md` §5.5):
 *
 * - it is NOT in `PlayerV1`'s material traversal, so the dead/ghost fade has
 *   to be applied here too, from the same constants
 * - it needs the avatar's render order, or it sorts wrongly against the
 *   transparent dead state
 */
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
  const groupRef = useRef<THREE.Group>(null!);

  const faded = isDead || isGhost;
  const opacity = isGhost ? GHOST_OPACITY : isDead ? DEAD_OPACITY : 1;

  // A dead player's scroll stops turning and settles with them -- a relic
  // still spinning over a corpse reads as a bug rather than a flourish.
  const animated = !isDead;

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    if (!animated) {
      g.position.y = 0.3;
      return;
    }
    const t = state.clock.elapsedTime + phase;
    g.position.y = 0.36 + Math.sin(t * 1.1) * 0.035;
    g.rotation.y = Math.sin(t * 0.5) * 0.35;
  });

  // One shared material description for every part; only the colour differs.
  const common = useMemo(
    () => ({
      transparent: faded,
      opacity,
      depthWrite: !faded,
    }),
    [faded, opacity],
  );

  return (
    <group
      ref={groupRef}
      position={[0.62, 0.36, 0]}
      // Tilted off-axis so it reads as an object hanging in the air rather
      // than a prop standing to attention.
      rotation={[0, 0, 0.28]}
    >
      {/* The rolled sheet. */}
      <mesh renderOrder={AVATAR_RENDER_ORDER} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.075, 0.075, 0.3, 16]} />
        <meshStandardMaterial
          color={PARCHMENT_COLORS.paper}
          roughness={0.85}
          metalness={0}
          {...common}
        />
      </mesh>

      {/* A second, slightly smaller roll offset behind the first, so the
          silhouette reads as furled paper rather than a plain tube. */}
      <mesh
        renderOrder={AVATAR_RENDER_ORDER}
        rotation={[0, 0, Math.PI / 2]}
        position={[0, -0.055, -0.03]}
      >
        <cylinderGeometry args={[0.052, 0.052, 0.28, 14]} />
        <meshStandardMaterial
          color={PARCHMENT_COLORS.paperShade}
          roughness={0.9}
          metalness={0}
          {...common}
        />
      </mesh>

      {/* The rod, poking out of both ends. */}
      <mesh renderOrder={AVATAR_RENDER_ORDER} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.4, 10]} />
        <meshStandardMaterial
          color={PARCHMENT_COLORS.rod}
          roughness={0.6}
          metalness={0.1}
          {...common}
        />
      </mesh>

      {/* Ribbon tie. Small, but it is what makes the shape legible as a
          scroll at lobby framing, where the whole object is a few pixels. */}
      <mesh renderOrder={AVATAR_RENDER_ORDER} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.083, 0.083, 0.035, 12]} />
        <meshStandardMaterial
          color={PARCHMENT_COLORS.ribbon}
          roughness={0.5}
          metalness={0}
          {...common}
        />
      </mesh>
    </group>
  );
}

export default memo(ParchmentModelImpl);
