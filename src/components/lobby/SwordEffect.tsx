'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

useGLTF.preload('/models/swords/sword_animation-ld.glb');

// Distance the sword hovers from the target while in "ready" or pre-strike state
const HOVER_DIST = 0.75;
// Strike animation timing (seconds)
const STRIKE_DUR  = 0.28;
const HOLD_DUR    = 0.22;
const RETREAT_DUR = 0.30;
const FLYBACK_DUR = 0.55;

export type SwordEffectProps = {
  /** World-space position of the attacker (used to compute sword direction). */
  fromPosition: [number, number, number];
  /** World-space position of the target. */
  toPosition: [number, number, number];
  /** 'ready' – hovers near target (pre-round selection feedback).
   *  'execute' – plays the full strike sequence. */
  mode: 'ready' | 'execute';
  /** After impact, fly back to this position (the attacker) if known. */
  flybackPosition?: [number, number, number];
  /** Called the frame the sword makes contact. */
  onStrike?: () => void;
  /** Called when the entire animation sequence finishes. */
  onDone?: () => void;
};

function easeIn(t: number)  { return t * t * t; }
function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }

export default function SwordEffect({
  fromPosition,
  toPosition,
  mode,
  flybackPosition,
  onStrike,
  onDone,
}: SwordEffectProps) {
  const { scene, animations } = useGLTF('/models/swords/sword_animation-ld.glb');
  const sceneClone = useMemo(() => scene.clone(), [scene]);
  const groupRef   = useRef<THREE.Group>(null);
  const mixerRef   = useRef<THREE.AnimationMixer | null>(null);
  const tRef       = useRef(0);
  const strikeCalledRef = useRef(false);
  const doneCalledRef   = useRef(false);

  const [fx, fy, fz] = fromPosition;
  const [tx, ty, tz] = toPosition;
  const [bx, by, bz] = flybackPosition ?? [0, 0, 0];
  const hasFlyback = !!flybackPosition;

  const { startPos, toVec, flybackVec } = useMemo(() => {
    const f = new THREE.Vector3(fx, fy, fz);
    const t = new THREE.Vector3(tx, ty, tz);
    const dir = f.clone().sub(t).normalize();
    const start = t.clone().addScaledVector(dir, HOVER_DIST);
    const fb = hasFlyback ? new THREE.Vector3(bx, by, bz) : null;
    return { startPos: start, toVec: t, flybackVec: fb };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx, fy, fz, tx, ty, tz, bx, by, bz, hasFlyback]);

  // Play the built-in strike animation only during execute mode
  useEffect(() => {
    if (mode !== 'execute' || !animations.length) return;
    const mixer = new THREE.AnimationMixer(sceneClone);
    animations.forEach((clip) => {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    });
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [sceneClone, animations, mode]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    mixerRef.current?.update(delta);
    const group = groupRef.current;

    if (mode === 'ready') {
      group.position.copy(startPos);
      group.position.y += Math.sin(state.clock.elapsedTime * 2.5) * 0.05;
      group.lookAt(toVec);
      return;
    }

    // ---- Execute mode: time-based phase machine ----
    tRef.current += delta;
    const t = tRef.current;

    if (t < STRIKE_DUR) {
      // Lunge toward target
      group.position.lerpVectors(startPos, toVec, easeIn(t / STRIKE_DUR));
      group.lookAt(toVec);
    } else if (t < STRIKE_DUR + HOLD_DUR) {
      // Sword rests at impact point
      group.position.copy(toVec);
      if (!strikeCalledRef.current) {
        strikeCalledRef.current = true;
        onStrike?.();
      }
    } else if (t < STRIKE_DUR + HOLD_DUR + RETREAT_DUR) {
      // Retreat back to hover position
      const p = easeOut((t - STRIKE_DUR - HOLD_DUR) / RETREAT_DUR);
      group.position.lerpVectors(toVec, startPos, p);
      if (!flybackVec) group.lookAt(toVec);
    } else if (flybackVec && t < STRIKE_DUR + HOLD_DUR + RETREAT_DUR + FLYBACK_DUR) {
      // Fly back to the attacker's position
      const p = easeIn((t - STRIKE_DUR - HOLD_DUR - RETREAT_DUR) / FLYBACK_DUR);
      group.position.lerpVectors(startPos, flybackVec, Math.min(1, p));
      group.lookAt(flybackVec);
    } else {
      // Done
      if (!doneCalledRef.current) {
        doneCalledRef.current = true;
        onDone?.();
      }
    }
  });

  return (
    <group ref={groupRef} position={[startPos.x, startPos.y, startPos.z]}>
      {/* 180° Y flip so the blade points toward the target after lookAt */}
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={sceneClone} scale={0.45} />
      </group>
    </group>
  );
}
