'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// A fiery red glow that erupts under and around a character when a kill is made.
// It symbolises the killer's surge in ATK: a glowing disc on the ground plus a
// ring of flickering flame tongues licking up around them.
//
// Pure additive geometry — no per-instance lights — so mounting/unmounting many
// of these never triggers a material shader recompile (the stutter the well glow
// comment warns about). The scene mounts one per kill and removes it on `onDone`.

export const KILL_FIRE_DURATION = 1.8; // seconds

const RING_FLAMES = 9;          // flame tongues around the character
const RING_RADIUS = 0.42;       // how far out the flames sit
const DISC_RADIUS = 0.95;       // ground glow radius
const COLOR_HOT = new THREE.Color('#ffd24d');  // flame tip
const COLOR_COOL = new THREE.Color('#e01b00');  // flame base / disc

/** Flicker-and-fade envelope (0..1) over the effect's lifetime. Rises fast,
 *  burns, then dies down — shared so disc and flames stay in sync. */
function fireEnvelope(t: number): number {
  if (t < 0 || t >= KILL_FIRE_DURATION) return 0;
  const p = t / KILL_FIRE_DURATION;
  // Quick ignite (first 12%), long decay to nothing.
  const rise = Math.min(1, p / 0.12);
  const fall = 1 - Math.max(0, (p - 0.12) / 0.88);
  return rise * fall;
}

export type KillFireEffectProps = {
  /** World-space position under the character's feet. */
  position: [number, number, number];
  onDone?: () => void;
};

export default function KillFireEffect({ position, onDone }: KillFireEffectProps) {
  const groupRef = useRef<THREE.Group>(null);
  const discRef = useRef<THREE.Mesh>(null);
  const flameRefs = useRef<(THREE.Mesh | null)[]>([]);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  // Per-flame randomised phase/height so the ring flickers organically.
  const flames = useMemo(
    () =>
      Array.from({ length: RING_FLAMES }, (_, i) => {
        const angle = (i / RING_FLAMES) * Math.PI * 2;
        return {
          angle,
          x: Math.cos(angle) * RING_RADIUS,
          z: Math.sin(angle) * RING_RADIUS,
          phase: Math.random() * Math.PI * 2,
          speed: 7 + Math.random() * 5,
          height: 0.55 + Math.random() * 0.4,
        };
      }),
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

    flames.forEach((f, i) => {
      const mesh = flameRefs.current[i];
      if (!mesh) return;
      const flick = 0.55 + 0.45 * Math.sin(t * f.speed + f.phase);
      const intensity = env * flick;
      // Flames rise, taper and flicker in height.
      mesh.scale.set(
        0.5 + 0.5 * intensity,
        f.height * (0.45 + 0.85 * intensity),
        0.5 + 0.5 * intensity,
      );
      mesh.position.y = mesh.scale.y * 0.5;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.85 * intensity;
      // Hotter (yellow) at the peak of each flicker, cooler (red) at the base.
      mat.color.copy(COLOR_COOL).lerp(COLOR_HOT, flick * 0.7);
    });

    if (t >= KILL_FIRE_DURATION && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  });

  return (
    <group ref={groupRef} position={position}>
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

      {/* Ring of flickering flame tongues around the character */}
      {flames.map((f, i) => (
        <mesh
          key={i}
          ref={(m) => { flameRefs.current[i] = m; }}
          position={[f.x, 0, f.z]}
          renderOrder={19}
        >
          <coneGeometry args={[0.12, 1, 8]} />
          <meshBasicMaterial
            color={COLOR_COOL}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}
