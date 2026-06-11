'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Reward model catalogue ────────────────────────────────────────────────────
// Every reward the well can grant maps to a GLB in /models/well/rewards.
// `scale` / `spin` are first-pass guesses — expect to tune these per model once
// they're seen in-scene (the models have not been size-normalised yet).
export type WellRewardType =
  | 'gold'
  | 'health'
  | 'sword'
  | 'instakill'
  | 'deny'
  | 'info'
  | 'steal';

export const WELL_REWARD_MODELS: Record<WellRewardType, string> = {
  gold:      '/models/well/rewards/gold-ld.glb',
  health:    '/models/well/rewards/health-ld.glb',
  sword:     '/models/well/rewards/sword_ld_v1.glb',
  instakill: '/models/well/rewards/instakill-ld.glb',
  deny:      '/models/well/rewards/deny-ld.glb',
  info:      '/models/well/rewards/info-ld.glb',
  // 'steal' (former "Tjuvpakk!", now "Steal-all!") reuses the gold coin — the
  // coins fly *from* the other players *to* the winner instead of from the well.
  steal:     '/models/well/rewards/gold-ld.glb',
};

// Per-reward presentation tuning. Kept here so size/rotation refinement is a
// one-line change once the models are seen in-scene.
export const WELL_REWARD_SCALE: Record<WellRewardType, number> = {
  gold:      0.3,
  health:    0.3,
  sword:     0.3,
  instakill: 0.3,
  deny:      0.3,
  info:      0.3,
  steal:     0.3,
};

export function preloadWellRewardModels() {
  for (const url of new Set(Object.values(WELL_REWARD_MODELS))) {
    useGLTF.preload(url);
  }
}

// ── Animation timing (seconds) ────────────────────────────────────────────────
const TRAVEL_DUR = 0.85; // arch from source → target
const HOLD_DUR   = 0.45; // sit on the winner
const FADE_DUR   = 0.45; // shrink + fade away
// Peak height of the arch above the straight line between source and target.
const ARCH_HEIGHT = 1.4;
// End-over-end tumbles while travelling.
const TRAVEL_SPINS = 1.0;

function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }

export type WellRewardEffectProps = {
  /** Which reward model to show. */
  type: WellRewardType;
  /** World-space origin the model launches from (well mouth, or a player for steal). */
  fromPosition: [number, number, number];
  /** World-space position of the winning player it lands on. */
  toPosition: [number, number, number];
  /** Seconds to wait before the animation starts (used to stagger multiples). */
  delay?: number;
  /** Optional scale override; defaults to the per-type tuning above. */
  scale?: number;
  /** Called once the whole sequence (travel + hold + fade) has finished. */
  onDone?: () => void;
};

export default function WellRewardEffect({
  type,
  fromPosition,
  toPosition,
  delay = 0,
  scale,
  onDone,
}: WellRewardEffectProps) {
  const url = WELL_REWARD_MODELS[type];
  const { scene } = useGLTF(url);

  // Clone the scene AND its materials so opacity changes during fade are local
  // to this instance and don't bleed onto the shared cached materials.
  const sceneClone = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = Array.isArray(obj.material)
          ? obj.material.map((m) => m.clone())
          : obj.material.clone();
      }
    });
    return clone;
  }, [scene]);

  const groupRef       = useRef<THREE.Group>(null);
  const tRef           = useRef(0);
  const doneCalledRef  = useRef(false);

  const [fx, fy, fz] = fromPosition;
  const [tx, ty, tz] = toPosition;
  const { fromVec, toVec } = useMemo(() => ({
    fromVec: new THREE.Vector3(fx, fy, fz),
    toVec:   new THREE.Vector3(tx, ty, tz),
  }), [fx, fy, fz, tx, ty, tz]);

  // Collect the cloned materials once so the fade phase can drive their opacity.
  const materials = useMemo(() => {
    const mats: THREE.Material[] = [];
    sceneClone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => mats.push(m));
      }
    });
    return mats;
  }, [sceneClone]);

  useEffect(() => {
    if (groupRef.current) groupRef.current.position.copy(fromVec);
  }, [fromVec]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    tRef.current += delta;
    let t = tRef.current - delay;
    if (t < 0) { group.visible = false; return; }
    group.visible = true;

    if (t < TRAVEL_DUR) {
      // Arch from source to target with a tumbling spin.
      const localT = t / TRAVEL_DUR;
      group.position.lerpVectors(fromVec, toVec, easeOut(localT));
      group.position.y += ARCH_HEIGHT * Math.sin(localT * Math.PI);
      group.rotation.y = localT * Math.PI * 2 * TRAVEL_SPINS;
    } else if (t < TRAVEL_DUR + HOLD_DUR) {
      // Rest on the winner, gently bobbing.
      group.position.copy(toVec);
      group.position.y += Math.sin((t - TRAVEL_DUR) * 6) * 0.04;
    } else if (t < TRAVEL_DUR + HOLD_DUR + FADE_DUR) {
      // Shrink + fade out where it landed. The model scale lives on the child
      // <primitive>, so the group only needs to scale 1 → 0 on top of it.
      const localT = (t - TRAVEL_DUR - HOLD_DUR) / FADE_DUR;
      const k = 1 - localT;
      group.position.copy(toVec);
      group.scale.setScalar(k);
      materials.forEach((m) => { m.transparent = true; m.opacity = k; });
    } else if (!doneCalledRef.current) {
      doneCalledRef.current = true;
      onDone?.();
    }
  });

  return (
    <group ref={groupRef} position={fromPosition}>
      <primitive object={sceneClone} scale={scale ?? WELL_REWARD_SCALE[type]} />
    </group>
  );
}
