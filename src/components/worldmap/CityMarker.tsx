'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { City } from '@/lib/cities';
import { latLngToVec3 } from '@/lib/cities';
import { isLowQuality } from '@/lib/deviceQuality';

interface SwordPinProps { hovered: boolean }

function SwordPinFigure({ hovered }: SwordPinProps) {
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
    color: new THREE.Color('#6ec8ff'),
  }), [glowMap]);

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#4ae4ff'),
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  const pointLightObj = useMemo(() => {
    const l = new THREE.PointLight(new THREE.Color('#6ec8ff'), 2.5, 3.5, 2);
    return l;
  }, []);

  // Pre-created color targets — avoid per-frame allocations
  const blueColor  = useMemo(() => new THREE.Color('#6ec8ff'), []);
  const orangeColor = useMemo(() => new THREE.Color('#ff8800'), []);
  const blueRing   = useMemo(() => new THREE.Color('#4ae4ff'), []);
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
    spriteMat.color.lerp(hovered ? orangeColor : blueColor, rate);
    ringMat.color.lerp(hovered ? orangeRing : blueRing, rate);
    pointLightObj.color.lerp(hovered ? orangeColor : blueColor, rate);
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

interface CityMarkerProps {
  city: City;
  globeRadius: number;
  onClick: (city: City) => void;
  /** Raid info to display over Athens */
  raidInfo?: { secondsUntil: number | null; bossName?: string };
}

export default function CityMarker({ city, globeRadius, onClick, raidInfo }: CityMarkerProps) {
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
      <SwordPinFigure hovered={hovered} />

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
