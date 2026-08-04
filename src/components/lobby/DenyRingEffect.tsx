'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Three red hoops that drop down over a denied player's body, one after
// another, from roughly head height down to their feet where they vanish.
// Driven by shared lobby state (`deny_target`/`deny_denier`), but only
// rendered for the denier and the denied player -- see LobbyScene.tsx's
// gating -- not for bystanders/spectators in the lobby.

export const DENY_RING_COUNT = 3;
const RING_STAGGER = 0.16;        // seconds between each ring's drop starting
const FALL_DURATION = 0.5;        // seconds each ring takes to fall head -> feet
export const DENY_RING_DURATION = RING_STAGGER * (DENY_RING_COUNT - 1) + FALL_DURATION;

const RING_RADIUS = 0.42;   // hoop radius — wide enough to encircle a player
const TUBE_RADIUS = 0.075;  // tube thickness — gives the hoop visible width + depth
const RING_COLOR = new THREE.Color('#ff1a1a');

const HEAD_Y_OFFSET = 1.0;   // where each ring starts, relative to the player's base position
const FEET_Y_OFFSET = 0.08;  // where each ring vanishes, just above the ground

/** Gravity-like fall: starts slow, accelerates toward the feet. */
function fallEase(p: number): number {
  return p * p;
}

export type DenyRingEffectProps = {
  /** World-space base (feet) position of the denied player. */
  position: [number, number, number];
  onDone?: () => void;
};

export default function DenyRingEffect({ position, onDone }: DenyRingEffectProps) {
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const geometry = useMemo(() => new THREE.TorusGeometry(RING_RADIUS, TUBE_RADIUS, 12, 32), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    if (startRef.current === null) startRef.current = performance.now() / 1000;
    const elapsed = performance.now() / 1000 - startRef.current;

    for (let i = 0; i < DENY_RING_COUNT; i++) {
      const ring = ringRefs.current[i];
      if (!ring) continue;
      const t = elapsed - i * RING_STAGGER;

      if (t < 0 || t >= FALL_DURATION) {
        ring.visible = false;
        continue;
      }
      ring.visible = true;
      const p = t / FALL_DURATION;
      ring.position.y = HEAD_Y_OFFSET + (FEET_Y_OFFSET - HEAD_Y_OFFSET) * fallEase(p);

      // Snap in, hold solid, then vanish sharply right as it reaches the feet.
      const fadeIn = Math.min(1, p / 0.15);
      const fadeOut = 1 - Math.max(0, (p - 0.82) / 0.18);
      const mat = ring.material as THREE.MeshStandardMaterial;
      mat.opacity = fadeIn * fadeOut;
    }

    if (elapsed >= DENY_RING_DURATION && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  });

  return (
    <group position={position}>
      {Array.from({ length: DENY_RING_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => { ringRefs.current[i] = el; }}
          geometry={geometry}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={19}
          visible={false}
        >
          <meshStandardMaterial
            color={RING_COLOR}
            emissive={RING_COLOR}
            emissiveIntensity={1.4}
            roughness={0.35}
            metalness={0.15}
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
