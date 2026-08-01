'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// A persistent coloured glow (ground disc + soft point light) that fades in
// while a target is selected and fades out when it isn't -- unlike
// WellGlowEffect's reward flashes, this doesn't blink/decay on its own, it
// just tracks `active`. Used to mark the well / attack target / own player
// while that's the currently-chosen action, so the choice reads clearly in
// the 3D scene and not just on the 2D button.
//
// Always mounted (intensity driven to 0 when inactive) so toggling selection
// never adds/removes a light at runtime -- see WellGlowLight's comment for
// why that matters (adding/removing a light recompiles every material's
// shader, which is the stutter that pattern was built to avoid).

const FADE_RATE = 7;      // envelope lerp speed toward the active/inactive target
const PULSE_SPEED = 2.2;  // gentle breathing while active
const PULSE_DEPTH = 0.15;
const GRADIENT_TEXTURE_SIZE = 128;

// Soft radial-falloff sprite (bright center, fading to fully transparent at
// the rim) -- same createRadialGradient-onto-CanvasTexture technique as
// CityMarker's marker glow. Built once and shared by every gradient-mode
// SelectionGlow instance rather than per-mount, since it's colour-neutral
// (tinted via the material's `color`, not baked into the texture).
let sharedGradientTexture: THREE.Texture | null = null;
function getGradientTexture(): THREE.Texture {
  if (sharedGradientTexture) return sharedGradientTexture;
  const size = GRADIENT_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  sharedGradientTexture = new THREE.CanvasTexture(canvas);
  return sharedGradientTexture;
}

type SelectionGlowProps = {
  /** World-space anchor for the ground disc/light; yOffset shifts it down
   *  from that anchor so it sits at a character's feet rather than their
   *  center. */
  position: [number, number, number];
  yOffset?: number;
  color: string;
  active: boolean;
  radius?: number;
  intensity?: number;
  /** Soft center-bright/edge-fade falloff instead of a flat-opacity disc. */
  gradient?: boolean;
  /** Envelope lerp speed while rising toward active. Defaults to FADE_RATE. */
  fadeInRate?: number;
  /** Envelope lerp speed while falling toward inactive. Defaults to
   *  FADE_RATE -- lower it for an instance that should linger/decay more
   *  slowly than it rises (e.g. an impact flash: quick to peak, slow to
   *  fade), without touching every other SelectionGlow's timing. */
  fadeOutRate?: number;
};

export default function SelectionGlow({
  position,
  yOffset = 0,
  color,
  active,
  radius = 0.9,
  intensity = 4,
  gradient = false,
  fadeInRate = FADE_RATE,
  fadeOutRate = FADE_RATE,
}: SelectionGlowProps) {
  const discRef  = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const envRef   = useRef(0);
  const gradientTexture = useMemo(() => (gradient ? getGradientTexture() : null), [gradient]);

  useFrame((state, delta) => {
    const target = active ? 1 : 0;
    const rate = active ? fadeInRate : fadeOutRate;
    envRef.current += (target - envRef.current) * Math.min(1, rate * delta);
    const pulse = 1 - PULSE_DEPTH + PULSE_DEPTH * Math.sin(state.clock.elapsedTime * PULSE_SPEED);
    const env = envRef.current * pulse;

    if (discRef.current) {
      (discRef.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * env;
    }
    if (lightRef.current) {
      lightRef.current.intensity = intensity * env;
    }
  });

  return (
    <group position={[position[0], position[1] + yOffset, position[2]]}>
      <mesh ref={discRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={18}>
        {gradient ? <planeGeometry args={[radius * 2, radius * 2]} /> : <circleGeometry args={[radius, 40]} />}
        <meshBasicMaterial
          color={color}
          map={gradientTexture}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight ref={lightRef} color={color} intensity={0} distance={3.2} position={[0, 0.35, 0]} />
    </group>
  );
}
