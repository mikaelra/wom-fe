'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WellGlow } from '@/lib/gameEvents';

// A coloured glow that flashes under the well. On a win it's keyed to reward
// rarity (blue / purple / gold); when you choose the well but lose, a small red
// glow plays in the same spot. Common rewards pass no glow at all.
//
// The disc is mounted per-flash (cheap — meshes don't recompile shaders), but
// the soft light is a SINGLE persistent light mounted once by the scene and
// driven by `WellGlowLight`. Adding/removing a light at runtime would recompile
// every material's shader (the stutter we hit), so we never mount one per flash.

export type WellGlowColor = WellGlow | 'red';

export const WELL_GLOW_HEX: Record<WellGlowColor, string> = {
  blue:   '#3b82f6',
  purple: '#a855f7',
  gold:   '#fcd34d',
  red:    '#ef4444',
};

export const WELL_GLOW_DURATION = 1.5; // seconds
const DEFAULT_RADIUS = 1.5;            // disc radius under the well
const DEFAULT_BLINKS = 3;              // flashes over the duration

/** Flash envelope (0..1) at time `t` (seconds) for a glow that blinks `blinks`
 *  times over WELL_GLOW_DURATION, pulsing while decaying. Shared by the disc
 *  and the persistent light so they stay in sync. */
export function wellGlowEnvelope(t: number, blinks: number): number {
  if (t < 0 || t >= WELL_GLOW_DURATION) return 0;
  const decay = Math.max(0, 1 - t / WELL_GLOW_DURATION);
  const freq  = (2 * Math.PI * blinks) / WELL_GLOW_DURATION;
  const pulse = 0.55 + 0.45 * Math.sin(t * freq);
  return decay * pulse;
}

// ── Per-flash disc ────────────────────────────────────────────────────────────

type DiscProps = {
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
}: DiscProps) {
  const discRef  = useRef<THREE.Mesh>(null);
  const startRef = useRef<number | null>(null);
  const doneRef  = useRef(false);
  const hex = WELL_GLOW_HEX[color];

  useFrame(() => {
    if (startRef.current === null) startRef.current = performance.now() / 1000;
    const t = performance.now() / 1000 - startRef.current;
    const env = wellGlowEnvelope(t, blinks);

    if (discRef.current) {
      (discRef.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * env * intensity;
    }
    if (t >= WELL_GLOW_DURATION && !doneRef.current) {
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
    </group>
  );
}

// ── Persistent light ────────────────────────────────────────────────────────

export type ActiveGlow = {
  glow: WellGlowColor;
  /** performance.now() when the flash started. */
  startMs: number;
  intensity?: number;
  blinks?: number;
};

/** One always-mounted point light that tints the well during a flash. Mounted
 *  once by the scene; only its (uniform) intensity/colour change, so no shader
 *  recompilation ever happens. Pass the currently-active glows; it follows the
 *  most recently started one and idles at intensity 0 otherwise. */
export function WellGlowLight({ position, glows }: {
  position: [number, number, number];
  glows: ActiveGlow[];
}) {
  const ref = useRef<THREE.PointLight>(null);

  useFrame(() => {
    const light = ref.current;
    if (!light) return;

    // Follow the most recently started active glow.
    let active: ActiveGlow | null = null;
    for (const g of glows) {
      if (!active || g.startMs > active.startMs) active = g;
    }
    if (!active) { light.intensity = 0; return; }

    const t = performance.now() / 1000 - active.startMs / 1000;
    const env = wellGlowEnvelope(t, active.blinks ?? DEFAULT_BLINKS);
    light.intensity = 6 * env * (active.intensity ?? 1);
    light.color.set(WELL_GLOW_HEX[active.glow]);
  });

  return <pointLight ref={ref} intensity={0} distance={4} position={position} />;
}
