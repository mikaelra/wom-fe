'use client';

import { memo, useEffect, useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// If you are using Draco, you might need to set the decoder path
// useGLTF.setDecoderPath('/draco/');

type Props = {
  url?: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  isAnimating?: boolean;
  /** When true the model is desaturated to a lifeless gray (player eliminated). */
  isDead?: boolean;
};

function PlayerV1Impl({
  url = '/models/playerv1.glb', // Default model for PlayerV1
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  isAnimating = false,
  isDead = false,
}: Props) {
  const { scene } = useGLTF(url);
  const sceneClone = useMemo(() => scene.clone(), [scene]); // Each instance needs its own clone
  const modelRef = useRef<THREE.Group>(null!);

  // Set an initial "off-screen" position if animating (memoized for stable ref in useEffect deps)
  const initialPosition = useMemo(
    () => new THREE.Vector3(position[0], 50, position[2]),
    [position[0], position[2]]
  );
  const targetPosition = useMemo(() => new THREE.Vector3(...position), [position[0], position[1], position[2]]);

  useFrame((_, delta) => {
    if (isAnimating && modelRef.current) {
      // Smoothly interpolate the model's position towards the target
      modelRef.current.position.lerp(targetPosition, delta * 1.5);
    }
  });

  // Optional: enable shadows if desired
  useEffect(() => {
    // Set initial position when component mounts if we are animating
    if (isAnimating && modelRef.current) {
      modelRef.current.position.copy(initialPosition);
    }

    sceneClone.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.renderOrder = 10;
      }
    });
  }, [sceneClone, isAnimating, initialPosition]);

  // Death desaturation. Materials are shared across scene.clone() instances, so
  // we must clone the material before recolouring or every player on the same
  // skin would turn gray too. The original material is stashed per-mesh so the
  // model can be restored if the player comes back (e.g. a new round).
  useEffect(() => {
    sceneClone.traverse((obj: THREE.Object3D) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const orig = (obj.userData.origMaterial ?? obj.material) as
        | THREE.Material
        | THREE.Material[];
      obj.userData.origMaterial = orig;

      if (isDead) {
        const gray = (m: THREE.Material) => {
          const c = m.clone() as THREE.Material & {
            color?: THREE.Color;
            map?: THREE.Texture | null;
            emissive?: THREE.Color;
            emissiveMap?: THREE.Texture | null;
            vertexColors?: boolean;
            metalness?: number;
            roughness?: number;
          };
          c.map = null;
          c.emissiveMap = null;
          if (c.color) c.color.set('#6f6f6f');
          if (c.emissive) c.emissive.set('#000000');
          if ('vertexColors' in c) c.vertexColors = false;
          if ('metalness' in c) c.metalness = 0;
          if ('roughness' in c) c.roughness = 1;
          c.needsUpdate = true;
          return c;
        };
        obj.material = Array.isArray(orig) ? orig.map(gray) : gray(orig);
      } else {
        obj.material = orig;
      }
    });
  }, [sceneClone, isDead]);

  return (
    <primitive
      ref={modelRef}
      object={sceneClone}
      scale={scale}
      {...(isAnimating ? {} : { position })}
      rotation={rotation}
    />
  );
}

export default memo(PlayerV1Impl);

// Preload the model for faster loading
useGLTF.preload('/models/playerv1.glb');