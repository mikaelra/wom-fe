'use client';

import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { WELL_REWARD_MODELS, WELL_REWARD_ROTATION } from '@/components/lobby/WellRewardEffect';

useGLTF.preload(WELL_REWARD_MODELS.deny);

// Floats in front of an eligible target while a deny is pending (see
// PlayerAvatars.tsx's showDenyButton) -- ghosted so it reads as a prompt
// rather than a solid object. Deliberately not the same opacity as the
// model's award-moment appearance (WellRewardEffect's flying instance,
// which stays fully opaque): both share the deny-ld.glb URL and useGLTF's
// cache, so materials are cloned here rather than mutated in place --
// otherwise this would fade the flying reward model too.
const DENY_MODEL_OPACITY = 0.35; // 65% transparent
// Red glow around the model itself: an emissive tint baked into its own
// (cloned) material -- same self-illumination technique DenyRingEffect uses
// -- plus a small point light so the glow bleeds onto the character/ground
// behind it too, not just the model's own surface.
const DENY_MODEL_GLOW_COLOR = new THREE.Color('#ef4444');
const DENY_MODEL_EMISSIVE_INTENSITY = 1.1;
const DENY_MODEL_LIGHT_INTENSITY = 1.4;
const DENY_MODEL_LIGHT_DISTANCE = 1.8;
const DENY_MODEL_SCALE = 0.55;
const DENY_MODEL_POSITION: [number, number, number] = [0, 0.1, 0.4];
const DENY_MODEL_BOSS_POSITION: [number, number, number] = [0, 0.5, 0.6];
// Lost souls render at their own much smaller scale (LostSoulMesh's 0.4 vs
// a regular player's implicit 1x here) -- scaled and pulled in to match.
const DENY_MODEL_LOST_SOUL_SCALE = 0.3;
const DENY_MODEL_LOST_SOUL_POSITION: [number, number, number] = [0, 0.15, 0.25];
// The GLB's cross reads diagonally at WELL_REWARD_ROTATION.deny's base
// orientation (tilted 90° on X to stand it up) -- an extra 30° turn makes
// it read as an upright "stop sign" cross instead. Local to this button
// (not folded into WELL_REWARD_ROTATION.deny itself, which the Well's
// flying reward model also uses and shouldn't be affected). Z (roll) was
// tried first and was the wrong axis -- this is Y (yaw) instead.
const DENY_MODEL_ROTATION: [number, number, number] = [
  WELL_REWARD_ROTATION.deny[0],
  WELL_REWARD_ROTATION.deny[1] + THREE.MathUtils.degToRad(30),
  WELL_REWARD_ROTATION.deny[2],
];

export type DenyModelButtonVariant = 'player' | 'boss' | 'lostSoul';

export type DenyModelButtonProps = {
  /** 'boss': Hades' model is considerably larger than a regular player's,
   *  so the float sits further out to clear it. 'lostSoul': souls render
   *  at their own smaller scale, so this scales/pulls the float in to
   *  match. Defaults to the regular-player float. */
  variant?: DenyModelButtonVariant;
};

const VARIANT_POSITION: Record<DenyModelButtonVariant, [number, number, number]> = {
  player: DENY_MODEL_POSITION,
  boss: DENY_MODEL_BOSS_POSITION,
  lostSoul: DENY_MODEL_LOST_SOUL_POSITION,
};
const VARIANT_SCALE: Record<DenyModelButtonVariant, number> = {
  player: DENY_MODEL_SCALE,
  boss: DENY_MODEL_SCALE,
  lostSoul: DENY_MODEL_LOST_SOUL_SCALE,
};

// No onClick of its own: this renders as a child of the parent's own
// clickable group (PlayerWithName's outer <group>, or LostSoulModel's),
// which already raycasts/handles clicks and hover across the whole model
// when showDenyButton is active -- adding this model to that same group is
// what makes the whole thing (avatar + this float) clickable as one target.
export default function DenyModelButton({ variant = 'player' }: DenyModelButtonProps) {
  const { scene } = useGLTF(WELL_REWARD_MODELS.deny);
  const sceneClone = useMemo(() => scene.clone(), [scene]);

  useEffect(() => {
    sceneClone.traverse((obj: THREE.Object3D) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const ghost = (m: THREE.Material) => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = DENY_MODEL_OPACITY;
        c.depthWrite = false;
        if (c instanceof THREE.MeshStandardMaterial) {
          c.emissive = DENY_MODEL_GLOW_COLOR;
          c.emissiveIntensity = DENY_MODEL_EMISSIVE_INTENSITY;
        }
        return c;
      };
      obj.material = Array.isArray(obj.material) ? obj.material.map(ghost) : ghost(obj.material);
    });
  }, [sceneClone]);

  return (
    <group position={VARIANT_POSITION[variant]}>
      <primitive
        object={sceneClone}
        scale={VARIANT_SCALE[variant]}
        rotation={DENY_MODEL_ROTATION}
      />
      <pointLight
        color={DENY_MODEL_GLOW_COLOR}
        intensity={DENY_MODEL_LIGHT_INTENSITY}
        distance={DENY_MODEL_LIGHT_DISTANCE}
      />
    </group>
  );
}
