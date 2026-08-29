'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WELL_REWARD_MODELS, WELL_REWARD_SCALE, WELL_REWARD_ROTATION } from '@/components/lobby/WellRewardEffect';

// Which resource choice maps to which of the well's existing reward models --
// same flask/coin/sword the Well already uses, not new assets.
const RESOURCE_MODEL_TYPE = {
  gain_hp:     'health',
  gain_coin:   'gold',
  gain_attack: 'sword',
} as const;

export type GainedResource = keyof typeof RESOURCE_MODEL_TYPE;

export function isGainedResource(resource: string): resource is GainedResource {
  return resource in RESOURCE_MODEL_TYPE;
}

// ── Animation timing (seconds) ───────────────────────────────────────────────
// Tuned to land close to ResourceCard's own bounce animation (490ms, see
// ResourceCard.tsx's ANIM_DURATION_MS) so the model "arriving" and the card's
// value-change bounce read as one beat, not two separate animations -- fast
// enough to not feel sluggish, not so fast it reads as a flicker.
const RISE_DUR = 0.18;
const HANG_DUR = 0.10;
const DESCEND_DUR = 0.22;
export const RESOURCE_GAIN_DUR = RISE_DUR + HANG_DUR + DESCEND_DUR; // 0.5s

// How high above the player's chest-level anchor (+0.3, matching the combat
// strike code's own "chest height" convention) the model rises before
// dropping back down into the character.
const RISE_HEIGHT = 0.7;
const CHEST_Y_OFFSET = 0.3;
// onLand fires this much before the descend/shrink actually finishes -- a
// landing *sound* read as late when tied to the exact final frame; firing it
// a beat early (while still shrinking in) reads as in-sync instead. Doesn't
// move the model itself, only the callback -- see WellRewardEffect's
// matching LAND_LEAD_SEC for the same reasoning. Bumped 0.08 -> 0.15, same
// as WellRewardEffect (still read as late at 0.08).
const LAND_LEAD_SEC = 0.15;

function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeIn(t: number) { return t * t * t; }

export type ResourceGainEffectProps = {
  /** Which resource the player chose this round. */
  resource: GainedResource;
  /** World-space seat position of the local player. */
  position: [number, number, number];
  /** Seconds to wait before the animation starts. */
  delay?: number;
  /** Called shortly before the model finishes descending into the character
   *  -- see LAND_LEAD_SEC. Intended for a landing sound; onDone (below) is
   *  still what actually finishes/unmounts the effect. */
  onLand?: () => void;
  /** Called once the rise-hang-descend sequence has finished. */
  onDone?: () => void;
};

export default function ResourceGainEffect({ resource, position, delay = 0, onLand, onDone }: ResourceGainEffectProps) {
  const type = RESOURCE_MODEL_TYPE[resource];
  const url = WELL_REWARD_MODELS[type];
  const { scene } = useGLTF(url);
  const sceneClone = useMemo(() => scene.clone(), [scene]);

  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Object3D>(null);
  const tRef = useRef(0);
  const landCalledRef = useRef(false);
  const doneCalledRef = useRef(false);

  const [px, py, pz] = position;
  const baseVec = useMemo(() => new THREE.Vector3(px, py + CHEST_Y_OFFSET, pz), [px, py, pz]);
  const peakVec = useMemo(
    () => new THREE.Vector3(px, py + CHEST_Y_OFFSET + RISE_HEIGHT, pz),
    [px, py, pz],
  );
  const baseScale = WELL_REWARD_SCALE[type];

  useEffect(() => {
    if (groupRef.current) groupRef.current.position.copy(baseVec);
  }, [baseVec]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const model = modelRef.current;
    if (!group || !model) return;

    tRef.current += delta;
    const t = tRef.current - delay;
    if (t < 0) { group.visible = false; return; }
    group.visible = true;

    if (t < RISE_DUR) {
      group.position.lerpVectors(baseVec, peakVec, easeOut(t / RISE_DUR));
      model.scale.setScalar(baseScale);
    } else if (t < RISE_DUR + HANG_DUR) {
      group.position.copy(peakVec);
      group.position.y += Math.sin((t - RISE_DUR) * 10) * 0.03;
      model.scale.setScalar(baseScale);
    } else if (t < RESOURCE_GAIN_DUR) {
      if (!landCalledRef.current && t >= RESOURCE_GAIN_DUR - LAND_LEAD_SEC) {
        landCalledRef.current = true;
        onLand?.();
      }
      // Falls back down into the character, shrinking away as it "lands" --
      // easeIn (accelerating) rather than the rise's easeOut, so it reads as
      // being pulled in rather than gently placed down.
      const localT = (t - RISE_DUR - HANG_DUR) / DESCEND_DUR;
      const eased = easeIn(localT);
      group.position.lerpVectors(peakVec, baseVec, eased);
      model.scale.setScalar(baseScale * (1 - eased));
    } else if (!doneCalledRef.current) {
      if (!landCalledRef.current) {
        landCalledRef.current = true;
        onLand?.();
      }
      doneCalledRef.current = true;
      onDone?.();
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <primitive ref={modelRef} object={sceneClone} scale={baseScale} rotation={WELL_REWARD_ROTATION[type]} />
    </group>
  );
}
