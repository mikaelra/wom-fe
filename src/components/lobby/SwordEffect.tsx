'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

useGLTF.preload('/models/swords/sword_animation-ld.glb');

// Distance the sword hovers from the target while in "ready" or pre-strike state
const HOVER_DIST = 0.75;
// Strike animation timing (seconds) -- scaled to 0.8x for a modest speedup
export const STRIKE_DUR   = 0.34;
export const HOLD_DUR     = 0.26;
export const RETREAT_DUR  = 0.36;
export const BOUNCE_DUR   = 0.66;
// Peak height (world units) of the bounce-back arch above the straight line
const BOUNCE_ARCH_HEIGHT = 0.6;
// Number of end-over-end tumbles during the bounce
const BOUNCE_SPINS = 1.5;
// How far the blade pitches forward (nose-down, toward the target) over the
// course of the lunge, reaching full tilt exactly as the sword arrives.
const STRIKE_TILT_MAX = THREE.MathUtils.degToRad(60);

export type SwordEffectProps = {
  /** World-space position of the attacker (used to compute sword direction). */
  fromPosition: [number, number, number];
  /** World-space position of the target. */
  toPosition: [number, number, number];
  /** 'ready' – hovers near target (pre-round selection feedback).
   *  'execute' – plays the full strike sequence. */
  mode: 'ready' | 'execute';
  /** What the sword does after the hold phase:
   *  - 'retreat' (default): pull back to the hover position (normal successful hit)
   *  - 'stop':              stay at impact and end (blocked, no reflect)
   *  - 'bounce':            arch back to the attacker with a tumbling spin (blocked + reflected) */
  postImpact?: 'retreat' | 'stop' | 'bounce';
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
  postImpact = 'retreat',
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

  const { startPos, toVec, fromVec } = useMemo(() => {
    const f = new THREE.Vector3(fx, fy, fz);
    const t = new THREE.Vector3(tx, ty, tz);
    const dir = f.clone().sub(t).normalize();
    const start = t.clone().addScaledVector(dir, HOVER_DIST);
    return { startPos: start, toVec: t, fromVec: f };
  }, [fx, fy, fz, tx, ty, tz]);

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
      // Lunge toward target, pitching the blade forward as it closes the
      // distance so it reaches full 60° tilt right as it lands.
      const p = easeIn(t / STRIKE_DUR);
      group.position.lerpVectors(startPos, toVec, p);
      group.lookAt(toVec);
      group.rotateX(STRIKE_TILT_MAX * p);
    } else if (t < STRIKE_DUR + HOLD_DUR) {
      // Sword rests at impact point
      group.position.copy(toVec);
      if (!strikeCalledRef.current) {
        strikeCalledRef.current = true;
        onStrike?.();
      }
    } else if (postImpact === 'bounce' && t < STRIKE_DUR + HOLD_DUR + BOUNCE_DUR) {
      // Arch back toward the attacker after being blocked + reflected, tumbling end-over-end
      const localT = (t - STRIKE_DUR - HOLD_DUR) / BOUNCE_DUR;
      group.position.lerpVectors(toVec, fromVec, localT);
      group.position.y += BOUNCE_ARCH_HEIGHT * Math.sin(localT * Math.PI);
      // Face the destination, then tumble around the sword's local X axis
      group.rotation.set(0, 0, 0);
      group.lookAt(fromVec);
      group.rotateX(localT * Math.PI * 2 * BOUNCE_SPINS);
    } else if (postImpact === 'retreat' && t < STRIKE_DUR + HOLD_DUR + RETREAT_DUR) {
      // Retreat back to hover position (normal successful hit), unwinding the
      // forward tilt as it pulls back
      const p = easeOut((t - STRIKE_DUR - HOLD_DUR) / RETREAT_DUR);
      group.position.lerpVectors(toVec, startPos, p);
      group.lookAt(toVec);
      group.rotateX(STRIKE_TILT_MAX * (1 - p));
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
      {/* Y flip so the blade points toward the target after lookAt.
          The inner group spins 90° around the model's own Y axis so the
          rotation matches the ready-state orientation. */}
      <group rotation={[0, 0, 0]}>
        <group rotation={[0, Math.PI / 2, 0]}>
          <primitive object={sceneClone} scale={0.45} />
        </group>
      </group>
    </group>
  );
}
