'use client';

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import CityMarker from './CityMarker';
import { CITIES, type City } from '@/lib/cities';
import { STAR_CATALOG } from './starCatalog';

const GLOBE_RADIUS = 2.5;
const STAR_R = 50;
const PLANET_R = 46;
const RAD = Math.PI / 180;
const TILT = -23.4 * RAD;

// ── Inline astronomy (Schlyter / Meeus low-accuracy, ~1° error) ────────────

function jd(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function obliquity(d: number): number {
  return (23.439 - 3.56e-7 * d) * RAD;
}

export function gmstHours(date: Date): number {
  const d0 = jd(date) - 2451545.0;
  return (((280.46061837 + 360.98564736629 * d0) % 360) + 360) % 360 / 15;
}

function ecl2eq(lon: number, lat: number, eps: number): { ra: number; dec: number } {
  const ra = Math.atan2(
    Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps),
    Math.cos(lon),
  );
  const dec = Math.asin(
    Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon),
  );
  return { ra: (((ra / RAD / 15) % 24) + 24) % 24, dec: dec / RAD };
}

function sunEcliptic(d: number): { lon: number; r: number } {
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const lon = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const r = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  return { lon, r };
}

function sunPosition(date: Date): { ra: number; dec: number } {
  const d = jd(date) - 2451545.0;
  const { lon } = sunEcliptic(d);
  return ecl2eq(lon, 0, obliquity(d));
}

function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 10; i++) E = M + e * Math.sin(E);
  return E;
}

// Schlyter orbital elements: [N0,Nd, i0,id, w0,wd, a, e0,ed, M0,Md]
const ELEMS: Record<string, number[]> = {
  Mercury: [48.3313,3.24587e-5, 7.0047,5.00e-8, 29.1241,1.01444e-5, 0.387098, 0.205635,5.59e-10, 168.6562,4.0923344368],
  Venus:   [76.6799,2.46590e-5, 3.3946,2.75e-8, 54.8910,1.38374e-5, 0.723330, 0.006773,-1.302e-9, 48.0052,1.6021302244],
  Mars:    [49.5574,2.11081e-5, 1.8497,-1.78e-8, 286.5016,2.92961e-5, 1.523688, 0.093405,2.516e-9, 18.6021,0.5240207766],
  Jupiter: [100.4542,2.76854e-5, 1.3030,-1.557e-7, 273.8777,1.64505e-5, 5.20256, 0.048498,4.469e-9, 19.8950,0.0830853001],
  Saturn:  [113.6634,2.38980e-5, 2.4886,-1.081e-7, 339.3939,2.97661e-5, 9.55475, 0.055546,-9.499e-9, 316.9670,0.0334442282],
};

function planetPosition(name: string, date: Date): { ra: number; dec: number } {
  const d = jd(date) - 2451545.0;
  const e = ELEMS[name];
  const N   = (e[0] + e[1] * d) * RAD;
  const inc = (e[2] + e[3] * d) * RAD;
  const w   = (e[4] + e[5] * d) * RAD;
  const a   = e[6];
  const ec  = e[7] + e[8] * d;
  const M   = ((e[9] + e[10] * d) % 360 + 360) % 360 * RAD;
  const E   = solveKepler(M, ec);
  const xv  = a * (Math.cos(E) - ec);
  const yv  = a * Math.sqrt(1 - ec * ec) * Math.sin(E);
  const v   = Math.atan2(yv, xv);
  const r   = Math.hypot(xv, yv);
  const xh  = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(inc));
  const yh  = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(inc));
  const zh  = r * (Math.sin(v + w) * Math.sin(inc));
  const { lon: sLon, r: sR } = sunEcliptic(d);
  const xg  = xh - sR * Math.cos(sLon);
  const yg  = yh - sR * Math.sin(sLon);
  const zg  = zh;
  const eps = obliquity(d);
  const xe  = xg;
  const ye  = yg * Math.cos(eps) - zg * Math.sin(eps);
  const ze  = yg * Math.sin(eps) + zg * Math.cos(eps);
  return {
    ra:  (((Math.atan2(ye, xe) / RAD / 15) % 24) + 24) % 24,
    dec: Math.atan2(ze, Math.hypot(xe, ye)) / RAD,
  };
}

function moonPosition(date: Date): { ra: number; dec: number; phase: number } {
  const d   = jd(date) - 2451545.0;
  const L   = ((218.316 + 13.176396  * d) % 360 + 360) % 360 * RAD;
  const M   = ((134.963 + 13.064993  * d) % 360 + 360) % 360 * RAD;
  const F   = ((93.272  + 13.229350  * d) % 360 + 360) % 360 * RAD;
  const lon = L + 6.289 * Math.sin(M) * RAD;
  const lat = 5.128 * Math.sin(F) * RAD;
  const pos = ecl2eq(lon, lat, obliquity(d));
  const { lon: sLon } = sunEcliptic(d);
  const phase = (((lon - sLon) / RAD + 360) % 360) / 360;
  return { ...pos, phase };
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
  g.addColorStop(0.45, color);
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function dimTex(color: string, size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.00, '#ffffff');
  g.addColorStop(0.25, color);
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

  const sunSprite  = useRef<THREE.Sprite>(null);
  const lightRef   = useRef<THREE.DirectionalLight>(null);
  const groupRef   = useRef<THREE.Group>(null);
  const _worldPos  = useMemo(() => new THREE.Vector3(), []);

  const texSun    = useMemo(() => sunTex(),              []);
  const moonData  = useMemo(() => moonPosition(now),     [now]);
  const texMoon   = useMemo(() => moonTex(moonData.phase), [moonData.phase]);
  const texMerc   = useMemo(() => dimTex('#ffbb88'),     []);
  const texVenus  = useMemo(() => glowTex('#aaffaa'),    []);
  const texMars   = useMemo(() => dimTex('#ff6644'),     []);
  const texJup    = useMemo(() => glowTex('#88bbff'),    []);
  const texSat    = useMemo(() => dimTex('#cc9966'),     []);

  const posSun  = useMemo(() => { const p = sunPosition(now);              return raDecToVec3(p.ra, p.dec, PLANET_R); }, [now]);
  const posMoon = useMemo(() => raDecToVec3(moonData.ra, moonData.dec, PLANET_R), [moonData]);
  const posMerc = useMemo(() => { const p = planetPosition('Mercury', now); return raDecToVec3(p.ra, p.dec, PLANET_R); }, [now]);
  const posVen  = useMemo(() => { const p = planetPosition('Venus',   now); return raDecToVec3(p.ra, p.dec, PLANET_R); }, [now]);
  const posMars = useMemo(() => { const p = planetPosition('Mars',    now); return raDecToVec3(p.ra, p.dec, PLANET_R); }, [now]);
  const posJup  = useMemo(() => { const p = planetPosition('Jupiter', now); return raDecToVec3(p.ra, p.dec, PLANET_R); }, [now]);
  const posSat  = useMemo(() => { const p = planetPosition('Saturn',  now); return raDecToVec3(p.ra, p.dec, PLANET_R); }, [now]);

  useFrame(() => {
    if (sunSprite.current && lightRef.current) {
      sunSprite.current.getWorldPosition(_worldPos);
      lightRef.current.position.copy(_worldPos);
    }
    if (groupRef.current) groupRef.current.rotation.y -= 0.0002;
  });

  return (
    <>
      <directionalLight ref={lightRef} intensity={3.5} color={0xffffff} />
      <group ref={groupRef}>
        <sprite ref={sunSprite} position={posSun} scale={[5.0, 5.0, 1]}>
          <spriteMaterial map={texSun} transparent depthWrite={false} />
        </sprite>
        <sprite position={posMoon} scale={[1.6, 1.6, 1]}>
          <spriteMaterial map={texMoon} transparent depthWrite={false} />
        </sprite>
        <sprite position={posMerc} scale={[0.28, 0.28, 1]}>
          <spriteMaterial map={texMerc} transparent depthWrite={false} opacity={0.55} />
        </sprite>
        <sprite position={posVen} scale={[0.65, 0.65, 1]}>
          <spriteMaterial map={texVenus} transparent depthWrite={false} />
        </sprite>
        <sprite position={posMars} scale={[0.38, 0.38, 1]}>
          <spriteMaterial map={texMars} transparent depthWrite={false} />
        </sprite>
        <sprite position={posJup} scale={[0.75, 0.75, 1]}>
          <spriteMaterial map={texJup} transparent depthWrite={false} />
        </sprite>
        <sprite position={posSat} scale={[0.32, 0.32, 1]}>
          <spriteMaterial map={texSat} transparent depthWrite={false} opacity={0.75} />
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

  // Set earth orientation to match current Greenwich Mean Sidereal Time
  const earthRot = useMemo(() => Math.PI + gmstHours(new Date()) * (Math.PI / 12), []);

  // Clouds drift slowly relative to the surface
  useFrame(() => { if (cloudsRef.current) cloudsRef.current.rotation.y += 0.000075; });

  return (
    // Outer group carries the axial tilt
    <group rotation={[0, 0, TILT]}>
      {/* Inner group locks surface + markers to GMST longitude */}
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

      {/* Clouds start at earthRot and then drift independently */}
      <mesh ref={cloudsRef} geometry={geo} material={cloudsMat}
            rotation={[0, earthRot, 0]} scale={1.003} />

      {/* Fresnel glow — symmetric, no rotation needed */}
      <mesh geometry={geo} material={fresnelMat} scale={1.01} />
    </group>
  );
}

// ── Camera: start at 45° elevation ────────────────────────────────────────

function CameraRig() {
  const { camera } = useThree();
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    const r = 6.5;
    camera.position.set(0, r * Math.sin(Math.PI / 4), r * Math.cos(Math.PI / 4));
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
      <ambientLight intensity={0.05} />

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
