'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// The instakill reward's signature burst: a bright core flash, an expanding
// shockwave ring, and a spray of outward-flying sparks. Same shape for both
// uses — recolored green for a kill (layered on top of the red damage blink)
// and blue for a block (in front of the shield that stopped it).
//
// Sparks share one BufferGeometry (matches the KillFireEffect pattern) so
// mounting/unmounting many of these never triggers a shader recompile.

export const INSTAKILL_BURST_DURATION = 0.85; // seconds -- scaled to 0.8x for a modest speedup
export const INSTAKILL_KILL_COLOR = '#2bff6a';
export const INSTAKILL_BLOCK_COLOR = '#2ec8ff';

const SPARK_COUNT = 22;
const CORE_MAX_SCALE = 1.1;
const RING_MAX_SCALE = 2.0;
// Overall burst size -- scales core, ring, and spark travel distance
// together (all nested under the same group below), so both the kill and
// block colourings (same component, different `color`) grow together.
const BURST_SCALE = 1.5;

/** Quick ignite, long decay — shared so the core/ring/sparks stay in sync. */
function burstEnvelope(t: number, duration: number): number {
  if (t < 0 || t >= duration) return 0;
  const p = t / duration;
  const rise = Math.min(1, p / 0.15);
  const fall = 1 - Math.max(0, (p - 0.15) / 0.85);
  return rise * fall;
}

export type InstakillBurstEffectProps = {
  position: [number, number, number];
  color: string;
  duration?: number;
  onDone?: () => void;
};

export default function InstakillBurstEffect({
  position,
  color,
  duration = INSTAKILL_BURST_DURATION,
  onDone,
}: InstakillBurstEffectProps) {
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const baseColor = useMemo(() => new THREE.Color(color), [color]);

  // Sparks fly outward into the upper hemisphere so they read against the
  // ground/character rather than burying themselves underneath.
  const { geometry, sparks } = useMemo(() => {
    const sparks = Array.from({ length: SPARK_COUNT }, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1) * 0.5;
      return {
        dir: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi) * 0.9 + 0.2,
          Math.sin(phi) * Math.sin(theta),
        ),
        speed: 1.4 + Math.random() * 1.3,
      };
    });
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3);
    const colors = new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    colors.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    geometry.setAttribute('color', colors);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 3);
    return { geometry, sparks };
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    if (startRef.current === null) startRef.current = performance.now() / 1000;
    const t = performance.now() / 1000 - startRef.current;
    const env = burstEnvelope(t, duration);
    const p = Math.min(1, Math.max(0, t / duration));

    if (coreRef.current) {
      const mat = coreRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.85 * env;
      coreRef.current.scale.setScalar(0.3 + p * CORE_MAX_SCALE);
    }
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.6 * env;
      ringRef.current.scale.setScalar(0.2 + p * RING_MAX_SCALE);
    }

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = geometry.attributes.color as THREE.BufferAttribute;
    const pa = posAttr.array as Float32Array;
    const ca = colAttr.array as Float32Array;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const sp = sparks[i];
      const dist = sp.speed * p;
      const o = i * 3;
      pa[o] = sp.dir.x * dist;
      pa[o + 1] = sp.dir.y * dist * 0.6;
      pa[o + 2] = sp.dir.z * dist;
      ca[o] = baseColor.r * env;
      ca[o + 1] = baseColor.g * env;
      ca[o + 2] = baseColor.b * env;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    if (t >= duration && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  });

  return (
    <group position={position} scale={BURST_SCALE}>
      <mesh ref={coreRef} renderOrder={21}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshBasicMaterial
          color={baseColor}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} renderOrder={21}>
        <ringGeometry args={[0.55, 0.72, 32]} />
        <meshBasicMaterial
          color={baseColor}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <points geometry={geometry} renderOrder={22}>
        <pointsMaterial
          vertexColors
          size={0.12}
          transparent
          depthTest={false}
          depthWrite={false}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
