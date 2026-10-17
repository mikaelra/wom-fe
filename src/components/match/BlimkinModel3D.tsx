'use client';

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Blimkin in 3D, for Standard and High Definition (public/models/blimkin_v1.glb,
// made by scripts/make-blimkin-model.py on the thumbnails branch): the figure
// that comes out of the void with the message. Low Definition keeps his 8-bit
// picture instead (components/match/BlimkinCloud.tsx).

export const BLIMKIN_MODEL_URL = '/models/blimkin_v1.glb';

const FOV = 30;
/** The fraction of the frame his tallest side fills, as in his thumbnail. */
const FILL = 0.92;
/** Turned a little to his right, the way his thumbnail shows him. */
const YAW = (25 * Math.PI) / 180;

function Fitted() {
  const { scene } = useGLTF(BLIMKIN_MODEL_URL);
  const fitted = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const scale = 1 / (Math.max(size.x, size.y, size.z) || 1);
    clone.scale.setScalar(scale);
    clone.position.set(-centre.x * scale, -centre.y * scale, -centre.z * scale);
    return clone;
  }, [scene]);
  return (
    <group rotation={[0, YAW, 0]}>
      <primitive object={fitted} />
    </group>
  );
}

export default function BlimkinModel3D() {
  const distance = 1 / 2 / FILL / Math.tan((FOV * Math.PI) / 360);
  return (
    <Canvas
      camera={{ position: [0, 0.06, distance], fov: FOV }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      style={{ pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[-2, 3, 3]} intensity={2.4} />
      <directionalLight position={[3, 1, -2]} intensity={0.8} />
      <Suspense fallback={null}>
        <Fitted />
      </Suspense>
    </Canvas>
  );
}
