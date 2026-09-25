'use client';

import { useState } from 'react';
import * as THREE from 'three';
import { FreshHtml } from '@/components/hud/FreshHtml';
import { latLngToVec3 } from '@/lib/cities';

interface MerchantMarkerProps {
  lat: number;
  lng: number;
  globeRadius: number;
  onClick: () => void;
}

/**
 * The Merchant's ??? on the globe (docs/MERCHANT_PLAN.md). Same
 * position/orientation/hover mechanics as CityMarker.tsx (this file mirrors
 * it deliberately), but no GLTF pin model -- a glowing "???" label alone is
 * the whole marker, matching the encounter's mystery framing and avoiding a
 * second pin asset for something that only appears occasionally.
 *
 * WorldMap.tsx only mounts this when the current offer is available and
 * not yet bought this period -- this component itself does not know
 * anything about offers, only where to sit and what to do when clicked.
 */
export default function MerchantMarker({ lat, lng, globeRadius, onClick }: MerchantMarkerProps) {
  const [hovered, setHovered] = useState(false);

  const position = latLngToVec3(lat, lng, globeRadius);
  const up = new THREE.Vector3(...position).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

  return (
    <group
      position={position}
      quaternion={quaternion}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
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
      {/* A small point light so the marker reads as something standing on
          the globe, not just a floating label -- cheap, no glow texture. */}
      <pointLight color="#f5c542" intensity={hovered ? 2.2 : 1.4} distance={2.5} />

      <FreshHtml
        position={[0, 1.0, 0]}
        center
        distanceFactor={6}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          style={{
            color: '#f5c542',
            fontSize: hovered ? 32 : 26,
            fontWeight: 900,
            letterSpacing: '0.05em',
            WebkitTextStroke: '0.5px #000',
            textShadow: hovered
              ? '0 0 16px rgba(245,197,66,0.9), 0 0 4px rgba(0,0,0,0.9)'
              : '0 0 8px rgba(245,197,66,0.6), 0 0 4px rgba(0,0,0,0.9)',
            transition: 'font-size 0.2s, text-shadow 0.2s',
          }}
        >
          ???
        </div>
      </FreshHtml>
    </group>
  );
}
