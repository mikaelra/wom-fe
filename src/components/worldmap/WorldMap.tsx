'use client';

import { useRef, useMemo, memo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import CityMarker from './CityMarker';
import { CITIES, type City } from '@/lib/cities';
import { STAR_CATALOG } from './starCatalog';
import { isLowQuality } from '@/lib/deviceQuality';

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

// ── Real starfield ─────────────────────────────────────────────────────────

const Starfield = memo(function Starfield() {
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
});

// ── Planets + sun-tracking directional light ───────────────────────────────

const PlanetsAndLight = memo(function PlanetsAndLight() {
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

  // Already 1k — fine for both tiers.
  const moonMap = useTexture('/textures/moon/moonmap1k.jpg');

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

        <mesh position={posMoon}>
          <sphereGeometry args={[1.5, 32, 32]} />
          <meshPhongMaterial map={moonMap} />
        </mesh>

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
});

// ── Globe ──────────────────────────────────────────────────────────────────

interface GlobeProps {
  onCityClick: (city: City) => void;
  athensRaidInfo?: { secondsUntil: number | null; bossName?: string };
}

function Globe({ onCityClick, athensRaidInfo }: GlobeProps) {
  const cloudsRef = useRef<THREE.Mesh>(null);

  // Use 1k earth textures on low-end devices (~6 MB → ~640 KB), 4k otherwise.
  // Cloud textures are the same file in both folders, so always pulled from high-res.
  const earthDir = isLowQuality() ? 'low-res' : 'high-res';
  const earthSuffix = isLowQuality() ? '1k' : '4k';
  const [earthMap, specularMap, bumpMap, lightsMap, cloudsMap, cloudsTrans] = useTexture([
    `/textures/earth/${earthDir}/00_earthmap${earthSuffix}.jpg`,
    `/textures/earth/${earthDir}/02_earthspec${earthSuffix}.jpg`,
    `/textures/earth/${earthDir}/01_earthbump${earthSuffix}.jpg`,
    `/textures/earth/${earthDir}/03_earthlights${earthSuffix}.jpg`,
    '/textures/earth/high-res/04_earthcloudmap.jpg',
    '/textures/earth/high-res/05_earthcloudmaptrans.jpg',
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
// axis. We set it every frame because OrbitControls may re-enter its own
// spherical system and needs a consistent "up" to orbit in the ecliptic plane.
// The camera starts at the anti-solar point — the Sun is always on the
// ecliptic, so its opposite direction is too. At r=13 with the Sun at r=46
// in the same direction, the Sun is hidden behind the Earth and peeks out as
// the camera begins its slow 360° pan.
// Sky drift: planets, stars, and ecliptic all rotate their groups by this
// delta every frame. The camera must apply the same rotation so it stays
// locked to the ecliptic plane as the sky drifts.
const SKY_DRIFT = -0.0002;
const _driftQ   = new THREE.Quaternion();
const _yAxis    = new THREE.Vector3(0, 1, 0);

function CameraRig() {
  const { camera } = useThree();
  const initialized = useRef(false);
  useFrame(() => {
    if (!initialized.current) {
      const sunEq = Astronomy.Equator(Astronomy.Body.Sun, new Date(), OBSERVER, false, true);
      const sunDir = raDecToVec3(sunEq.ra, sunEq.dec, 1).normalize();
      camera.position.copy(sunDir.multiplyScalar(-13));
      camera.up.copy(ECLIPTIC_POLE);
      camera.lookAt(0, 0, 0);
      initialized.current = true;
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
