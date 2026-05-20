'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

useGLTF.preload('/models/shields/shield_animation-ld.glb');

type Props = {
  // When true renders in local player-group space (in front of the character).
  // When false renders at the given world position/rotation for impact shields.
  localSpace?: boolean;
  worldPosition?: [number, number, number];
  worldRotationY?: number;
};

export default function ShieldEffect({ localSpace = true, worldPosition, worldRotationY = 0 }: Props) {
  const { scene, animations } = useGLTF('/models/shields/shield_animation-ld.glb');
  const sceneClone = useMemo(() => scene.clone(), [scene]);
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useEffect(() => {
    const mixer = new THREE.AnimationMixer(sceneClone);
    animations.forEach((clip) =>
      mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play()
    );
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [sceneClone, animations]);

  useFrame((state, delta) => {
    mixerRef.current?.update(delta);
    if (groupRef.current && animations.length === 0) {
      // Subtle pulse when no built-in animation exists
      const s = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.04;
      groupRef.current.scale.setScalar(s);
    }
  });

  if (localSpace) {
    // In the player's local group: positive Z is toward the arena center (player "forward"),
    // so [0, 0.1, 0.35] places the shield in front of the character at chest height.
    return (
      <group ref={groupRef} position={[0, 0.1, 0.35]}>
        <primitive object={sceneClone} scale={0.45} />
      </group>
    );
  }

  return (
    <group
      ref={groupRef}
      position={worldPosition}
      rotation={[0, worldRotationY, 0]}
    >
      <primitive object={sceneClone} scale={0.45} />
    </group>
  );
}
