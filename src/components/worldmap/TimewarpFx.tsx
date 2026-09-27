'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { buildCrackles } from './GlobeCrackleEffect';
import { timewarpFxState } from '@/lib/timewarpFx';

/**
 * The timewarp's clouds and electricity around the globe
 * (lib/timewarpFx.ts). Mounted while an animation runs; how strong it is
 * each frame comes from timewarpFxState, which lib/useTimewarpFx.ts drives.
 *
 * Every part is one colour, never a blend of two (a conjunction's two
 * planets stay two colours): the cloud shell is striped by longitude, one
 * colour a stripe, and each colour has its own lightning.
 */

/** Stripes per colour around the globe. */
const STRIPES_PER_COLOR = 4;
const CLOUD_OPACITY = 0.9;
const MAX_CRACKLE_SEGS = 1500;

function CloudShell({ colors, radius }: { colors: string[]; radius: number }) {
  const cloudMap = useTexture('/textures/earth/high-res/04_earthcloudmap.jpg');
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(() => {
    const palette = [0, 1, 2].map((i) => new THREE.Color(colors[i % colors.length]));
    return new THREE.ShaderMaterial({
      uniforms: {
        uClouds: { value: cloudMap },
        uColors: { value: palette },
        uCount: { value: Math.min(3, colors.length) },
        uStripes: { value: STRIPES_PER_COLOR * Math.min(3, colors.length) },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uClouds;
        uniform vec3 uColors[3];
        uniform float uCount;
        uniform float uStripes;
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          // Exactly one colour per stripe -- picked, never mixed.
          float stripe = floor(fract(vUv.x + uTime * 0.03) * uStripes);
          int idx = int(mod(stripe, uCount));
          vec3 c = idx == 0 ? uColors[0] : (idx == 1 ? uColors[1] : uColors[2]);
          float cloud = texture2D(uClouds, vUv).r;
          gl_FragColor = vec4(c, cloud * uOpacity);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, [cloudMap, colors]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Swirls faster the harder the sky spins, against the sky's direction.
    mesh.rotation.y += delta * (0.4 + 2.2 * timewarpFxState.spin);
    mesh.rotation.x = 0.25 * Math.sin(material.uniforms.uTime.value * 0.7);
    material.uniforms.uTime.value += delta;
    material.uniforms.uOpacity.value = CLOUD_OPACITY * timewarpFxState.glow;
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[radius * 1.07, 64, 32]} />
    </mesh>
  );
}

/** One colour's lightning: bursts of branching crackle from a fresh random
 *  spot on the globe each time, fading between bursts. */
function Lightning({ color, radius, seedOffset }: { color: string; radius: number; seedOffset: number }) {
  const buf = useMemo(() => new Float32Array(MAX_CRACKLE_SEGS * 6), []);
  const lastBurst = useRef(-Infinity);
  const peak = useRef(0.8);

  const [lines, geometry, material] = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(buf, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr);
    g.setDrawRange(0, 0);
    const m = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return [new THREE.LineSegments(g, m), g, m] as const;
  }, [buf, color]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  const epicenter = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seedOffset;
    if (t - lastBurst.current > 0.09 + 0.08 * Math.random()) {
      lastBurst.current = t;
      peak.current = 0.5 + Math.random() * 0.5;
      epicenter.randomDirection().multiplyScalar(radius);
      const count = buildCrackles(epicenter, radius * 1.02, (Math.random() * 0x7fffffff) | 0, buf);
      geometry.setDrawRange(0, count);
      (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    const sinceBurst = t - lastBurst.current;
    material.opacity = timewarpFxState.glow * peak.current * Math.max(0.05, 1 - sinceBurst * 6);
  });

  return <primitive object={lines} />;
}

export default function TimewarpFx({ colors, radius }: { colors: string[]; radius: number }) {
  return (
    <group>
      <CloudShell colors={colors} radius={radius} />
      {colors.map((c, i) => (
        <Lightning key={`${c}|${i}`} color={c} radius={radius} seedOffset={i * 0.37} />
      ))}
    </group>
  );
}
