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

  // Animate the glow ring pulse
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
      {/* Pillar / pin */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 0.24, 8]} />
        <meshStandardMaterial color={city.color} emissive={city.color} emissiveIntensity={hovered ? 1.2 : 0.5} />
      </mesh>

      {/* Glowing sphere on top — replaced by gremlin figure for Gremlin's Lair */}
      {city.isGremlin ? (
        <GremlinPinFigure />
      ) : (
        <mesh position={[0, 0.32, 0]}>
          <sphereGeometry args={[hovered ? 0.1 : 0.07, 16, 16]} />
          <meshStandardMaterial
            color={city.color}
            emissive={city.color}
            emissiveIntensity={hovered ? 2 : 1}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Pulsing glow ring at base */}
      <mesh ref={glowRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.08, 0.14, 24]} />
        <meshBasicMaterial color={city.color} transparent opacity={hovered ? 0.7 : 0.35} side={THREE.DoubleSide} />
      </mesh>

      {/* Label (HTML overlay) */}
      <Html
        position={[0, 0.5, 0]}
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
