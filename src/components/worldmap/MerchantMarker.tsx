'use client';

import { useState } from 'react';
import * as THREE from 'three';
import { FreshHtml } from '@/components/hud/FreshHtml';
import { latLngToVec3 } from '@/lib/cities';

/** One merchant's marker, as the globe page hands it to WorldMap. */
export interface MerchantMarkerSpec {
  /** `offer_id|event_key` -- stable per merchant, and what a click names. */
  key: string;
  lat: number;
  lng: number;
  /** Text and light colour: purple for the full moon's Merchant, the blend
   *  of the two planets for a conjunction's (lib/merchant.ts). */
  color: string;
  label: string;
}

interface MerchantMarkerProps {
  lat: number;
  lng: number;
  color: string;
  label: string;
  globeRadius: number;
  onClick: () => void;
}

/**
 * A merchant's marker on the globe (docs/MERCHANT_PLAN.md) -- one per
 * merchant in town, each in its own colour. Position/
 * orientation mechanics mirror CityMarker.tsx, but there is no GLTF pin
 * model -- a glowing "Merchant" label alone is the whole marker, avoiding a
 * second pin asset for something that only appears occasionally.
 *
 * Labelled "Merchant", not "???": the marker stays up and clickable for
 * the whole trigger window regardless of whether this player has already
 * bought this period (WorldMap.tsx mounts it off `offer.active`, not
 * `offer.available`) -- a "???" reads as a mystery you haven't solved yet,
 * which stopped being true the moment you'd already traded here this moon.
 * The offer inside the scene, not the marker itself, is what goes
 * unavailable.
 *
 * Because there's no mesh, the click/hover target is the label itself, not
 * the group: FreshHtml's `pointerEvents: 'none'` convention exists so a
 * label's box doesn't steal clicks meant for a 3D object underneath it
 * (see its own docstring) -- CityMarker relies on that because its sword
 * model is the real target. There is no 3D object here for a group-level
 * onClick to raycast against, so the label is given `pointerEvents: 'auto'`
 * and handles the click/hover itself instead.
 */
export default function MerchantMarker({ lat, lng, color, label, globeRadius, onClick }: MerchantMarkerProps) {
  const [hovered, setHovered] = useState(false);

  const position = latLngToVec3(lat, lng, globeRadius);
  const up = new THREE.Vector3(...position).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

  return (
    <group position={position} quaternion={quaternion}>
      {/* The glow on the globe itself -- tripled radius/intensity from the
          original so it reads from a distance, the label's colour. */}
      <pointLight color={color} intensity={hovered ? 6.6 : 4.2} distance={7.5} />

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
            color,
            fontSize: hovered ? 22 : 18,
            fontWeight: 900,
            letterSpacing: '0.05em',
            WebkitTextStroke: '0.5px #000',
            textShadow: hovered
              ? `0 0 10px ${color}e6, 0 0 3px rgba(0,0,0,0.9)`
              : `0 0 6px ${color}99, 0 0 3px rgba(0,0,0,0.9)`,
            transition: 'font-size 0.2s, text-shadow 0.2s',
            cursor: 'pointer',
            pointerEvents: 'auto',
            userSelect: 'none',
          }}
        >
          {label}
        </div>
      </FreshHtml>
    </group>
  );
}
