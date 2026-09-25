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
 * The Merchant's ??? on the globe (docs/MERCHANT_PLAN.md). Position/
 * orientation mechanics mirror CityMarker.tsx, but there is no GLTF pin
 * model -- a glowing "???" label alone is the whole marker, matching the
 * encounter's mystery framing and avoiding a second pin asset for
 * something that only appears occasionally.
 *
 * Because there's no mesh, the click/hover target is the label itself, not
 * the group: FreshHtml's `pointerEvents: 'none'` convention exists so a
 * label's box doesn't steal clicks meant for a 3D object underneath it
 * (see its own docstring) -- CityMarker relies on that because its sword
 * model is the real target. There is no 3D object here for a group-level
 * onClick to raycast against, so the label is given `pointerEvents: 'auto'`
 * and handles the click/hover itself instead.
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
    <group position={position} quaternion={quaternion}>
      {/* The glow on the globe itself -- tripled radius/intensity from the
          original so it reads from a distance, purple to match the label. */}
      <pointLight color="#a855f7" intensity={hovered ? 6.6 : 4.2} distance={7.5} />

      <FreshHtml position={[0, 1.0, 0]} center distanceFactor={6}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          style={{
            // Same size as a city's actionLabel pill text (CityMarker.tsx,
            // e.g. Athens' "GREECE") -- this label just isn't in a pill.
            color: '#a855f7',
            fontSize: hovered ? 22 : 18,
            fontWeight: 900,
            letterSpacing: '0.05em',
            WebkitTextStroke: '0.5px #000',
            textShadow: hovered
              ? '0 0 10px rgba(168,85,247,0.9), 0 0 3px rgba(0,0,0,0.9)'
              : '0 0 6px rgba(168,85,247,0.6), 0 0 3px rgba(0,0,0,0.9)',
            transition: 'font-size 0.2s, text-shadow 0.2s',
            cursor: 'pointer',
            pointerEvents: 'auto',
            userSelect: 'none',
          }}
        >
          ???
        </div>
      </FreshHtml>
    </group>
  );
}
