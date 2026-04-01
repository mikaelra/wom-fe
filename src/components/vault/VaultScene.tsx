'use client';

import { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const ICOSAHEDRON_RADIUS = 4;
const CAMERA_START_Z = 9;
const CAMERA_END_Z = 1.2;
const ANIM_DURATION = 3.5;

function Scene() {
  const { camera } = useThree();
  const startTime = useRef<number | null>(null);
  const animDone = useRef(false);

  useFrame(({ clock }) => {
    if (animDone.current) return;

    if (startTime.current === null) {
      startTime.current = clock.getElapsedTime();
    }

    const elapsed = clock.getElapsedTime() - startTime.current;
    const t = Math.min(elapsed / ANIM_DURATION, 1);

    // Ease-in-out cubic
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.z = THREE.MathUtils.lerp(CAMERA_START_Z, CAMERA_END_Z, eased);

    if (t >= 1) animDone.current = true;
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      {/* Outer blue directional light to illuminate the outside faces */}
      <directionalLight position={[5, 5, 8]} intensity={1.2} color="#4488ff" />
      {/* Inner gold point light to illuminate the inside once camera enters */}
      <pointLight position={[0, 0, 0]} intensity={3} color="#ffd700" distance={10} decay={2} />

      {/* Blue outer surface (front faces visible from outside) */}
      <mesh>
        <icosahedronGeometry args={[ICOSAHEDRON_RADIUS, 1]} />
        <meshStandardMaterial
          color="#1a55dd"
          side={THREE.FrontSide}
          metalness={0.3}
          roughness={0.5}
        />
      </mesh>

      {/* Gold inner surface (back faces visible from inside) */}
      <mesh>
        <icosahedronGeometry args={[ICOSAHEDRON_RADIUS, 1]} />
        <meshStandardMaterial
          color="#ffd700"
          side={THREE.BackSide}
          metalness={0.8}
          roughness={0.15}
          emissive="#a85e00"
          emissiveIntensity={0.4}
        />
      </mesh>
    </>
  );
}

export default function VaultScene() {
  return (
    <Canvas
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
      camera={{
        fov: 70,
        near: 0.1,
        far: 100,
        position: [0, 0, CAMERA_START_Z],
      }}
      gl={{ antialias: true }}
    >
      <Scene />
    </Canvas>
  );
}
