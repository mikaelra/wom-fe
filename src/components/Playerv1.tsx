'use client';

import { memo, useEffect, useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// hades_v4.glb (the bossfight model) is Draco-compressed; other models loaded
// through this component are not, but GLTFLoader only invokes DRACOLoader when
// a file actually carries the KHR_draco_mesh_compression extension.
useGLTF.setDecoderPath('/draco/');

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

  // Set an initial "off-screen" position if animating (memoized for stable ref in useEffect deps).
  // Depends on the individual scalars rather than `position` itself since callers pass a
  // fresh array literal every render, which would defeat the memoization.
  /* eslint-disable react-hooks/exhaustive-deps */
  const initialPosition = useMemo(
    () => new THREE.Vector3(position[0], 50, position[2]),
    [position[0], position[2]]
  );
  // When dead the character tips onto its side; drop it 0.5 on Y so the fallen
  // pose settles toward the ground rather than floating.
  const deadYOffset = isDead ? -0.5 : 0;
  const targetPosition = useMemo(
    () => new THREE.Vector3(position[0], position[1] + deadYOffset, position[2]),
    [position[0], position[1], position[2], deadYOffset],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  // Once the model has converged on its target we stop moving it entirely, so
  // idle players cost nothing per frame. Reset whenever the target changes
  // (e.g. death drops the model by 0.5 on Y).
  const settledRef = useRef(false);
  useEffect(() => { settledRef.current = false; }, [targetPosition]);

  useFrame((_, delta) => {
    if (!isAnimating || settledRef.current || !modelRef.current) return;
    const pos = modelRef.current.position;
    // damp() is frame-rate independent (the old lerp(t, delta * 1.5) moved
    // faster on high-refresh displays); lambda 1.5 matches the old 60 fps feel.
    pos.x = THREE.MathUtils.damp(pos.x, targetPosition.x, 1.5, delta);
    pos.y = THREE.MathUtils.damp(pos.y, targetPosition.y, 1.5, delta);
    pos.z = THREE.MathUtils.damp(pos.z, targetPosition.z, 1.5, delta);
    if (pos.distanceToSquared(targetPosition) < 1e-6) {
      pos.copy(targetPosition);
      settledRef.current = true;
    }
  });

  useEffect(() => {
    // Set initial position when component mounts if we are animating
    if (isAnimating && modelRef.current) {
      modelRef.current.position.copy(initialPosition);
    }

    // No castShadow/receiveShadow here: no lobby/home Canvas enables shadow
    // maps, so the flags were dead weight.
    sceneClone.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.renderOrder = 10;
      }
    });
  }, [sceneClone, isAnimating, initialPosition]);

  // Death look: keep the character's texture but blend 50% gray into it and make
  // it 30% opaque, so a dead player reads as a faded ghost of themselves rather
  // than a flat gray statue. Materials are shared across scene.clone() instances,
  // so we clone before altering or every player on the same skin would fade too.
  // The original material is stashed per-mesh so the model restores if the player
  // comes back (e.g. a new round).
  useEffect(() => {
    sceneClone.traverse((obj: THREE.Object3D) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const orig = (obj.userData.origMaterial ?? obj.material) as
        | THREE.Material
        | THREE.Material[];
      obj.userData.origMaterial = orig;

      if (isDead) {
        const fade = (m: THREE.Material) => {
          const c = m.clone();
          c.transparent = true;
          c.opacity = 0.3;        // 30% opaque
          c.depthWrite = false;
          // Mix 50% mid-gray into the final shaded colour (keeps the texture).
          c.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <dithering_fragment>',
              '#include <dithering_fragment>\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 0.5 ), 0.5 );',
            );
          };
          c.needsUpdate = true;
          return c;
        };
        obj.material = Array.isArray(orig) ? orig.map(fade) : fade(orig);
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
      {...(isAnimating ? {} : { position: [position[0], position[1] + deadYOffset, position[2]] as [number, number, number] })}
      // On death, tip the character 90° onto its side (a fallen/knocked-over pose).
      rotation={isDead ? [rotation[0], rotation[1], rotation[2] + Math.PI / 2] : rotation}
    />
  );
}

export default memo(PlayerV1Impl);

// Preload the model for faster loading
useGLTF.preload('/models/playerv1.glb');