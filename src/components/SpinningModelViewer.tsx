'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Shared by RelicCoin (the relic-card coin) and the inventory Skins
// section's equipped-skin preview -- same auto-fit-and-spin treatment and
// lighting for both, so tuning one (e.g. brightness) can't drift the other
// out of sync.
const FOV = 35;
// Fraction of the frame's height the model's largest dimension should fill.
const FILL_RATIO = 0.75;

function cameraDistanceFor(targetSize: number): number {
  const halfFovRad = (FOV * Math.PI) / 360;
  const visibleHalfHeight = targetSize / 2 / FILL_RATIO;
  return visibleHalfHeight / Math.tan(halfFovRad);
}

type Props = {
  url: string;
  /** Target size (world units, along the model's largest axis) after auto-fit. */
  targetSize?: number;
  /** Radians/second of Y-axis spin. */
  spinSpeed?: number;
};

function FittedSpinningModel({ url, targetSize, spinSpeed }: Required<Props>) {
  const { scene } = useGLTF(url);
  const ref = useRef<THREE.Group>(null);

  // The model's own real-world dimensions aren't normalised for this framing
  // (e.g. WellRewardEffect.tsx's WELL_REWARD_SCALE was tuned for its own
  // far-away in-match camera, not this one) -- rather than guess a magic
  // scale number per model, auto-fit each mesh's bounding box to targetSize
  // and re-center it so it spins in place.
  const fittedScene = useMemo(() => {
    const clone = scene.clone();
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    return clone;
  }, [scene, targetSize]);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * spinSpeed;
  });

  return (
    <group ref={ref}>
      <primitive object={fittedScene} />
    </group>
  );
}

export default function SpinningModelViewer({ url, targetSize = 1.1, spinSpeed = 0.8 }: Props) {
  const distance = cameraDistanceFor(targetSize);
  return (
    <Canvas
      camera={{ position: [0, distance * 0.2, distance], fov: FOV }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 1, 1.5]} intensity={2.4} />
      <Suspense fallback={null}>
        <FittedSpinningModel url={url} targetSize={targetSize} spinSpeed={spinSpeed} />
      </Suspense>
    </Canvas>
  );
}
