'use client';

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import CityMarker from './CityMarker';
import { CITIES, type City } from '@/lib/cities';
import { STAR_CATALOG } from './starCatalog';

const GLOBE_RADIUS = 2.5;
const STAR_R = 50;
const PLANET_R = 46;
const RAD = Math.PI / 180;

// Observer at Earth centre (geocentric) — same as threejs-earth
const OBSERVER = new Astronomy.Observer(0, 0, 0);

// GMST in hours, used to align the earth texture with the real sky
export function gmstHours(date: Date): number {
  return Astronomy.SiderealTime(date);
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

function moonTex(phase: number, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const r = size * 0.42, cx = size / 2, cy = size / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();
  const k  = Math.cos(phase * 2 * Math.PI);
  const cp = (4 / 3) * r;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  if (phase < 0.5) {
    ctx.moveTo(cx, cy - r);
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.bezierCurveTo(cx + k * cp, cy + r, cx + k * cp, cy - r, cx, cy - r);
  } else {
    ctx.moveTo(cx, cy - r);
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, true);
    ctx.bezierCurveTo(cx - k * cp, cy + r, cx - k * cp, cy - r, cx, cy - r);
  }
  ctx.fillStyle = '#d4d0b8';
  ctx.fill();
  ctx.restore();
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

// ── Real starfield ─────────────────────────────────────────────────────────

function Starfield() {
  const circleTex = useTexture('/textures/stars/circle.png');

  const bandGeos = useMemo(() => {
    const BANDS = [
      { maxMag: 0.0,       size: 0.55 },
      { maxMag: 1.5,       size: 0.42 },
      { maxMag: 2.5,       size: 0.30 },
      { maxMag: 3.0,       size: 0.20 },
      { maxMag: Infinity,  size: 0.13 },
    ];
    const MIN_MAG = -1.46, MAX_MAG = 3.54;
    const groups = BANDS.map(() => ({ verts: [] as number[], colors: [] as number[] }));

    for (const star of STAR_CATALOG) {
      const raH = star.ra[0] + star.ra[1] / 60;
      const pos = raDecToVec3(raH, star.dec, STAR_R);
      const bi  = BANDS.findIndex(b => star.mag <= b.maxMag);
      const intensity = 0.4 + 0.6 * (MAX_MAG - star.mag) / (MAX_MAG - MIN_MAG);
      groups[bi].verts.push(pos.x, pos.y, pos.z);
      groups[bi].colors.push(intensity, intensity, intensity);
    }

    return BANDS.map((band, i) => {
      const { verts, colors } = groups[i];
      if (verts.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
      return { geo, size: band.size };
    });
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => { if (groupRef.current) groupRef.current.rotation.y -= 0.0002; });

  return (
    <group ref={groupRef}>
      {bandGeos.map((band, i) =>
        band ? (
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
        ) : null,
      )}
    </group>
  );
}

// ── Planets + sun-tracking directional light ───────────────────────────────

function PlanetsAndLight() {
  const now = useMemo(() => new Date(), []);

  const sunSprite = useRef<THREE.Sprite>(null);
  const lightRef  = useRef<THREE.DirectionalLight>(null);
  const groupRef  = useRef<THREE.Group>(null);
  const _worldPos = useMemo(() => new THREE.Vector3(), []);

  const texSun   = useMemo(() => sunTex(),             []);
  const texMerc  = useMemo(() => glowTex('#ff9955'),   []);
  const texVenus = useMemo(() => glowTex('#aaffaa'),   []);
  const texMars  = useMemo(() => glowTex('#ff4422'),   []);
  const texJup   = useMemo(() => glowTex('#aaccff'),   []);
  const texSat   = useMemo(() => glowTex('#ddbb77'),   []);

  const moonPhase = useMemo(() => Astronomy.MoonPhase(now) / 360, [now]);
  const texMoon   = useMemo(() => moonTex(moonPhase),              [moonPhase]);

  const eq = useMemo(() => ({
    sun:  Astronomy.Equator(Astronomy.Body.Sun,     now, OBSERVER, false, true),
    moon: Astronomy.Equator(Astronomy.Body.Moon,    now, OBSERVER, false, true),
    merc: Astronomy.Equator(Astronomy.Body.Mercury, now, OBSERVER, false, true),
    ven:  Astronomy.Equator(Astronomy.Body.Venus,   now, OBSERVER, false, true),
    mars: Astronomy.Equator(Astronomy.Body.Mars,    now, OBSERVER, false, true),
    jup:  Astronomy.Equator(Astronomy.Body.Jupiter, now, OBSERVER, false, true),
    sat:  Astronomy.Equator(Astronomy.Body.Saturn,  now, OBSERVER, false, true),
  }), [now]);

  const posSun  = useMemo(() => raDecToVec3(eq.sun.ra,  eq.sun.dec,  PLANET_R), [eq]);
  const posMoon = useMemo(() => raDecToVec3(eq.moon.ra, eq.moon.dec, PLANET_R), [eq]);
  const posMerc = useMemo(() => raDecToVec3(eq.merc.ra, eq.merc.dec, PLANET_R), [eq]);
  const posVen  = useMemo(() => raDecToVec3(eq.ven.ra,  eq.ven.dec,  PLANET_R), [eq]);
  const posMars = useMemo(() => raDecToVec3(eq.mars.ra, eq.mars.dec, PLANET_R), [eq]);
  const posJup  = useMemo(() => raDecToVec3(eq.jup.ra,  eq.jup.dec,  PLANET_R), [eq]);
  const posSat  = useMemo(() => raDecToVec3(eq.sat.ra,  eq.sat.dec,  PLANET_R), [eq]);

  useFrame(() => {
    if (sunSprite.current && lightRef.current) {
      sunSprite.current.getWorldPosition(_worldPos);
      lightRef.current.position.copy(_worldPos);
    }
    if (groupRef.current) groupRef.current.rotation.y -= 0.0002;
  });

  return (
    <>
      {/* Reduced from 3.5 — was clipping highlights and obscuring texture detail.
          The cloud layer (AdditiveBlending) amplified the lit side further. */}
      <directionalLight ref={lightRef} intensity={1.5} color={0xffffff} />
      <group ref={groupRef}>
        <sprite ref={sunSprite} position={posSun} scale={[8.0, 8.0, 1]}>
          <spriteMaterial map={texSun} transparent depthWrite={false} />
        </sprite>

        <sprite position={posMoon} scale={[3.2, 3.2, 1]}>
          <spriteMaterial map={texMoon} transparent depthWrite={false} />
        </sprite>

        <sprite position={posMerc} scale={[0.66, 0.66, 1]}>
          <spriteMaterial map={texMerc} transparent depthWrite={false} />
        </sprite>

        <sprite position={posVen} scale={[0.825, 0.825, 1]}>
          <spriteMaterial map={texVenus} transparent depthWrite={false} />
        </sprite>

        <sprite position={posMars} scale={[0.825, 0.825, 1]}>
          <spriteMaterial map={texMars} transparent depthWrite={false} />
        </sprite>

        <sprite position={posJup} scale={[1.65, 1.65, 1]}>
          <spriteMaterial map={texJup} transparent depthWrite={false} />
        </sprite>

        <sprite position={posSat} scale={[0.66, 0.66, 1]}>
          <spriteMaterial map={texSat} transparent depthWrite={false} />
        </sprite>
      </group>
    </>
  );
}

// ── Globe ──────────────────────────────────────────────────────────────────

interface GlobeProps {
  onCityClick: (city: City) => void;
  athensRaidInfo?: { secondsUntil: number | null; bossName?: string };
}

function Globe({ onCityClick, athensRaidInfo }: GlobeProps) {
  const cloudsRef = useRef<THREE.Mesh>(null);

  const [earthMap, specularMap, bumpMap, lightsMap, cloudsMap, cloudsTrans] = useTexture([
    '/textures/00_earthmap1k.jpg',
    '/textures/02_earthspec1k.jpg',
    '/textures/01_earthbump1k.jpg',
    '/textures/03_earthlights1k.jpg',
    '/textures/04_earthcloudmap.jpg',
    '/textures/05_earthcloudmaptrans.jpg',
  ]);

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
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    [cloudsMap, cloudsTrans],
  );

  const geo = useMemo(() => new THREE.IcosahedronGeometry(GLOBE_RADIUS, 12), []);

  const earthRot = useMemo(() => Math.PI + gmstHours(new Date()) * (Math.PI / 12), []);

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
    </group>
  );
}

// ── Camera: orbits along the ecliptic plane ───────────────────────────────
// camera.up = ecliptic north pole so OrbitControls autoRotates around that
// axis, keeping the camera on (or near) the ecliptic as it pans 360°.
// After a user drag the orbit continues on whatever small-circle path the
// camera was left at, which is the "new path" the user asked for.

function CameraRig() {
  const { camera } = useThree();
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    const obliquity = 23.436 * RAD;
    // Ecliptic north pole in scene equatorial coords (RA=18h, Dec=66.56°)
    camera.up.set(0, Math.cos(obliquity), Math.sin(obliquity));
    // Start at the vernal-equinox direction — on the ecliptic, equatorial plane
    camera.position.set(13, 0, 0);
    camera.lookAt(0, 0, 0);
    done.current = true;
  });
  return null;
}

// ── WorldMap ───────────────────────────────────────────────────────────────

interface WorldMapProps {
  onCityClick: (city: City) => void;
  athensRaidInfo?: { secondsUntil: number | null; bossName?: string };
}

export default function WorldMap({ onCityClick, athensRaidInfo }: WorldMapProps) {
  return (
    <>
      <CameraRig />
      <color attach="background" args={['#070b15']} />
      {/* Raised from 0.05 so the dark side of the globe stays readable */}
      <ambientLight intensity={0.12} />

      <Starfield />
      <PlanetsAndLight />
      <Globe onCityClick={onCityClick} athensRaidInfo={athensRaidInfo} />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={4}
        maxDistance={18}
        autoRotate
        autoRotateSpeed={0.4}
        maxPolarAngle={Math.PI * 0.80}
        minPolarAngle={Math.PI * 0.10}
      />
    </>
  );
}

export { GLOBE_RADIUS };
