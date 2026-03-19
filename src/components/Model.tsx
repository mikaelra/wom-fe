'use client';

import { memo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

type Props = {
  url?: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
};

function ModelImpl({
  url = '/models/frogv01.glb',
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: Props) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [scene]);

  return <primitive object={scene} scale={scale} position={position} rotation={rotation} />;
}

export default memo(ModelImpl);

useGLTF.preload('/models/frogv01.glb');
