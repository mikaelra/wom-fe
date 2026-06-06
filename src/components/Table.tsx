'use client';

import { useGLTF } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';
import { getQualityTier } from '@/lib/deviceQuality';

const isHighTier = getQualityTier() === 'high';
const WELL_MODEL = isHighTier ? '/models/well/well-hd.glb' : '/models/well/wellv02.glb';
const WELL_SCALE_MULTIPLIER = isHighTier ? 4 : 1;

type Props = {
  position?: [number, number, number];
  scale?: number;
  onClick?: () => void;
};

function Table({ position = [0, 0, 0], scale = 1, onClick }: Props) {
  const { scene } = useGLTF(WELL_MODEL);
  const sceneClone = useMemo(() => scene.clone(), [scene]);

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onClick?.();
  };

  return (
    <group
      position={position}
      scale={scale * WELL_SCALE_MULTIPLIER / 9.99}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
    >
      <primitive object={sceneClone} />
    </group>
  );
}

useGLTF.preload(WELL_MODEL);

export default Table;
