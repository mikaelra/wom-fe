'use client';

import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { City } from '@/lib/cities';
import { latLngToVec3 } from '@/lib/cities';

// Gremlin GLB model that sits on top of the Gremlin's Lair pin
function GremlinPinFigure() {
  const { scene } = useGLTF('/models/gremlinv01.glb');
  const clone = useMemo(() => scene.clone(), [scene]);
  const ref = useRef<THREE.Group>(null!);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta * 2.5;
    if (ref.current) {
      ref.current.position.y = 0.28 + Math.sin(t.current) * 0.018;
      ref.current.rotation.y += delta * 0.8;
    }
  });

  return (
    <group ref={ref} position={[0, 0.28, 0]} scale={0.78}>
      <primitive object={clone} />
    </group>
  );
}

useGLTF.preload('/models/gremlinv01.glb');

// Sword model with light blue glow, standing straight out from the globe
function SwordPinFigure() {
  const { scene } = useGLTF('/models/swords/sword_ld_v1.glb');
  const clone = useMemo(() => scene.clone(), [scene]);
  const spriteRef = useRef<THREE.Sprite>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const { yOffset, centerY, swordH } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clone);
    const sz = box.getSize(new THREE.Vector3());
    // Shift so 30% of model height is below the globe surface (y = 0 in group space)
    const off = -(box.min.y + sz.y * 0.3);
    // Centre of the visible portion above the surface: from y=0 to y=0.7*sz.y
    const cY = sz.y * 0.35;
    return { yOffset: off, centerY: cY, swordH: sz.y };
  }, [clone]);

  // Radial-gradient canvas texture for the aura sprite
  const glowMap = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const h = 64;
    const g = ctx.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0.00, 'rgba(220, 245, 255, 1.0)');
    g.addColorStop(0.25, 'rgba(110, 200, 255, 0.7)');
    g.addColorStop(0.55, 'rgba( 50, 140, 255, 0.3)');
    g.addColorStop(1.00, 'rgba(  0,  80, 200, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Compound sine for organic pulsing
    const pulse = 1.0 + 0.18 * Math.sin(t * 2.8) + 0.06 * Math.sin(t * 7.1);
    if (spriteRef.current) {
      const s = swordH * 0.7 * pulse;
      spriteRef.current.scale.set(s, s, 1);
    }
    if (ringRef.current) {
      const rs = 1.0 + 0.3 * Math.sin(t * 3.5);
      ringRef.current.scale.setScalar(rs);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.45 + 0.3 * Math.sin(t * 3.5);
    }
  });

  return (
    <group>
      <primitive object={clone} position={[0, yOffset, 0]} />

      {/* Light blue aura sprite centred on the visible portion of the sword */}
      <sprite ref={spriteRef} position={[0, centerY, 0]}>
        <spriteMaterial
          map={glowMap}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {/* Pulsing impact ring at the globe surface */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.08, 0.2, 32]} />
        <meshBasicMaterial
          color="#4ae4ff"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Point light so nearby globe surface picks up the blue tint */}
      <pointLight color="#6ec8ff" intensity={2.5} distance={3.5} decay={2} />
    </group>
  );
}

useGLTF.preload('/models/swords/sword_ld_v1.glb');

interface CityMarkerProps {
  city: City;
  globeRadius: number;
  onClick: (city: City) => void;
  /** Raid info to display over Athens */
  raidInfo?: { secondsUntil: number | null; bossName?: string };
}

export default function CityMarker({ city, globeRadius, onClick, raidInfo }: CityMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const position = latLngToVec3(city.lat, city.lng, globeRadius);

  // Compute an "up" direction from globe center so the marker stands normal to the surface
  const up = new THREE.Vector3(...position).normalize();

  // Animate the glow ring pulse (only active when glowRef is attached — gremlin marker)
  useFrame(({ clock }) => {
    if (glowRef.current) {
      const s = 1 + 0.15 * Math.sin(clock.elapsedTime * 2 + city.id);
      glowRef.current.scale.set(s, s, s);
    }
  });

  // Orient the group so its local Y points away from globe center
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    up,
  );

  const markerScale = city.isGremlin ? 2 : 1;

  return (
    <group
      ref={groupRef}
      position={position}
      quaternion={quaternion}
      scale={markerScale}
      onClick={(e) => {
        e.stopPropagation();
        onClick(city);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      {city.isGremlin ? (
        <>
          {/* Pillar / pin */}
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.04, 0.06, 0.24, 8]} />
            <meshStandardMaterial color={city.color} emissive={city.color} emissiveIntensity={hovered ? 1.2 : 0.5} />
          </mesh>

          <GremlinPinFigure />

          {/* Pulsing glow ring at base */}
          <mesh ref={glowRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.08, 0.14, 24]} />
            <meshBasicMaterial color={city.color} transparent opacity={hovered ? 0.7 : 0.35} side={THREE.DoubleSide} />
          </mesh>
        </>
      ) : (
        <SwordPinFigure />
      )}

      {/* Label (HTML overlay) */}
      <Html
        position={[0, 1.0, 0]}
        center
        distanceFactor={6}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          style={{
            color: '#fff',
            fontSize: hovered ? 14 : 11,
            fontWeight: 700,
            textShadow: '0 0 6px rgba(0,0,0,0.9)',
            whiteSpace: 'nowrap',
            transition: 'font-size 0.2s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {city.name}
          {raidInfo && (
            <>
              <span style={{ color: '#ffcc00', fontSize: hovered ? 12 : 9, fontWeight: 800, letterSpacing: '0.05em' }}>
                {raidInfo.bossName ?? 'Hades'}
              </span>
              {raidInfo.secondsUntil !== null && raidInfo.secondsUntil > 0 ? (
                <span style={{ color: '#ff9966', fontSize: hovered ? 11 : 8 }}>
                  {Math.floor(raidInfo.secondsUntil / 60)}m {raidInfo.secondsUntil % 60}s
                </span>
              ) : raidInfo.secondsUntil === 0 ? (
                <span style={{ color: '#ff4444', fontSize: hovered ? 11 : 8, fontWeight: 900 }}>
                  RAID ACTIVE
                </span>
              ) : null}
            </>
          )}
        </div>
      </Html>
    </group>
  );
}
