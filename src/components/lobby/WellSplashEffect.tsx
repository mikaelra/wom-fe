'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Water splash that bursts up out of the well the moment a player wins it.
// Droplets launch upward + outward and arc back down under gravity while a flat
// ring expands across the well mouth.

const DROPLETS   = 26;
const DURATION   = 1.46;  // seconds -- scaled to 0.8x for a modest speedup
const GRAVITY    = -9;
const SPLASH_COLOR = '#bfe9ff';

type Props = {
  /** World-space well mouth the splash erupts from. */
  position: [number, number, number];
  onDone?: () => void;
};

export default function WellSplashEffect({ position, onDone }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  const ringRef   = useRef<THREE.Mesh>(null);
  const startRef  = useRef<number | null>(null);
  const doneRef   = useRef(false);

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(DROPLETS * 3);
    const velocities: [number, number, number][] = [];
    for (let i = 0; i < DROPLETS; i++) {
      const theta = Math.random() * Math.PI * 2;
      const spread = 0.6 + Math.random() * 1.4;      // outward speed
      const up     = 2.6 + Math.random() * 2.4;      // upward speed
      velocities.push([Math.cos(theta) * spread, up, Math.sin(theta) * spread]);
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }
    return { positions, velocities };
  }, []);

  useFrame((_, delta) => {
    if (startRef.current === null) startRef.current = performance.now() / 1000;
    const elapsed = performance.now() / 1000 - startRef.current;
    const k = Math.min(1, elapsed / DURATION);

    // Droplets: integrate velocity + gravity, shrink as they fade.
    const pts = pointsRef.current;
    if (pts) {
      const arr = pts.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < DROPLETS; i++) {
        velocities[i][1] += GRAVITY * delta;
        arr[i * 3]     += velocities[i][0] * delta;
        arr[i * 3 + 1] += velocities[i][1] * delta;
        arr[i * 3 + 2] += velocities[i][2] * delta;
      }
      pts.geometry.attributes.position.needsUpdate = true;
      if (pts.material instanceof THREE.PointsMaterial) {
        pts.material.size = 0.13 * (1 - k);
      }
    }

    // Ring: expand flat across the well mouth and fade out quickly.
    const ring = ringRef.current;
    if (ring) {
      const s = 0.3 + k * 2.2;
      ring.scale.set(s, s, s);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.6 * (1 - k * 1.3));
    }

    if (elapsed >= DURATION && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  });

  return (
    <group position={position}>
      <points ref={pointsRef} renderOrder={20}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.13}
          color={SPLASH_COLOR}
          transparent
          opacity={0.95}
          sizeAttenuation
          depthWrite={false}
        />
      </points>

      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={19}>
        <ringGeometry args={[0.45, 0.62, 32]} />
        <meshBasicMaterial
          color={SPLASH_COLOR}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
