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
  sword:     '/models/well/rewards/sword-ld.glb',
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
  gold:      0.144, // 60% of the previous 0.24
  health:    0.204, // 85% of the previous 0.24
  sword:     0.3,
  instakill: 0.3,
  deny:      0.3,
  info:      0.3,
  steal:     0.144, // steal coins match the gold coin size
};

// Base orientation (radians) applied to each model. The travel tumble spins on
// top of this, and it's what the model rests at after landing.
export const WELL_REWARD_ROTATION: Record<WellRewardType, [number, number, number]> = {
  gold:      [0, 0, 0],
  health:    [0, 0, 0],
  sword:     [0, 0, 0],
  instakill: [0, 0, 0],
  // Stand the deny model upright (it ships lying down) so it spins in the air
  // like the instakill model — tilt 90° on X rather than the previous Y spin.
  deny:      [Math.PI / 2, 0, 0],
  info:      [0, 0, 0],
  steal:     [0, 0, 0],
};

export function preloadWellRewardModels() {
  for (const url of new Set(Object.values(WELL_REWARD_MODELS))) {
    useGLTF.preload(url);
  }
}

// ── Animation timing (seconds) -- scaled to 0.8x for a modest speedup ────────
// Exported so useStagedResources can reveal a Well reward's card tick-up/
// bounce at the exact moment the model actually lands, instead of a
// separately-tuned duplicate constant that can (and did) drift out of sync.
export const WELL_REWARD_TRAVEL_DUR = 1.03; // arch from source → target
const HOLD_DUR = 0.54; // rest on the winner, then disappear instantly
// Total lifetime of one reward instance (no fade-out — it pops away after HOLD).
export const WELL_REWARD_FLIGHT_DUR = WELL_REWARD_TRAVEL_DUR + HOLD_DUR;
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
  /** Called once the sequence (travel + hold) has finished. */
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
  const sceneClone = useMemo(() => scene.clone(), [scene]);

  const groupRef       = useRef<THREE.Group>(null);
  const tRef           = useRef(0);
  const doneCalledRef  = useRef(false);

  const [fx, fy, fz] = fromPosition;
  const [tx, ty, tz] = toPosition;
  const { fromVec, toVec } = useMemo(() => ({
    fromVec: new THREE.Vector3(fx, fy, fz),
    toVec:   new THREE.Vector3(tx, ty, tz),
  }), [fx, fy, fz, tx, ty, tz]);

  useEffect(() => {
    if (groupRef.current) groupRef.current.position.copy(fromVec);
  }, [fromVec]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    tRef.current += delta;
    const t = tRef.current - delay;
    if (t < 0) { group.visible = false; return; }
    group.visible = true;

    if (t < WELL_REWARD_TRAVEL_DUR) {
      // Arch from source to target with a tumbling spin.
      const localT = t / WELL_REWARD_TRAVEL_DUR;
      group.position.lerpVectors(fromVec, toVec, easeOut(localT));
      group.position.y += ARCH_HEIGHT * Math.sin(localT * Math.PI);
      group.rotation.y = localT * Math.PI * 2 * TRAVEL_SPINS;
    } else if (t < WELL_REWARD_TRAVEL_DUR + HOLD_DUR) {
      // Rest on the winner, gently bobbing — then it's removed instantly (no fade).
      group.position.copy(toVec);
      group.position.y += Math.sin((t - WELL_REWARD_TRAVEL_DUR) * 6) * 0.04;
    } else if (!doneCalledRef.current) {
      doneCalledRef.current = true;
      onDone?.();
    }
  });

  return (
    <group ref={groupRef} position={fromPosition}>
      <primitive
        object={sceneClone}
        scale={scale ?? WELL_REWARD_SCALE[type]}
        rotation={WELL_REWARD_ROTATION[type]}
      />
    </group>
  );
}
