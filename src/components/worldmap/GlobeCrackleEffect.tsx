'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Pre-allocated buffer: 3 000 segments × 2 vertices × 3 floats
const MAX_SEGS = 3000;

// Deterministic LCG — re-seeded each burst so every crackle looks different
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

/**
 * Fills `buf` with line-segment vertex data for branching lightning paths
 * on the sphere surface, emanating from `epicenter`.
 * Returns the number of THREE.js vertices written (ptr / 3).
 */
function buildCrackles(
  epicenter: THREE.Vector3,
  radius: number,
  seed: number,
  buf: Float32Array,
): number {
  const rng = lcg(seed);
  let ptr = 0;
  const cap = buf.length;

  // Orthonormal tangent frame at the epicenter
  const N = epicenter.clone().normalize();
  const helper = Math.abs(N.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const T1 = new THREE.Vector3().crossVectors(N, helper).normalize();
  const T2 = new THREE.Vector3().crossVectors(N, T1).normalize();

  function seg(a: THREE.Vector3, b: THREE.Vector3) {
    if (ptr + 6 > cap) return;
    buf[ptr++] = a.x; buf[ptr++] = a.y; buf[ptr++] = a.z;
    buf[ptr++] = b.x; buf[ptr++] = b.y; buf[ptr++] = b.z;
  }

  function branch(p: THREE.Vector3, d: THREE.Vector3, len: number, depth: number) {
    if (!depth || len < 0.06 || ptr + 6 > cap) return;

    const nSeg = 3 + (rng() * 4 | 0);
    const sl = len / nSeg;
    const cur = p.clone();
    const dir = d.clone();

    for (let i = 0; i < nSeg; i++) {
      if (ptr + 6 > cap) return;
      // Perpendicular to both the surface normal and current dir (tangent steer vector)
      const perp = new THREE.Vector3().crossVectors(cur.clone().normalize(), dir).normalize();
      const jitter = (rng() - 0.5) * 0.95;

      // Steer, then project back onto tangent plane to stay on sphere surface
      const nd = dir.clone().addScaledVector(perp, jitter);
      const rComp = nd.dot(cur.clone().normalize());
      nd.addScaledVector(cur.clone().normalize(), -rComp).normalize();

      const next = cur.clone()
        .addScaledVector(nd, sl)
        .normalize()
        .multiplyScalar(radius * 1.003);

      seg(cur, next);
      cur.copy(next);
      dir.copy(nd);
    }

    // Continue main path
    branch(cur.clone(), dir.clone(), len * 0.65, depth - 1);

    // Occasional side branch
    if (rng() > 0.45 && depth > 1) {
      const perp = new THREE.Vector3().crossVectors(cur.clone().normalize(), dir).normalize();
      const sd = dir.clone().addScaledVector(perp, (rng() - 0.5) * 2.2);
      const rc = sd.dot(cur.clone().normalize());
      sd.addScaledVector(cur.clone().normalize(), -rc).normalize();
      branch(cur.clone(), sd, len * 0.38, depth - 2);
    }
  }

  const roots = 8 + (rng() * 4 | 0);
  const origin = epicenter.clone().normalize().multiplyScalar(radius * 1.003);

  for (let i = 0; i < roots; i++) {
    const angle = (i / roots) * Math.PI * 2 + rng() * 0.55;
    const d = T1.clone()
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(T2, Math.sin(angle));
    branch(origin.clone(), d, 1.0 + rng() * 1.5, 5);
  }

  return ptr / 3; // vertex count (itemSize=3 in the BufferAttribute)
}

interface GlobeCrackleEffectProps {
  epicenter: THREE.Vector3;
  radius: number;
}

export default function GlobeCrackleEffect({ epicenter, radius }: GlobeCrackleEffectProps) {
  const lastT = useRef(0);
  const opacityTarget = useRef(0.75);

  const buf = useMemo(() => new Float32Array(MAX_SEGS * 6), []);

  const [ls, geo, mat] = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(buf, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr);
    const vc = buildCrackles(epicenter, radius, 99999, buf);
    g.setDrawRange(0, vc);

    const m = new THREE.LineBasicMaterial({
      color: new THREE.Color('#7dd8ff'),
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return [new THREE.LineSegments(g, m), g, m] as const;
  }, [epicenter, radius, buf]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const dt = t - lastT.current;
    // Organic interval: ~160–280 ms between bursts
    const interval = 0.16 + 0.12 * Math.abs(Math.sin(t * 1.9));

    if (dt > interval) {
      lastT.current = t;
      opacityTarget.current = 0.35 + Math.random() * 0.6;
      const seed = (Math.random() * 0x7fffffff) | 0;
      const attr = geo.getAttribute('position') as THREE.BufferAttribute;
      const vc = buildCrackles(epicenter, radius, seed, buf);
      attr.needsUpdate = true;
      geo.setDrawRange(0, vc);
    }

    // Fade out quickly between bursts for a sparking electricity look
    mat.opacity = opacityTarget.current * Math.max(0.04, 1 - (t - lastT.current) * 5.5);
  });

  return <primitive object={ls} />;
}
