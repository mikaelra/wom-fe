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
  color?: THREE.ColorRepresentation;
};

function Temple({
  url = '/models/temple.glb',
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color = '#D6D6D6',
}: Props) {
  const { scene } = useGLTF(url);

  // Skygger på + ensfarget materiale over hele modellen
  useEffect(() => {
    const tint = new THREE.Color(color);
    scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;

        const apply = (mat: THREE.Material) => {
          const m = mat.clone(); // klon for å unngå å endre delt materiale
          if ('color' in m && m.color instanceof THREE.Color) {
            m.color = tint.clone();
          }
          // fjern evt. teksturkart slik at fargen blir ren
          if ('map' in m) {
            (m as THREE.MeshStandardMaterial).map = null;
            m.needsUpdate = true; // tving shader-rekompilering når kartet fjernes
          }
          return m;
        };

        obj.material = Array.isArray(obj.material)
          ? obj.material.map(apply)
          : apply(obj.material);
      }
    });
  }, [scene, color]);

  return <primitive object={scene} scale={scale} position={position} rotation={rotation} />;
}

export default memo(Temple);

// Forhåndslaster modellen:
useGLTF.preload('/models/temple.glb');
