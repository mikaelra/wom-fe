'use client';

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import CityMarker from './CityMarker';
import { CITIES, type City } from '@/lib/cities';

const GLOBE_RADIUS = 2.5;

// Fresnel / atmosphere glow matching threejs-earth getFresnelMat
function makeFresnelMat() {
  return new THREE.ShaderMaterial({
    uniforms: {
      color1: { value: new THREE.Color(0x0088ff) },
      color2: { value: new THREE.Color(0x000000) },
      fresnelBias: { value: 0.1 },
      fresnelScale: { value: 1.0 },
      fresnelPower: { value: 4.0 },
    },
    vertexShader: /* glsl */ `
      uniform float fresnelBias;
      uniform float fresnelScale;
      uniform float fresnelPower;
      varying float vReflectionFactor;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vec3 worldNormal = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal);
        vec3 I = worldPosition.xyz - cameraPosition;
        vReflectionFactor = fresnelBias + fresnelScale * pow(1.0 + dot(normalize(I), worldNormal), fresnelPower);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color1;
      uniform vec3 color2;
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

// --- Textured Earth globe (matches threejs-earth visuals) ---
function Globe() {
  const earthRef = useRef<THREE.Mesh>(null);
  const lightsRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const [earthMap, specularMap, bumpMap, lightsMap, cloudsMap, cloudsTrans] =
    useTexture([
      '/textures/00_earthmap1k.jpg',
      '/textures/02_earthspec1k.jpg',
      '/textures/01_earthbump1k.jpg',
      '/textures/03_earthlights1k.jpg',
      '/textures/04_earthcloudmap.jpg',
      '/textures/05_earthcloudmaptrans.jpg',
    ]);

  const fresnelMat = useMemo(makeFresnelMat, []);

  const lightsMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: lightsMap,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [lightsMap],
  );

  const cloudsMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: cloudsMap,
        alphaMap: cloudsTrans,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [cloudsMap, cloudsTrans],
  );

  // IcosahedronGeometry detail=12 matches threejs-earth exactly
  const geo = useMemo(() => new THREE.IcosahedronGeometry(GLOBE_RADIUS, 12), []);

  useFrame(() => {
    const spd = 0.0005;
    if (earthRef.current) earthRef.current.rotation.y += spd;
    if (lightsRef.current) lightsRef.current.rotation.y += spd;
    if (cloudsRef.current) cloudsRef.current.rotation.y += spd * 1.15;
    if (glowRef.current) glowRef.current.rotation.y += spd;
  });

  return (
    <>
      {/* Main earth surface */}
      <mesh ref={earthRef} geometry={geo}>
        <meshPhongMaterial
          map={earthMap}
          specularMap={specularMap}
          bumpMap={bumpMap}
          bumpScale={0.04 * GLOBE_RADIUS}
        />
      </mesh>

      {/* Night-side city lights (additive – only visible in shadow) */}
      <mesh ref={lightsRef} geometry={geo} material={lightsMat} />

      {/* Cloud layer */}
      <mesh ref={cloudsRef} geometry={geo} material={cloudsMat} scale={1.003} />

      {/* Fresnel atmosphere glow */}
      <mesh ref={glowRef} geometry={geo} material={fresnelMat} scale={1.01} />
    </>
  );
}

// --- Camera initial placement ---
function CameraRig() {
  const { camera } = useThree();
  const initialized = useRef(false);
  useFrame(() => {
    if (!initialized.current) {
      camera.position.set(0, 2, 7);
      camera.lookAt(0, 0, 0);
      initialized.current = true;
    }
  });
  return null;
}

// --- Procedural starfield matching threejs-earth style ---
function Starfield() {
  const geo = useMemo(() => {
    const verts: number[] = [];
    const colors: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const r = Math.random() * 25 + 50;
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      verts.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
      const c = new THREE.Color().setHSL(0.6, 0.2, Math.random());
      colors.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, []);

  const starsRef = useRef<THREE.Points>(null);
  useFrame(() => {
    if (starsRef.current) starsRef.current.rotation.y -= 0.0002;
  });

  return (
    <points ref={starsRef} geometry={geo}>
      <pointsMaterial size={0.15} vertexColors sizeAttenuation />
    </points>
  );
}

// --- Main WorldMap scene ---
interface WorldMapProps {
  onCityClick: (city: City) => void;
}

export default function WorldMap({ onCityClick }: WorldMapProps) {
  return (
    <>
      <CameraRig />

      {/* Deep space background */}
      <color attach="background" args={['#070b15']} />
      <Starfield />

      {/* Sun-like directional light (same position as threejs-earth) */}
      <directionalLight position={[-2, 0.5, 1.5]} intensity={2.0} color={0xffffff} />
      {/* Tiny ambient so the dark side isn't pure black */}
      <ambientLight intensity={0.05} />

      {/* Textured globe */}
      <Globe />

      {/* City markers – outside the globe meshes so they stay at correct
          lat/lng positions regardless of globe auto-rotation */}
      {CITIES.map((city) => (
        <CityMarker
          key={city.id}
          city={city}
          globeRadius={GLOBE_RADIUS}
          onClick={onCityClick}
        />
      ))}

      {/* Orbit controls */}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={4}
        maxDistance={12}
        autoRotate
        autoRotateSpeed={0.3}
        maxPolarAngle={Math.PI * 0.85}
        minPolarAngle={Math.PI * 0.15}
      />
    </>
  );
}

export { GLOBE_RADIUS };
