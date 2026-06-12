'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WellGlow } from '@/lib/parseWellReward';

// A coloured glow that flashes under the well. On a win it's keyed to reward
// rarity (blue / purple / gold); when you choose the well but lose, a small red
// glow plays in the same spot. Common rewards pass no glow at all.

export type WellGlowColor = WellGlow | 'red';

const GLOW_HEX: Record<WellGlowColor, string> = {
  blue:   '#3b82f6',
  purple: '#a855f7',
  gold:   '#fcd34d',
  red:    '#ef4444',
};

const DURATION = 1.5;        // seconds
const DEFAULT_RADIUS = 1.5;  // disc radius under the well
const DEFAULT_BLINKS = 3;    // flashes over the duration

type Props = {
  /** World-space position under the well (disc lies flat here). */
  position: [number, number, number];
  color: WellGlowColor;
  /** Disc radius; defaults to the full rarity-glow size. */
  radius?: number;
  /** Brightness multiplier (1 = full); used to dim the red loss glow. */
  intensity?: number;
  /** Number of flashes over the duration. */
  blinks?: number;
  onDone?: () => void;
};

export default function WellGlowEffect({
  position,
  color,
  radius = DEFAULT_RADIUS,
  intensity = 1,
  blinks = DEFAULT_BLINKS,
  onDone,
}: Props) {
  const discRef  = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const startRef = useRef<number | null>(null);
  const doneRef  = useRef(false);
  const hex = GLOW_HEX[color];
  const freq = (2 * Math.PI * blinks) / DURATION;

  useFrame(() => {
    if (startRef.current === null) startRef.current = performance.now() / 1000;
    const t = performance.now() / 1000 - startRef.current;

    // Flashing envelope: pulses while decaying over the duration.
    const decay = Math.max(0, 1 - t / DURATION);
    const pulse = 0.55 + 0.45 * Math.sin(t * freq);
    const env   = decay * pulse;

    if (discRef.current) {
      (discRef.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * env * intensity;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 6 * env * intensity;
    }

    if (t >= DURATION && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  });

  return (
    <group position={position}>
      {/* Flat glowing disc on the ground beneath the well */}
      <mesh ref={discRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={18}>
        <circleGeometry args={[radius, 48]} />
        <meshBasicMaterial
          color={hex}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Soft light so the glow tints the well itself */}
      <pointLight ref={lightRef} color={hex} intensity={0} distance={4} position={[0, 0.4, 0]} />
    </group>
  );
}
