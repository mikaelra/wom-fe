'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCrackles } from './GlobeCrackleEffect';
import { timewarpFxState } from '@/lib/timewarpFx';

/**
 * The timewarp's clouds and electricity around the globe
 * (lib/timewarpFx.ts). Mounted while an animation runs; how strong it is
 * each frame comes from timewarpFxState, which lib/useTimewarpFx.ts drives.
 *
 * Every part is one colour, never a blend of two (a conjunction's two
 * planets stay two colours): each colour has its own layer of spots and
 * its own lightning. A moment with a full moon and conjunctions uses every
 * colour it has.
 */

/** How strong the colour spots get at full glow (halved from 0.85 after a
 *  first look in dev). */
const SPOT_OPACITY = 0.425;
const MAX_CRACKLE_SEGS = 1500;
/** Space between one colour's layer and the next, as a share of the
 *  globe's radius -- close, so the layers read as one weather. */
const LAYER_GAP = 0.008;
/** Lightning sources per colour, each striking from its own spot. */
const BOLTS_PER_COLOR = 3;

// Value noise and fbm over 3D -- procedural, so each layer's spots are its
// own (a seed per layer) and nothing repeats across the globe the way a
// shared texture would.
const NOISE_GLSL = `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 4.1);
      a *= 0.5;
    }
    return v;
  }
`;

/**
 * One colour's layer of spots: its own shell, its own uneven spotted
 * pattern (a seed of its own, a frequency and threshold of its own) and
 * its own spin about the Earth's axis. Crisp-edged and drawn over, not added to, whatever is
 * under it -- where two colours' spots overlap, the outer one shows rather
 * than a blend of both.
 */
function SpotLayer({ color, radius, index }: { color: string; radius: number; index: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  // Per-layer character, fixed for the layer's life.
  const character = useMemo(() => {
    const r = (n: number) => {
      const x = Math.sin((index + 1) * 12.9898 + n * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return {
      seed: new THREE.Vector3(r(1) * 100, r(2) * 100, r(3) * 100),
      frequency: 2.6 + r(4) * 2.4,
      threshold: 0.5 + r(5) * 0.08,
      // Either way round, but always about the Earth's own axis.
      spinSpeed: (0.35 + r(6) * 0.6) * (index % 2 === 0 ? 1 : -1),
    };
  }, [index]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSeed: { value: character.seed },
      uFrequency: { value: character.frequency },
      uThreshold: { value: character.threshold },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uSeed;
      uniform float uFrequency;
      uniform float uThreshold;
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vPos;
      ${NOISE_GLSL}
      void main() {
        // Spots that slowly boil, uneven in size and spacing.
        float n = fbm(vPos * uFrequency + uSeed + vec3(0.0, uTime * 0.15, 0.0));
        float spot = smoothstep(uThreshold, uThreshold + 0.035, n);
        if (spot < 0.01) discard;
        gl_FragColor = vec4(uColor, spot * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
  }), [color, character]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y += delta * character.spinSpeed * (0.4 + 2.2 * timewarpFxState.spin);
    material.uniforms.uTime.value += delta;
    material.uniforms.uOpacity.value = SPOT_OPACITY * timewarpFxState.glow;
  });

  return (
    // Each colour at its own height, so the layers stack in a fixed order.
    // Untilted: it spins about Y, which is the Earth's axis in this scene
    // (celestial north; the globe itself turns about it too).
    <mesh ref={meshRef} material={material} renderOrder={10 + index}>
      <sphereGeometry args={[radius * (1.05 + LAYER_GAP * index), 96, 48]} />
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
    if (t - lastBurst.current > 0.06 + 0.07 * Math.random()) {
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
      {colors.map((c, i) => (
        <SpotLayer key={`spots|${c}|${i}`} color={c} radius={radius} index={i} />
      ))}
      {colors.flatMap((c, i) =>
        Array.from({ length: BOLTS_PER_COLOR }, (_, j) => (
          <Lightning
            key={`${c}|${i}|${j}`}
            color={c}
            radius={radius}
            seedOffset={(i * BOLTS_PER_COLOR + j) * 0.37}
          />
        )),
      )}
    </group>
  );
}
