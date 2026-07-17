'use client';

import { Suspense, useRef, useMemo, useState, useEffect, memo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import CityMarker from './CityMarker';
import GlobeCrackleEffect from './GlobeCrackleEffect';
import { CITIES, latLngToVec3, type City } from '@/lib/cities';
import { STAR_CATALOG } from './starCatalog';

const GLOBE_RADIUS = 2.5;
const STAR_R = 50;
const PLANET_R = 46;
const RAD = Math.PI / 180;

// Axial tilt of the ecliptic relative to the celestial equator (J2000)
const OBLIQUITY = 23.436 * RAD;
// Ecliptic north pole in scene coordinates (RA=18h, Dec=66.564°)
// x = cos(Dec)·cos(RA=270°) = 0, y = sin(Dec) = cos(ε), z = −cos(Dec)·sin(270°) = sin(ε)
const ECLIPTIC_POLE = new THREE.Vector3(0, Math.cos(OBLIQUITY), Math.sin(OBLIQUITY));

// Observer at Earth centre (geocentric) — same as threejs-earth
const OBSERVER = new Astronomy.Observer(0, 0, 0);

// GMST in hours, used to align the earth texture with the real sky
export function gmstHours(date: Date): number {
  return Astronomy.SiderealTime(date);
}

// Computed once at module load — GMST drifts slowly enough (~0.004°/s) that
// a load-time snapshot stays in sync with the sky for the entire session.
// Shared by the Globe's texture rotation and CameraRig's Athens-facing
// direction so both agree on where Athens actually sits in world space.
const EARTH_ROTATION_Y = Math.PI + gmstHours(new Date()) * (Math.PI / 12);

// Retrograde = geocentric ecliptic longitude moving westward (decreasing) over
// time. Sample two points one hour apart and check the sign of Δlongitude,
// unwrapping the 0/360° seam.
function isRetrograde(body: Astronomy.Body, date: Date): boolean {
  const t1 = new Astronomy.AstroTime(date);
  const t2 = t1.AddDays(1 / 24);
  const lon1 = Astronomy.Ecliptic(Astronomy.GeoVector(body, t1, true)).elon;
  const lon2 = Astronomy.Ecliptic(Astronomy.GeoVector(body, t2, true)).elon;
  let d = lon2 - lon1;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d < 0;
}

// ── RA/Dec → THREE.Vector3 ─────────────────────────────────────────────────

function raDecToVec3(raHours: number, decDeg: number, radius: number): THREE.Vector3 {
  const ra  = raHours * (Math.PI / 12);
  const dec = decDeg * RAD;
  return new THREE.Vector3(
    radius * Math.cos(dec) * Math.cos(ra),
    radius * Math.sin(dec),
    -radius * Math.cos(dec) * Math.sin(ra),
  );
}

// ── Canvas sprite textures ─────────────────────────────────────────────────

function glowTex(color: string, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.00, '#ffffff');
  g.addColorStop(0.15, color);
  g.addColorStop(0.50, color);
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function sunTex(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.00, '#ffffff');
  g.addColorStop(0.20, '#fffde0');
  g.addColorStop(0.45, '#fff176');
  g.addColorStop(0.70, '#ffd740');
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// ── Fresnel atmosphere ─────────────────────────────────────────────────────

function makeFresnelMat() {
  return new THREE.ShaderMaterial({
    uniforms: {
      color1:       { value: new THREE.Color(0x0088ff) },
      color2:       { value: new THREE.Color(0x000000) },
      fresnelBias:  { value: 0.1 },
      fresnelScale: { value: 1.0 },
      fresnelPower: { value: 4.0 },
    },
    vertexShader: /* glsl */ `
      uniform float fresnelBias, fresnelScale, fresnelPower;
      varying float vReflectionFactor;
      void main() {
        vec4 mvPosition    = modelViewMatrix * vec4(position, 1.0);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vec3 worldNormal   = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal);
        vec3 I = worldPosition.xyz - cameraPosition;
        vReflectionFactor = fresnelBias + fresnelScale * pow(1.0 + dot(normalize(I), worldNormal), fresnelPower);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color1, color2;
      varying float vReflectionFactor;
      void main() {
        float f = clamp(vReflectionFactor, 0.0, 1.0);
        gl_FragColor = vec4(mix(color2, color1, vec3(f)), f);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

const jupiterTexturePath = (): string => '/textures/jupiter/jupiter2_1k.jpg';

// JPEG re-encode of MilkyWay-HD.png (12 MB → ~0.6 MB); the material ignores
// alpha, so nothing is lost.
const milkyWayTexturePath = (): string => '/textures/stars/MilkyWay-HD.jpg';

// Preload async textures early so they are likely cached by the time their
// phase is reached.
useTexture.preload('/textures/moon/moonmap1k.jpg');
useTexture.preload('/textures/sun/sunmap.jpg');
useTexture.preload('/textures/venus/venusmap.jpg');
useTexture.preload('/textures/mercury/mercurymap.jpg');
useTexture.preload('/textures/mercury/mercurybump.jpg');
useTexture.preload('/textures/mars/marsmap1k.jpg');
useTexture.preload('/textures/saturn/saturnmap.jpg');
useTexture.preload('/textures/saturn/saturnringcolor.jpg');
useTexture.preload('/textures/saturn/saturnringpattern.gif');
useTexture.preload('/textures/stars/circle.png');
useTexture.preload(jupiterTexturePath());

// ── Real starfield ─────────────────────────────────────────────────────────

const Starfield = memo(function Starfield() {
  const [circleTex, milkyWayTex] = useTexture([
    '/textures/stars/circle.png',
    milkyWayTexturePath(),
  ]);

  // Fixed: horizontal flip via repeat + offset so the Milky Way is no longer mirrored
  // (BackSide + sphere UVs cause the default image to appear flipped left↔right)
  useMemo(() => {
    milkyWayTex.wrapS = THREE.RepeatWrapping;
    milkyWayTex.wrapT = THREE.RepeatWrapping; // good practice
    milkyWayTex.repeat.x = -1;      // ← this un-mirrors the texture
    milkyWayTex.offset.x = 1;       // ← compensates for the flip (keeps your previous alignment)
    milkyWayTex.offset.y = 0;
    milkyWayTex.needsUpdate = true;
  }, [milkyWayTex]);

  // Reveal magnitude bands one at a time, brightest first.
  // Starts at 1 so the brightest band (index 0) shows immediately on mount.
  const [visibleBands, setVisibleBands] = useState(1);
  useEffect(() => {
    const timers = [
      setTimeout(() => setVisibleBands(2), 400),
      setTimeout(() => setVisibleBands(3), 800),
      setTimeout(() => setVisibleBands(4), 1200),
      setTimeout(() => setVisibleBands(5), 1600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const bandGeos = useMemo(() => {
    const BANDS = [
      { maxMag: 0.0, size: 0.55 },
      { maxMag: 1.5, size: 0.42 },
      { maxMag: 2.5, size: 0.30 },
      { maxMag: 3.0, size: 0.20 },
      { maxMag: Infinity, size: 0.13 },
    ];

    const MIN_MAG = -1.46,
      MAX_MAG = 3.54;
    const groups = BANDS.map(() => ({ verts: [] as number[], colors: [] as number[] }));

    for (const star of STAR_CATALOG) {
      const raH = star.ra[0] + star.ra[1] / 60;
      const pos = raDecToVec3(raH, star.dec, STAR_R);
      const bi = BANDS.findIndex((b) => star.mag <= b.maxMag);
      const intensity = 0.4 + 0.6 * (MAX_MAG - star.mag) / (MAX_MAG - MIN_MAG);
      groups[bi].verts.push(pos.x, pos.y, pos.z);
      groups[bi].colors.push(intensity, intensity, intensity);
    }

    return BANDS.map((band, i) => {
      const { verts, colors } = groups[i];
      if (verts.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      return { geo, size: band.size };
    });
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) groupRef.current.rotation.y -= 0.0002;
  });

  const milkyWayRef = useRef<THREE.Mesh>(null);

  // 1. Sirius unit vector (the axis we rotate around – never changes)
  const siriusVec = useMemo(() => {
    const siriusStar = STAR_CATALOG.find(
      (star) => Math.abs(star.mag + 1.46) < 0.01   // Sirius = mag ≈ -1.46
    );
    if (!siriusStar) {
      console.warn('Sirius not found in STAR_CATALOG');
      return new THREE.Vector3(0, 0, 1);
    }
    const raH = siriusStar.ra[0] + siriusStar.ra[1] / 60;
    return raDecToVec3(raH, siriusStar.dec, 1).normalize();
  }, []);

  // 2. Final quaternion = base alignment + exact 60° rotation around Sirius
  const milkyWayQuaternion = useMemo(() => {
    // Your original base rotation that already lands Sirius correctly
    const baseEuler = new THREE.Euler(
      -Math.PI / 25.8,
      -Math.PI / 1.3865,
      0,
      'XYZ'
    );
    const baseQ = new THREE.Quaternion().setFromEuler(baseEuler);

    // Exact 60° (π/3) twist around the Sirius axis
    // (Right-hand rule: positive = counter-clockwise when looking from outside toward center)
    const TWIST_ANGLE = -Math.PI / 2.55;          // ← 60 degrees exactly
    const twistQ = new THREE.Quaternion().setFromAxisAngle(siriusVec, TWIST_ANGLE);

    // Combine: apply base first, then twist around Sirius
    // (Sirius position stays perfectly fixed)
    return twistQ.multiply(baseQ);   // twist * base
  }, [siriusVec]);

  return (
    <group ref={groupRef}>
      <mesh
        ref={milkyWayRef}
        renderOrder={-1}
        quaternion={milkyWayQuaternion}   // ← this replaces the old rotation={...} prop
      >
        <sphereGeometry args={[STAR_R, 64, 64]} />
        <meshBasicMaterial
          map={milkyWayTex}
          side={THREE.BackSide}
          depthWrite={false}
          color={0x686868}
        />
      </mesh>

      {/* your points (bandGeos) stay 100% unchanged */}
      {bandGeos.map((band, i) =>
        band && i < visibleBands ? (
          <points key={i} geometry={band.geo}>
            <pointsMaterial
              size={band.size}
              vertexColors
              map={circleTex}
              transparent
              depthWrite={false}
              sizeAttenuation
            />
          </points>
        ) : null
      )}
    </group>
  );
});

// ── Moon mesh (separate component so it suspends independently) ────────────

function MoonBody({ position }: { position: THREE.Vector3 }) {
  const moonMap = useTexture('/textures/moon/moonmap1k.jpg');
  return (
    <mesh position={position}>
      <sphereGeometry args={[1.5, 32, 32]} />
      <meshPhongMaterial map={moonMap} />
    </mesh>
  );
}

// ── Sun mesh — bright sphere with an additive-blended texture overlay ─────
// Inner sphere holds the brightness; the outer textured shell only ADDS
// light, so the core stays bright and texture detail blooms on top.

function SunBody({ position }: { position: THREE.Vector3 }) {
  const sunMap = useTexture('/textures/sun/sunmap.jpg');
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[2, 32, 32]} />
        <meshBasicMaterial color={0xfff7c2} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.01, 64, 64]} />
        <meshBasicMaterial
          map={sunMap}
          transparent
          opacity={1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial
          color={0xf58e27}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Jupiter mesh — textured planet body ───────────────────────────────────

function JupiterBody({ position }: { position: THREE.Vector3 }) {
  const jupiterMap = useTexture(jupiterTexturePath());
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshPhongMaterial map={jupiterMap} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.64, 32, 32]} />
        <meshBasicMaterial
          color={0x008296}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Mercury mesh — textured planet body with bump map + amber glow shell ──

function MercuryBody({ position }: { position: THREE.Vector3 }) {
  const [mercuryMap, mercuryBump] = useTexture([
    '/textures/mercury/mercurymap.jpg',
    '/textures/mercury/mercurybump.jpg',
  ]);
  const retrograde = useMemo(() => isRetrograde(Astronomy.Body.Mercury, new Date()), []);
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.20, 32, 32]} />
        <meshPhongMaterial map={mercuryMap} bumpMap={mercuryBump} bumpScale={0.01} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshBasicMaterial
          color={retrograde ? 0xCE70FF : 0xDB9504}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Mars mesh — textured planet body with a red additive glow shell ──────

function MarsBody({ position }: { position: THREE.Vector3 }) {
  const marsMap = useTexture('/textures/mars/marsmap1k.jpg');
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshPhongMaterial map={marsMap} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshBasicMaterial
          color={0xFF0000}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Saturn mesh — body + glow shell + barely-visible alpha-masked rings ──
//
// Ring trick: default RingGeometry UVs are a flat projection, which mangles
// strip-style ring textures. We rewrite the UVs so U = radial position across
// the ring (0 at inner edge, 1 at outer) and V = 0.5. That wraps the strip
// radially the way the asset expects. The pattern GIF is bound as alphaMap so
// real ring divisions (gaps, density variations) come through for free; low
// opacity multiplies the whole thing down to a faint, atmospheric look.

function SaturnBody({ position }: { position: THREE.Vector3 }) {
  const [saturnMap, ringColor, ringAlpha] = useTexture([
    '/textures/saturn/saturnmap.jpg',
    '/textures/saturn/saturnringcolor.jpg',
    '/textures/saturn/saturnringpattern.gif',
  ]);

  const RING_INNER = 0.27;
  const RING_OUTER = 0.65;

  const ringGeo = useMemo(() => {
    const geo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 96, 1);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const u = (v.length() - RING_INNER) / (RING_OUTER - RING_INNER);
      geo.attributes.uv.setXY(i, u, 0.5);
    }
    geo.attributes.uv.needsUpdate = true;
    return geo;
  }, []);

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.20, 32, 32]} />
        <meshPhongMaterial map={saturnMap} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshBasicMaterial
          color={0xA16300}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={ringGeo} rotation={[-Math.PI / 2 + 10 * RAD, 0, 30 * RAD]}>
        <meshBasicMaterial
          map={ringColor}
          alphaMap={ringAlpha}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Venus mesh — textured planet body with a green additive glow shell ───

function VenusBody({ position }: { position: THREE.Vector3 }) {
  const venusMap = useTexture('/textures/venus/venusmap.jpg');
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshBasicMaterial map={venusMap} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshBasicMaterial
          color={0xAB9D00}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Sun directional light (always on, drifts with the sky) ────────────────
// Extracted from PlanetSprites so the Globe is lit before planets appear.

const _sunDriftQ  = new THREE.Quaternion();
const _sunDriftAx = new THREE.Vector3(0, 1, 0);
const SKY_DRIFT   = -0.0002;

function SunLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => new Date(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Sun, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);

  // Mirror the same Y-rotation the planet group applies each frame so the
  // light stays aligned with the sun sprite's world position.
  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={1.5}
      color={0xffffff}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Venus directional light (very weak, drifts with the sky) ──────────────

function VenusLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => new Date(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Venus, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={0.075}
      color={0xAB9D00}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Jupiter directional light (weak teal, drifts with the sky) ────────────

function JupiterLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => new Date(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Jupiter, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={0.1}
      color={0x008296}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Mercury directional light (weak amber, drifts with the sky) ──────────

function MercuryLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => new Date(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Mercury, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);
  const retrograde = useMemo(() => isRetrograde(Astronomy.Body.Mercury, now), [now]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={0.06}
      color={retrograde ? 0xCE70FF : 0xFFBC03}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Mars directional light (weak red, drifts with the sky) ───────────────

function MarsLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => new Date(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Mars, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={0.07}
      color={0xFF0000}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Saturn directional light (very weak amber, drifts with the sky) ──────

function SaturnLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => new Date(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Saturn, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={0.03}
      color={0xA16300}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Moon directional light (subtle purple, scales with lunar phase) ───────
// Intensity is 0.10 at new moon, 0.25 at full moon, linear in illuminated
// fraction. Computed once at mount — fine for a session-length scene.

function MoonLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => new Date(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Moon, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);
  const intensity = useMemo(() => {
    const illum = Astronomy.Illumination(Astronomy.Body.Moon, now);
    return 0.05 + 0.05 * illum.phase_fraction;
  }, [now]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={intensity}
      color={0xA300B5}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Planet sprites (progressive, inside a shared drifting group) ───────────
//
// phase mapping (matches WorldMap's outer phase counter):
//   2 → Moon   3 → Mercury   4 → Venus   5 → Sun sprite
//   6 → Mars   7 → Jupiter   8 → Saturn

const PlanetSprites = memo(function PlanetSprites({ phase }: { phase: number }) {
  const now      = useMemo(() => new Date(), []);
  const groupRef = useRef<THREE.Group>(null);

  const texSun   = useMemo(() => sunTex(),             []);
  const texMerc  = useMemo(() => glowTex('#ff9955'),   []);
  const texVenus = useMemo(() => glowTex('#aaffaa'),   []);
  const texMars  = useMemo(() => glowTex('#ff4422'),   []);
  const texJup   = useMemo(() => glowTex('#aaccff'),   []);
  const texSat   = useMemo(() => glowTex('#ddbb77'),   []);

  const eq = useMemo(() => ({
    moon: Astronomy.Equator(Astronomy.Body.Moon,    now, OBSERVER, false, true),
    merc: Astronomy.Equator(Astronomy.Body.Mercury, now, OBSERVER, false, true),
    ven:  Astronomy.Equator(Astronomy.Body.Venus,   now, OBSERVER, false, true),
    sun:  Astronomy.Equator(Astronomy.Body.Sun,     now, OBSERVER, false, true),
    mars: Astronomy.Equator(Astronomy.Body.Mars,    now, OBSERVER, false, true),
    jup:  Astronomy.Equator(Astronomy.Body.Jupiter, now, OBSERVER, false, true),
    sat:  Astronomy.Equator(Astronomy.Body.Saturn,  now, OBSERVER, false, true),
  }), [now]);

  const posMoon = useMemo(() => raDecToVec3(eq.moon.ra, eq.moon.dec, PLANET_R), [eq]);
  const posMerc = useMemo(() => raDecToVec3(eq.merc.ra, eq.merc.dec, PLANET_R), [eq]);
  const posVen  = useMemo(() => raDecToVec3(eq.ven.ra,  eq.ven.dec,  PLANET_R), [eq]);
  const posSun  = useMemo(() => raDecToVec3(eq.sun.ra,  eq.sun.dec,  PLANET_R), [eq]);
  const posMars = useMemo(() => raDecToVec3(eq.mars.ra, eq.mars.dec, PLANET_R), [eq]);
  const posJup  = useMemo(() => raDecToVec3(eq.jup.ra,  eq.jup.dec,  PLANET_R), [eq]);
  const posSat  = useMemo(() => raDecToVec3(eq.sat.ra,  eq.sat.dec,  PLANET_R), [eq]);

  useFrame(() => { if (groupRef.current) groupRef.current.rotation.y -= 0.0002; });

  return (
    <group ref={groupRef}>
      {phase >= 2 && (
        <Suspense fallback={null}>
          <MoonBody position={posMoon} />
        </Suspense>
      )}

      {phase >= 3 && (
        <>
          <Suspense fallback={null}>
            <MercuryBody position={posMerc} />
          </Suspense>
          <sprite position={posMerc} scale={[0.66, 0.66, 1]}>
            <spriteMaterial map={texMerc} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 4 && (
        <>
          <Suspense fallback={null}>
            <VenusBody position={posVen} />
          </Suspense>
          <sprite position={posVen} scale={[0.825, 0.825, 1]}>
            <spriteMaterial map={texVenus} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 5 && (
        <>
          <Suspense fallback={null}>
            <SunBody position={posSun} />
          </Suspense>
          <sprite position={posSun} scale={[8.0, 8.0, 1]}>
            <spriteMaterial map={texSun} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 6 && (
        <>
          <Suspense fallback={null}>
            <MarsBody position={posMars} />
          </Suspense>
          <sprite position={posMars} scale={[0.825, 0.825, 1]}>
            <spriteMaterial map={texMars} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 7 && (
        <>
          <Suspense fallback={null}>
            <JupiterBody position={posJup} />
          </Suspense>
          <sprite position={posJup} scale={[1.65, 1.65, 1]}>
            <spriteMaterial map={texJup} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 8 && (
        <>
          <Suspense fallback={null}>
            <SaturnBody position={posSat} />
          </Suspense>
          <sprite position={posSat} scale={[0.66, 0.66, 1]}>
            <spriteMaterial map={texSat} transparent depthWrite={false} />
          </sprite>
        </>
      )}
    </group>
  );
});

// ── Globe ──────────────────────────────────────────────────────────────────

interface GlobeProps {
  onCityClick: (city: City) => void;
  athensRaidInfo?: { secondsUntil: number | null; bossName?: string };
  onReady?: () => void;
}

function Globe({ onCityClick, athensRaidInfo, onReady }: GlobeProps) {
  const cloudsRef = useRef<THREE.Mesh>(null);

  // Epicenter for the crackle effect — Athens on the globe surface
  const athensEpicenter = useMemo(() => {
    const [x, y, z] = latLngToVec3(37.9838, -25, GLOBE_RADIUS);
    return new THREE.Vector3(x, y, z);
  }, []);

  // Always use 1k earth textures. Cloud textures are the same file in both
  // folders, so always pulled from high-res.
  const earthDir = 'low-res';
  const earthSuffix = '1k';
  const [earthMap, specularMap, bumpMap, lightsMap, cloudsMap, cloudsTrans] = useTexture([
    `/textures/earth/${earthDir}/00_earthmap${earthSuffix}.jpg`,
    `/textures/earth/${earthDir}/02_earthspec${earthSuffix}.jpg`,
    `/textures/earth/${earthDir}/01_earthbump${earthSuffix}.jpg`,
    `/textures/earth/${earthDir}/03_earthlights${earthSuffix}.jpg`,
    '/textures/earth/high-res/04_earthcloudmap.jpg',
    '/textures/earth/high-res/05_earthcloudmaptrans.jpg',
  ]);

  // Fires once after useTexture suspense resolves (textures are ready).
  useEffect(() => { onReady?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fresnelMat = useMemo(makeFresnelMat, []);

  const lightsMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      map: lightsMap,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    [lightsMap],
  );

  const cloudsMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      map: cloudsMap,
      alphaMap: cloudsTrans,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    [cloudsMap, cloudsTrans],
  );

  const geo = useMemo(() => new THREE.IcosahedronGeometry(GLOBE_RADIUS, 12), []);

  const earthRot = EARTH_ROTATION_Y;

  useFrame(() => { if (cloudsRef.current) cloudsRef.current.rotation.y += 0.000075; });

  return (
    <group rotation={[0, earthRot, 0]}>
      <mesh geometry={geo}>
        <meshPhongMaterial
          map={earthMap}
          specularMap={specularMap}
          bumpMap={bumpMap}
          bumpScale={0.04 * GLOBE_RADIUS}
        />
      </mesh>

      <mesh geometry={geo}>
        <primitive object={lightsMat} attach="material" />
      </mesh>

      <mesh ref={cloudsRef} geometry={geo} material={cloudsMat} scale={1.003} />

      <mesh geometry={geo} material={fresnelMat} scale={1.01} />

      {CITIES.map((city) => (
        <CityMarker
          key={city.id}
          city={city}
          globeRadius={GLOBE_RADIUS}
          onClick={onCityClick}
          raidInfo={city.name === 'Athens' ? athensRaidInfo : undefined}
        />
      ))}

      {/* Crackle electricity radiating from the sword's impact point */}
      <GlobeCrackleEffect epicenter={athensEpicenter} radius={GLOBE_RADIUS} />
    </group>
  );
}

// ── Camera: orbits along the ecliptic plane ───────────────────────────────
// camera.up = ecliptic north pole so OrbitControls autoRotates around that
// axis. We set it every frame because OrbitControls may re-enter its own
// spherical system and needs a consistent "up" to orbit in the ecliptic plane.
// The camera starts at the anti-solar point — the Sun is always on the
// ecliptic, so its opposite direction is too. At r=13 with the Sun at r=46
// in the same direction, the Sun is hidden behind the Earth and peeks out as
// the camera swings toward Athens, then begins its slow 360° pan.
// Sky drift: planets, stars, and ecliptic all rotate their groups by this
// delta every frame. The camera must apply the same rotation so it stays
// locked to the ecliptic plane as the sky drifts.
const _driftQ   = new THREE.Quaternion();
const _yAxis    = new THREE.Vector3(0, 1, 0);

const CAMERA_RADIUS = 13;
const INTRO_PAN_SECONDS = 5;

// Athens' world-space direction from the globe centre, on the same Y
// rotation the Globe applies to its texture — so the camera ends the intro
// pan looking straight down the line from itself through the origin to the
// sword marker, putting Athens dead-centre in frame.
const ATHENS_DIR = (() => {
  const athens = CITIES.find((c) => c.name === 'Athens')!;
  const [x, y, z] = latLngToVec3(athens.lat, athens.lng, 1);
  return new THREE.Vector3(x, y, z).applyAxisAngle(_yAxis, EARTH_ROTATION_Y).normalize();
})();

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function CameraRig({ onIntroPanEnd }: { onIntroPanEnd?: () => void }) {
  const { camera } = useThree();
  const initialized = useRef(false);
  const introDone = useRef(false);
  const introElapsed = useRef(0);
  const startDir = useRef(new THREE.Vector3());
  const panRotation = useRef(new THREE.Quaternion());

  useFrame((_, delta) => {
    if (!initialized.current) {
      const sunEq = Astronomy.Equator(Astronomy.Body.Sun, new Date(), OBSERVER, false, true);
      const sunDir = raDecToVec3(sunEq.ra, sunEq.dec, 1).normalize();
      startDir.current.copy(sunDir).multiplyScalar(-1);
      panRotation.current.setFromUnitVectors(startDir.current, ATHENS_DIR);
      camera.position.copy(startDir.current).multiplyScalar(CAMERA_RADIUS);
      camera.up.copy(ECLIPTIC_POLE);
      camera.lookAt(0, 0, 0);
      initialized.current = true;
      return;
    }

    if (!introDone.current) {
      introElapsed.current += delta;
      const t = Math.min(introElapsed.current / INTRO_PAN_SECONDS, 1);
      const q = new THREE.Quaternion().identity().slerp(panRotation.current, easeInOutCubic(t));
      camera.position.copy(startDir.current).applyQuaternion(q).multiplyScalar(CAMERA_RADIUS);
      camera.lookAt(0, 0, 0);
      if (t >= 1) {
        introDone.current = true;
        onIntroPanEnd?.();
      }
      return;
    }

    // Apply the same Y drift as the planet/ecliptic groups so the camera
    // stays in the ecliptic plane and orbits around the correct pole.
    _driftQ.setFromAxisAngle(_yAxis, SKY_DRIFT);
    camera.position.applyQuaternion(_driftQ);
    camera.up.applyQuaternion(_driftQ).normalize();
  });
  return null;
}

// ── WorldMap ───────────────────────────────────────────────────────────────
//
// Progressive load phases (staggered with timers so the UI stays responsive):
//   1 → Globe + SunLight
//   2 → Moon
//   3 → Mercury
//   4 → Venus
//   5 → Sun sprite
//   6 → Mars
//   7 → Jupiter
//   8 → Saturn
//   9 → Stars

interface WorldMapProps {
  onCityClick: (city: City) => void;
  athensRaidInfo?: { secondsUntil: number | null; bossName?: string };
}

export default function WorldMap({ onCityClick, athensRaidInfo }: WorldMapProps) {
  const [phase, setPhase] = useState(0);
  // Flips to true once Globe signals its textures have finished loading.
  // Planet timers only start after this so planets never appear before the earth.
  const [globeReady, setGlobeReady] = useState(false);
  // True until the 5s intro pan to Athens finishes; gates OrbitControls so
  // user input/autoRotate can't fight the scripted pan.
  const [introPanning, setIntroPanning] = useState(true);

  // Phase 1: mount the Globe immediately.
  useEffect(() => { setPhase(1); }, []);

  // Phases 2-9: stagger planets then stars, starting only after the Globe is ready.
  useEffect(() => {
    if (!globeReady) return;
    const timers = [
      setTimeout(() => setPhase(2), 200),
      setTimeout(() => setPhase(3), 400),
      setTimeout(() => setPhase(4), 600),
      setTimeout(() => setPhase(5), 800),
      setTimeout(() => setPhase(6), 1000),
      setTimeout(() => setPhase(7), 1200),
      setTimeout(() => setPhase(8), 1400),
      setTimeout(() => setPhase(9), 1600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [globeReady]);

  return (
    <>
      <CameraRig onIntroPanEnd={() => setIntroPanning(false)} />
      <color attach="background" args={['#070b15']} />
      {/* Raised from 0.05 so the dark side of the globe stays readable */}
      <ambientLight intensity={0.12} />

      {/* Always-on directional light so the Globe is lit from phase 1. */}
      {phase >= 1 && <SunLight />}
      {phase >= 2 && <MoonLight />}
      {phase >= 3 && <MercuryLight />}
      {phase >= 4 && <VenusLight />}
      {phase >= 6 && <MarsLight />}
      {phase >= 7 && <JupiterLight />}
      {phase >= 8 && <SaturnLight />}

      {/* Globe — wrapped in its own Suspense so it appears as soon as its
          textures are ready without waiting for moon/star textures. */}
      {phase >= 1 && (
        <Suspense fallback={null}>
          <Globe onCityClick={onCityClick} athensRaidInfo={athensRaidInfo} onReady={() => setGlobeReady(true)} />
        </Suspense>
      )}

      {/* Planets revealed one-by-one; each has its own Suspense so the moon
          texture doesn't block the canvas-generated planet sprites. */}
      {phase >= 1 && <PlanetSprites phase={phase} />}

      {/* Stars last */}
      {phase >= 9 && (
        <Suspense fallback={null}>
          <Starfield />
        </Suspense>
      )}

      <OrbitControls
        makeDefault
        enabled={!introPanning}
        enablePan={false}
        enableZoom
        minDistance={4}
        maxDistance={18}
        autoRotate={!introPanning}
        autoRotateSpeed={0.4}
        maxPolarAngle={Math.PI * 0.80}
        minPolarAngle={Math.PI * 0.10}
      />
    </>
  );
}

export { GLOBE_RADIUS };
