'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * A campfire in front of the signpost (docs/CITY_SCENE_PLAN.md §5.2).
 *
 * It exists to solve a lighting problem, not a decorating one. After sunset
 * the scene's key light goes out with the Sun -- correctly, since the sky is
 * the real sky -- and the signpost, the one thing a player must be able to
 * read, went down with it. A fire is the honest fix: a warm local source at
 * ground level, close enough to pick the post and its arms out of the dark
 * without lighting the whole bay.
 *
 * Procedural, like the Senate placeholder and the signpost itself (§9 lists
 * the art still to be made). Primitives that are obviously provisional beat
 * a stock model that quietly becomes permanent. Swap the meshes for a GLB
 * without touching the light or the flicker.
 *
 * Everything is built upward from local y = 0, so the caller positions it on
 * whatever counts as the ground.
 */

const RING_RADIUS = 1.05;
const STONE_COUNT = 9;
const LOG_COUNT = 4;
const LOG_LENGTH = 1.6;

const STONE = '#7c7368';
const LOG = '#4a3220';

/** Peak intensity of the fire's light at full night. Point lights here are
 *  physically weighted (candela), so this is larger than a legacy 0-1
 *  intensity would be; it reaches the signpost 3 units away and falls off
 *  well before the buildings. */
const LIGHT_PEAK = 34;

export default function Campfire({
  position = [0, 0, 0],
  /** 0 (full day) to 1 (fully dark). The fire burns either way -- a fire in
   *  daylight is still a fire -- but it only contributes light worth having
   *  once the Sun has stopped doing the job. */
  nightness = 1,
}: {
  position?: [number, number, number];
  nightness?: number;
}) {
  const lightRef = useRef<THREE.PointLight>(null);
  const flameRef = useRef<THREE.Group>(null);

  // Deterministic scatter: the same fire every visit, and no Math.random in
  // a render path.
  const stones = useMemo(
    () => Array.from({ length: STONE_COUNT }, (_, i) => {
      const a = (i / STONE_COUNT) * Math.PI * 2;
      const wobble = Math.sin(i * 12.9898) * 0.5 + 0.5;
      return {
        position: [
          Math.cos(a) * RING_RADIUS,
          0.1 + wobble * 0.06,
          Math.sin(a) * RING_RADIUS,
        ] as [number, number, number],
        scale: 0.2 + wobble * 0.14,
        rotation: [wobble * 2, a, wobble] as [number, number, number],
      };
    }),
    [],
  );

  const logs = useMemo(
    () => Array.from({ length: LOG_COUNT }, (_, i) => {
      const a = (i / LOG_COUNT) * Math.PI * 2 + 0.4;
      // Leaned inward into a teepee, the way a fire is actually laid.
      return {
        position: [Math.cos(a) * 0.34, 0.42, Math.sin(a) * 0.34] as [number, number, number],
        rotation: [Math.cos(a) * 0.42, -a, Math.sin(a) * 0.42 + 0.32] as [number, number, number],
      };
    }),
    [],
  );

  useFrame(({ clock }) => {
    // Two incommensurate sines: it never visibly repeats, and it costs
    // nothing next to real noise.
    const t = clock.elapsedTime;
    const flicker = 1 + 0.13 * Math.sin(t * 11.3) + 0.07 * Math.sin(t * 17.7 + 1.1);

    if (lightRef.current) lightRef.current.intensity = LIGHT_PEAK * nightness * flicker;
    if (flameRef.current) {
      flameRef.current.scale.set(1, flicker, 1);
      flameRef.current.rotation.y = t * 0.6;
    }
  });

  return (
    <group position={position}>
      {stones.map((stone, i) => (
        <mesh key={i} position={stone.position} rotation={stone.rotation} scale={stone.scale}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={STONE} roughness={0.95} flatShading />
        </mesh>
      ))}

      {logs.map((log, i) => (
        <mesh key={i} position={log.position} rotation={log.rotation}>
          <cylinderGeometry args={[0.11, 0.13, LOG_LENGTH, 7]} />
          <meshStandardMaterial color={LOG} roughness={0.9} flatShading />
        </mesh>
      ))}

      {/* Flames. Additively blended and depth-write-free so they read as
          light rather than as orange plastic, and unlit (basic, not
          standard) because a flame emits rather than receives. */}
      <group ref={flameRef} position={[0, 0.5, 0]}>
        <mesh position={[0, 0.34, 0]}>
          <coneGeometry args={[0.46, 1.15, 10]} />
          <meshBasicMaterial
            color="#ff7a18" transparent opacity={0.62}
            blending={THREE.AdditiveBlending} depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <coneGeometry args={[0.28, 0.78, 10]} />
          <meshBasicMaterial
            color="#ffd24a" transparent opacity={0.85}
            blending={THREE.AdditiveBlending} depthWrite={false}
          />
        </mesh>
      </group>

      {/* Sits at flame height, not on the ground, or the signpost is lit
          from below like a stage ghost. */}
      <pointLight
        ref={lightRef}
        position={[0, 0.9, 0]}
        color="#ff9440"
        distance={30}
        decay={1.7}
        intensity={LIGHT_PEAK * nightness}
      />
    </group>
  );
}
