'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { City } from '@/lib/cities';
import { latLngToVec3 } from '@/lib/cities';
import { isLowQuality } from '@/lib/deviceQuality';

interface SwordPinProps {
  hovered: boolean;
  /** Impact glow theme (sprite/ring/point-light colour) — defaults to blue. */
  swordColor?: 'blue' | 'red';
}

const SWORD_GLOW_COLORS: Record<'blue' | 'red', { glow: string; ring: string }> = {
  blue: { glow: '#6ec8ff', ring: '#4ae4ff' },
  red:  { glow: '#ff4d4d', ring: '#ff2222' },
};

function SwordPinFigure({ hovered, swordColor = 'blue' }: SwordPinProps) {
  const { glow: glowHex, ring: ringHex } = SWORD_GLOW_COLORS[swordColor];
  const swordModel = isLowQuality() ? '/models/swords/sword_ld_v1.glb' : '/models/swords/sword_hd_v1.glb';
  const { scene } = useGLTF(swordModel, '/draco/');
  const clone = useMemo(() => scene.clone(), [scene]);
  const spriteRef = useRef<THREE.Sprite>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);

  const { yOffset, centerY, swordH } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clone);
    const sz = box.getSize(new THREE.Vector3());
    const off = -(box.min.y + sz.y * 0.3);
    return { yOffset: off, centerY: sz.y * 0.35, swordH: sz.y };
  }, [clone]);

  // White radial-gradient texture — material color controls the hue entirely
  const glowMap = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const h = 64;
    const g = ctx.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
    g.addColorStop(0.30, 'rgba(255, 255, 255, 0.7)');
    g.addColorStop(0.60, 'rgba(255, 255, 255, 0.25)');
    g.addColorStop(1.00, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);

  // Imperative materials — owned entirely by useFrame, no R3F reconciliation conflicts
  const spriteMat = useMemo(() => new THREE.SpriteMaterial({
    map: glowMap,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color(glowHex),
  }), [glowMap, glowHex]);

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(ringHex),
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), [ringHex]);

  const pointLightObj = useMemo(() => {
    const l = new THREE.PointLight(new THREE.Color(glowHex), 2.5, 3.5, 2);
    return l;
  }, [glowHex]);

  // Pre-created color targets — avoid per-frame allocations
  const baseColor  = useMemo(() => new THREE.Color(glowHex), [glowHex]);
  const orangeColor = useMemo(() => new THREE.Color('#ff8800'), []);
  const baseRing   = useMemo(() => new THREE.Color(ringHex), [ringHex]);
  const orangeRing = useMemo(() => new THREE.Color('#ff7700'), []);

  useEffect(() => () => {
    spriteMat.dispose();
    ringMat.dispose();
    glowMap.dispose();
  }, [spriteMat, ringMat, glowMap]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 1.0 + 0.18 * Math.sin(t * 2.8) + 0.06 * Math.sin(t * 7.1);

    if (spriteRef.current) {
      const s = swordH * 0.7 * pulse;
      spriteRef.current.scale.set(s, s, 1);
    }

    if (ringRef.current) {
      const rs = 1.0 + 0.3 * Math.sin(t * 3.5);
      ringRef.current.scale.setScalar(rs);
      ringMat.opacity = 0.45 + 0.3 * Math.sin(t * 3.5);
    }

    // Smooth color transition on hover (lerp rate ≈ 0.12 per frame → ~0.3 s transition at 60 fps)
    const rate = 0.12;
    spriteMat.color.lerp(hovered ? orangeColor : baseColor, rate);
    ringMat.color.lerp(hovered ? orangeRing : baseRing, rate);
    pointLightObj.color.lerp(hovered ? orangeColor : baseColor, rate);
    pointLightObj.intensity = THREE.MathUtils.lerp(
      pointLightObj.intensity,
      hovered ? 4.0 : 2.5,
      rate,
    );
  });

  return (
    <group>
      <primitive object={clone} position={[0, yOffset, 0]} />

      {/* Aura sprite centred on the visible portion of the sword */}
      <sprite ref={spriteRef} position={[0, centerY, 0]}>
        <primitive object={spriteMat} attach="material" />
      </sprite>

      {/* Pulsing impact ring at the globe surface */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.08, 0.2, 32]} />
        <primitive object={ringMat} attach="material" />
      </mesh>

      {/* Point light — tints nearby globe surface with the glow colour */}
      <primitive object={pointLightObj} />
    </group>
  );
}

useGLTF.preload(isLowQuality() ? '/models/swords/sword_ld_v1.glb' : '/models/swords/sword_hd_v1.glb', '/draco/');

/** Ranked-queue status to display over the New York marker, in place of the
 *  "Play Ranked" button that used to live in the overlay bar. */
export interface RankedLabelInfo {
  status: 'idle' | 'searching' | 'activeMatch';
  /** 1-3, cycling while `status === 'searching'`, for the animated "..." */
  searchingDots: number;
  activeMatchStarted?: boolean;
  activeMatchSecondsLeft?: number | null;
}

interface CityMarkerProps {
  city: City;
  globeRadius: number;
  onClick: (city: City) => void;
  /** Raid info to display over Athens */
  raidInfo?: { secondsUntil: number | null };
  /** Ranked-queue info to display over New York */
  rankedInfo?: RankedLabelInfo;
}

export default function CityMarker({ city, globeRadius, onClick, raidInfo, rankedInfo }: CityMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const position = latLngToVec3(city.lat, city.lng, globeRadius);

  // Compute an "up" direction from globe center so the marker stands normal to the surface
  const up = new THREE.Vector3(...position).normalize();

  // Orient the group so its local Y points away from globe center
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    up,
  );

  return (
    <group
      ref={groupRef}
      position={position}
      quaternion={quaternion}
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
      <SwordPinFigure hovered={hovered} swordColor={city.swordColor} />

      {/* Label (HTML overlay).
          Tried occlude="blending" here to fade the label out when its
          marker rotates to the far side of the globe -- reverted: broke the
          rest of the page's rendering on real devices (confirmed on both
          Safari and Firefox on a phone), not just caught by headless
          testing. Labels on the far side stay visible through the globe for
          now; that's a lesser issue than taking down the whole page. */}
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
          {/* Action label -- what clicking this marker does -- reads above
              the city name, bigger, wrapped in a pill so it reads as a
              button rather than plain text, with a white outline so it
              stands out as the primary call to action. */}
          {raidInfo && (
            <span
              style={{
                color: '#4da6ff',
                fontSize: hovered ? 22 : 18,
                fontWeight: 900,
                letterSpacing: '0.05em',
                WebkitTextStroke: '0.5px #fff',
                padding: '4px 14px',
                borderRadius: 999,
                background: 'rgba(77,166,255,0.18)',
                border: '2px solid #4da6ff',
                boxShadow: '0 0 10px rgba(77,166,255,0.5)',
                transition: 'font-size 0.2s',
              }}
            >
              Bossfight
            </span>
          )}
          {rankedInfo?.status === 'idle' && (
            <span
              style={{
                color: '#ff6666',
                fontSize: hovered ? 22 : 18,
                fontWeight: 900,
                letterSpacing: '0.05em',
                WebkitTextStroke: '0.5px #fff',
                padding: '4px 14px',
                borderRadius: 999,
                background: 'rgba(255,102,102,0.18)',
                border: '2px solid #ff6666',
                boxShadow: '0 0 10px rgba(255,102,102,0.5)',
                transition: 'font-size 0.2s',
              }}
            >
              Play Ranked
            </span>
          )}

          {raidInfo && raidInfo.secondsUntil !== null && raidInfo.secondsUntil > 0 && (
            <span style={{ color: '#ff9966', fontSize: hovered ? 11 : 8 }}>
              {Math.floor(raidInfo.secondsUntil / 60)}m {raidInfo.secondsUntil % 60}s
            </span>
          )}
          {rankedInfo?.status === 'searching' && (
            <span style={{ color: '#9fd8ff', fontSize: hovered ? 12 : 9, fontWeight: 800, letterSpacing: '0.05em' }}>
              Searching{'.'.repeat(rankedInfo.searchingDots)}
            </span>
          )}
          {rankedInfo?.status === 'activeMatch' && (
            <>
              <span style={{ color: '#ffcc00', fontSize: hovered ? 12 : 9, fontWeight: 800, letterSpacing: '0.05em' }}>
                Return to Match
              </span>
              <span style={{ color: rankedInfo.activeMatchStarted ? '#ff4444' : '#ff9966', fontSize: hovered ? 11 : 8, fontWeight: rankedInfo.activeMatchStarted ? 900 : 400 }}>
                {rankedInfo.activeMatchStarted
                  ? 'Game started!'
                  : rankedInfo.activeMatchSecondsLeft != null
                    ? `Starts in ${rankedInfo.activeMatchSecondsLeft}s`
                    : 'Starting soon…'}
              </span>
            </>
          )}
        </div>
      </Html>
    </group>
  );
}
