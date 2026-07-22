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
//
// All spikes live in ONE BufferGeometry drawn with vertex colors (previously 33
// separate meshes + 33 materials = 34 draw calls per effect). The per-spike
// flicker is baked into the vertex positions/colors each frame; with additive
// blending, scaling a vertex color toward black fades that spike out, so no
// per-spike opacity is needed.

export const KILL_FIRE_DURATION = 2.18; // seconds -- scaled to 0.8x for a modest speedup

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

const COS_TILT = Math.cos(SPIKE_TILT);
const SIN_TILT = Math.sin(SPIKE_TILT);
const scratchColor = new THREE.Color();

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
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  // Per-spike randomised phase/speed/reach so the splash flickers organically,
  // plus one shared geometry holding every spike triangle.
  const { geometry, spikes } = useMemo(() => {
    const spikes = Array.from({ length: SPLASH_SPIKES }, (_, i) => {
      const angle = (i / SPLASH_SPIKES) * Math.PI * 2;
      return {
        cos: Math.cos(angle),
        sin: Math.sin(angle),
        phase: Math.random() * Math.PI * 2,
        speed: 7 + Math.random() * 5,
        reach: (0.5 + Math.random() * 0.45) / 3,
      };
    });
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(SPLASH_SPIKES * 9), 3);
    const colors = new THREE.BufferAttribute(new Float32Array(SPLASH_SPIKES * 9), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    colors.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    geometry.setAttribute('color', colors);
    // Static bound (spikes never reach past rim + max reach) so three.js never
    // recomputes it from the animated positions.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), DISC_RADIUS + 1);
    return { geometry, spikes };
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

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

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = geometry.attributes.color as THREE.BufferAttribute;
    const pa = posAttr.array as Float32Array;
    const ca = colAttr.array as Float32Array;

    for (let i = 0; i < SPLASH_SPIKES; i++) {
      const sp = spikes[i];
      const flick = 0.55 + 0.45 * Math.sin(t * sp.speed + sp.phase);
      const intensity = env * flick;
      // Spikes shoot outward (length) and flicker in reach; they stay flat.
      const len = sp.reach * (0.35 + 0.85 * intensity);
      const halfW = (SPIKE_WIDTH * (0.6 + 0.6 * flick)) / 2;

      // Triangle in the spike's local frame: base edge at the rim (x=R, z=±w/2),
      // tip tilted up/outward — then rotated around Y by the spike's angle.
      const tipX = SPIKE_INNER_R + len * COS_TILT;
      const tipY = 0.01 + len * SIN_TILT;
      const o = i * 9;
      pa[o]     = SPIKE_INNER_R * sp.cos - halfW * sp.sin;
      pa[o + 1] = 0.01;
      pa[o + 2] = -SPIKE_INNER_R * sp.sin - halfW * sp.cos;
      pa[o + 3] = SPIKE_INNER_R * sp.cos + halfW * sp.sin;
      pa[o + 4] = 0.01;
      pa[o + 5] = -SPIKE_INNER_R * sp.sin + halfW * sp.cos;
      pa[o + 6] = tipX * sp.cos;
      pa[o + 7] = tipY;
      pa[o + 8] = -tipX * sp.sin;

      // Hotter (yellow) at the peak of each flicker, cooler (red) at the base;
      // brightness (the old per-spike opacity) is premultiplied into the color.
      scratchColor.copy(COLOR_COOL).lerp(COLOR_HOT, flick * 0.7).multiplyScalar(0.85 * intensity);
      for (let v = 0; v < 3; v++) {
        ca[o + v * 3]     = scratchColor.r;
        ca[o + v * 3 + 1] = scratchColor.g;
        ca[o + v * 3 + 2] = scratchColor.b;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

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

      {/* All spikes in a single mesh — one draw call */}
      <mesh geometry={geometry} renderOrder={19}>
        <meshBasicMaterial
          vertexColors
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
