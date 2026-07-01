'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// A fiery red burst that erupts under a character when a kill is made. It
// symbolises the killer's surge in ATK: a glowing disc on the ground with flat
// spikes splashing outward from its rim, like a shockwave/splash crown.
//
// Pure additive geometry — no per-instance lights — so mounting/unmounting many
// of these never triggers a material shader recompile (the stutter the well glow
// comment warns about). The scene mounts one per kill and removes it on `onDone`.

export const KILL_FIRE_DURATION = 1.8; // seconds

// ── Fine-tuning knobs ─────────────────────────────────────────────────────────
// Vertical offset of the whole effect relative to the character position it's
// spawned at. Negative moves it DOWN (toward the character's feet / the ground).
// Tweak this to line the splash up with the base of the character.
export const KILL_FIRE_Y_OFFSET = -0.5;

const SPLASH_SPIKES = 33;       // spikes radiating from the disc rim
const SPIKE_INNER_R = 0.75;     // where each spike's base sits (near the rim)
const SPIKE_WIDTH = 0.14 / 3;   // base width of each spike
const SPIKE_TILT = Math.PI / 6; // spikes angle upward 30° from the ground
const DISC_RADIUS = 0.95;       // ground glow radius
const COLOR_HOT = new THREE.Color('#ffd24d');  // spike tip / flare peak
const COLOR_COOL = new THREE.Color('#e01b00');  // spike base / disc

/** Flicker-and-fade envelope (0..1) over the effect's lifetime. Rises fast,
 *  burns, then dies down — shared so disc and spikes stay in sync. */
function fireEnvelope(t: number): number {
  if (t < 0 || t >= KILL_FIRE_DURATION) return 0;
  const p = t / KILL_FIRE_DURATION;
  // Quick ignite (first 12%), long decay to nothing.
  const rise = Math.min(1, p / 0.12);
  const fall = 1 - Math.max(0, (p - 0.12) / 0.88);
  return rise * fall;
}

export type KillFireEffectProps = {
  /** World-space position of the character; the splash is offset down from here
   *  by KILL_FIRE_Y_OFFSET. */
  position: [number, number, number];
  onDone?: () => void;
};

export default function KillFireEffect({ position, onDone }: KillFireEffectProps) {
  const discRef = useRef<THREE.Mesh>(null);
  const spikeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  // A unit spike: a flat triangle lying in the ground (XZ) plane, base at x=0
  // (width along Z) tapering to a tip at x=1. Scaled/rotated per spike below.
  const spikeGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([
        0, 0, -0.5,
        0, 0,  0.5,
        1, 0,  0,
      ]), 3),
    );
    g.setIndex([0, 1, 2]);
    return g;
  }, []);
  useEffect(() => () => spikeGeom.dispose(), [spikeGeom]);

  // Per-spike randomised phase/speed/reach so the splash flickers organically.
  const spikes = useMemo(
    () =>
      Array.from({ length: SPLASH_SPIKES }, (_, i) => ({
        angle: (i / SPLASH_SPIKES) * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 7 + Math.random() * 5,
        reach: (0.5 + Math.random() * 0.45) / 3,
      })),
    [],
  );

  useFrame(() => {
    if (startRef.current === null) startRef.current = performance.now() / 1000;
    const t = performance.now() / 1000 - startRef.current;
    const env = fireEnvelope(t);

    if (discRef.current) {
      const mat = discRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.8 * env;
      const s = 0.7 + 0.3 * env;
      discRef.current.scale.set(s, s, s);
    }

    spikes.forEach((sp, i) => {
      const mesh = spikeRefs.current[i];
      if (!mesh) return;
      const flick = 0.55 + 0.45 * Math.sin(t * sp.speed + sp.phase);
      const intensity = env * flick;
      // Spikes shoot outward (length) and flicker in reach; they stay flat.
      mesh.scale.set(sp.reach * (0.35 + 0.85 * intensity), 1, SPIKE_WIDTH * (0.6 + 0.6 * flick));
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.85 * intensity;
      // Hotter (yellow) at the tip of each flicker, cooler (red) at the base.
      mat.color.copy(COLOR_COOL).lerp(COLOR_HOT, flick * 0.7);
    });

    if (t >= KILL_FIRE_DURATION && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  });

  return (
    <group position={[position[0], position[1] + KILL_FIRE_Y_OFFSET, position[2]]}>
      {/* Ground glow disc */}
      <mesh ref={discRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={18}>
        <circleGeometry args={[DISC_RADIUS, 48]} />
        <meshBasicMaterial
          color={COLOR_COOL}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Flat spikes splashing outward from the rim of the disc */}
      {spikes.map((sp, i) => (
        <group key={i} rotation={[0, sp.angle, 0]}>
          <mesh
            ref={(m) => { spikeRefs.current[i] = m; }}
            geometry={spikeGeom}
            position={[SPIKE_INNER_R, 0.01, 0]}
            rotation={[0, 0, SPIKE_TILT]}
            renderOrder={19}
          >
            <meshBasicMaterial
              color={COLOR_COOL}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
