'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { City } from '@/lib/cities';
import { latLngToVec3 } from '@/lib/cities';

interface CityMarkerProps {
  city: City;
  globeRadius: number;
  onClick: (city: City) => void;
}

export default function CityMarker({ city, globeRadius, onClick }: CityMarkerProps) {
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

      {/* Glowing sphere on top */}
      <mesh position={[0, 0.32, 0]}>
        <sphereGeometry args={[hovered ? 0.1 : 0.07, 16, 16]} />
        <meshStandardMaterial
          color={city.color}
          emissive={city.color}
          emissiveIntensity={hovered ? 2 : 1}
          toneMapped={false}
        />
      </mesh>

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
          }}
        >
          {city.name}
        </div>
      </Html>
    </group>
  );
}
