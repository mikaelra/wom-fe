'use client';

import { useGLTF } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';

type Props = {
  position?: [number, number, number];
  scale?: number;
  onClick?: () => void;
};

function Table({ position = [0, 0, 0], scale = 1, onClick }: Props) {
  const { scene } = useGLTF('/models/wellv01.glb');
  const sceneClone = useMemo(() => scene.clone(), [scene]);

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onClick?.();
  };

  return (
    <group
      position={position}
      scale={scale / 3.33}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
    >
      <primitive object={sceneClone} />
    </group>
  );
}

useGLTF.preload('/models/wellv01.glb');

export default Table;
