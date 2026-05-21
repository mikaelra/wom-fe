'use client';

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';

useGLTF.preload('/models/shields/shield_animation-ld.glb');

type Props = {
  localSpace?: boolean;
  worldPosition?: [number, number, number];
  worldRotationY?: number;
};

export default function ShieldEffect({ localSpace = true, worldPosition, worldRotationY = 0 }: Props) {
  const { scene } = useGLTF('/models/shields/shield_animation-ld.glb');
  const sceneClone = useMemo(() => scene.clone(), [scene]);

  if (localSpace) {
    return (
      <group position={[0, 0.1, 0.35]}>
        <primitive object={sceneClone} scale={0.45} />
      </group>
    );
  }

  return (
    <group position={worldPosition} rotation={[0, worldRotationY, 0]}>
      <primitive object={sceneClone} scale={0.45} />
    </group>
  );
}
