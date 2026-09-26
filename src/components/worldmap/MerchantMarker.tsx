'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { FreshHtml } from '@/components/hud/FreshHtml';
import { latLngToVec3 } from '@/lib/cities';
import { sphereDrop } from '@/lib/merchant';

/** One merchant's marker, as the globe page hands it to WorldMap. */
export interface MerchantMarkerSpec {
  /** `offer_id|event_key` -- stable per merchant, and what a click names. */
  key: string;
  lat: number;
  lng: number;
  /** Text (inner) and light colour: purple for the full moon's Merchant,
   *  the bigger planet's for a conjunction's (lib/merchant.ts
   *  merchantMarkerColors). */
  color: string;
  /** A conjunction's smaller planet: the text's outer colour, and the rim
   *  of light around the pool on the ground. null for the full moon. */
  outline: string | null;
  label: string;
}

interface MerchantMarkerProps {
  lat: number;
  lng: number;
  color: string;
  outline: string | null;
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
// A conjunction's light on the ground is concentric: a pool in the bigger
// planet's colour (a real point light, cut off at the pool's edge) inside a
// thinner rim in the smaller planet's colour. The rim is an additive glow
// band laid on the globe (a light can't make a ring -- it always falls off
// outward from a point).
const POOL_LIFT = 0.1;
const POOL_REACH = 0.55;
const RIM_INNER = 0.42;
const RIM_OUTER = 0.66;
const RIM_OPACITY = 0.55;

/** The rim: a ring bent onto the sphere, brightest mid-band and fading to
 *  nothing at both edges, so it reads as light rather than a painted
 *  ring. Added over the globe, never occluding it. */
function RimGlow({ color, globeRadius, hovered }: { color: string; globeRadius: number; hovered: boolean }) {
  const geometry = useMemo(() => {
    const geo = new THREE.RingGeometry(RIM_INNER, RIM_OUTER, 96, 6);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const fade = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      // A hair above the surface so it never z-fights the globe.
      pos.setY(i, 0.012 - sphereDrop(globeRadius, r));
      fade[i] = Math.sin(Math.PI * (r - RIM_INNER) / (RIM_OUTER - RIM_INNER));
    }
    geo.setAttribute('fade', new THREE.BufferAttribute(fade, 1));
    return geo;
  }, [globeRadius]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: RIM_OPACITY } },
        vertexShader: `
          attribute float fade;
          varying float vFade;
          void main() {
            vFade = fade;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vFade;
          void main() { gl_FragColor = vec4(uColor, uOpacity * vFade); }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [color],
  );
  material.uniforms.uOpacity.value = hovered ? RIM_OPACITY * 1.5 : RIM_OPACITY;

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} renderOrder={1} />;
}

export default function MerchantMarker({ lat, lng, color, outline, label, globeRadius, onClick }: MerchantMarkerProps) {
  const [hovered, setHovered] = useState(false);

  const position = latLngToVec3(lat, lng, globeRadius);
  const up = new THREE.Vector3(...position).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

  return (
    <group position={position} quaternion={quaternion}>
      {outline ? (
        <>
          <pointLight
            color={color}
            position={[0, POOL_LIFT, 0]}
            intensity={hovered ? 6.6 : 4.2}
            distance={POOL_REACH}
          />
          <RimGlow color={outline} globeRadius={globeRadius} hovered={hovered} />
        </>
      ) : (
        // The glow on the globe itself -- tripled radius/intensity from the
        // original so it reads from a distance, the label's colour.
        <pointLight color={color} intensity={hovered ? 6.6 : 4.2} distance={7.5} />
      )}

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
            // A conjunction's other planet rings the letters: a stroke
            // painted under the fill, so the fill keeps its full width and
            // the outer half of the stroke shows as the outer colour.
            fontSize: hovered ? 22 : 18,
            fontWeight: 900,
            letterSpacing: '0.05em',
            WebkitTextStroke: outline ? `3px ${outline}` : '0.5px #000',
            paintOrder: 'stroke fill',
            textShadow: hovered
              ? `0 0 10px ${outline ?? color}e6, 0 0 3px rgba(0,0,0,0.9)`
              : `0 0 6px ${outline ?? color}99, 0 0 3px rgba(0,0,0,0.9)`,
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
