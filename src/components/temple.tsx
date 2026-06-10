'use client';

import { memo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Hvis du bruker Draco:
useGLTF.setDecoderPath('/draco/'); // kommenter ut hvis ikke Draco

type Props = {
  url?: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
};

function Temple({
  url = '/models/temple.glb',
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: Props) {
  const { scene } = useGLTF(url);

  // Valgfritt: slå på skygger hvis ønskelig
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

export default memo(Temple);

// Forhåndslaster modellen:
useGLTF.preload('/models/temple.glb');
