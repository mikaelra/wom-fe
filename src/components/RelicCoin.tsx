'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// No dedicated relic art exists yet -- reuses the Well's gold-reward coin
// model (see WellRewardEffect.tsx's WELL_REWARD_MODELS.gold), which is
// already loaded/cached for anyone who's played a match with a Well. Every
// relic renders the same coin regardless of power_category for now; a
// per-relic model is future work.
const COIN_MODEL_URL = '/models/well/rewards/gold-ld.glb';
// The model's own real-world dimensions aren't normalised for this framing
// (WellRewardEffect.tsx's WELL_REWARD_SCALE was tuned for its own far-away
// in-match camera, not this one) -- rather than guess a magic scale number,
// auto-fit the mesh's bounding box to this target size (world units, along
// its largest axis) and re-center it so it spins in place.
const TARGET_SIZE = 1.1;

function SpinningCoin() {
  const { scene } = useGLTF(COIN_MODEL_URL);
  const ref = useRef<THREE.Group>(null);

  const fittedScene = useMemo(() => {
    const clone = scene.clone();
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = TARGET_SIZE / maxDim;
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    return clone;
  }, [scene]);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.8;
  });

  return (
    <group ref={ref}>
      <primitive object={fittedScene} />
    </group>
  );
}

// A small, self-contained <Canvas> per card -- relic counts per player are
// low (a handful of distinct bosses at most), so this stays well under
// browsers' concurrent-WebGL-context limits. Revisit with a shared/View-based
// canvas if that stops being true.
export default function RelicCoin() {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 2.0], fov: 35 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 3, 2]} intensity={1.2} />
      <Suspense fallback={null}>
        <SpinningCoin />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload(COIN_MODEL_URL);
