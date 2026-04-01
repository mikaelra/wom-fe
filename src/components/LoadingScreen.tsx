'use client';

import { useRef, useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';

// ---------------------------------------------------------------------------
// Pure-CSS animated dots
// ---------------------------------------------------------------------------
const DOT_STYLES = `
  @keyframes wom-dot-1 {
    0%    { opacity: 1; }
    75%   { opacity: 1; }
    75.1% { opacity: 0; }
    100%  { opacity: 0; }
  }
  @keyframes wom-dot-2 {
    0%    { opacity: 0; }
    25%   { opacity: 0; }
    25.1% { opacity: 1; }
    75%   { opacity: 1; }
    75.1% { opacity: 0; }
    100%  { opacity: 0; }
  }
  @keyframes wom-dot-3 {
    0%    { opacity: 0; }
    50%   { opacity: 0; }
    50.1% { opacity: 1; }
    75%   { opacity: 1; }
    75.1% { opacity: 0; }
    100%  { opacity: 0; }
  }
`;

// ---------------------------------------------------------------------------
// 3-D octahedron renderer — 2D canvas + requestAnimationFrame, no WebGL
// ---------------------------------------------------------------------------
type V3 = [number, number, number];

const VERTS: V3[] = [
  [ 0,  1,  0],  // 0 top
  [ 0, -1,  0],  // 1 bottom
  [ 1,  0,  0],  // 2 right
  [-1,  0,  0],  // 3 left
  [ 0,  0,  1],  // 4 front
  [ 0,  0, -1],  // 5 back
];

const FACES: [number, number, number][] = [
  [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
  [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5],
];

const EDGES: [number, number][] = [
  [0,2],[0,4],[0,3],[0,5],
  [1,2],[1,4],[1,3],[1,5],
  [2,4],[4,3],[3,5],[5,2],
];

const LIGHT: V3 = norm([0.6, 0.9, 0.5]);

function norm(v: V3): V3 {
  const l = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  return [v[0] / l, v[1] / l, v[2] / l];
}
function sub(a: V3, b: V3): V3 { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function dot(a: V3, b: V3): number { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a: V3, b: V3): V3 {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function rotX(p: V3, a: number): V3 {
  return [p[0], p[1]*Math.cos(a)-p[2]*Math.sin(a), p[1]*Math.sin(a)+p[2]*Math.cos(a)];
}
function rotY(p: V3, a: number): V3 {
  return [p[0]*Math.cos(a)+p[2]*Math.sin(a), p[1], -p[0]*Math.sin(a)+p[2]*Math.cos(a)];
}
function rotZ(p: V3, a: number): V3 {
  return [p[0]*Math.cos(a)-p[1]*Math.sin(a), p[0]*Math.sin(a)+p[1]*Math.cos(a), p[2]];
}
function project(p: V3, size: number): [number, number] {
  const d = 3.2;
  const s = size * 0.38;
  return [size / 2 + (p[0] / (p[2] + d)) * s, size / 2 - (p[1] / (p[2] + d)) * s];
}

function OctahedronCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    const SIZE = canvas.width;
    const rot = { x: 0, y: 0, z: 0 };
    let t = 0;
    let lastTs = 0;
    let frameId = 0;

    function frame(ts: number) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      t += dt;

      // Organic: base rate ± sine wave at an incommensurate frequency per axis
      rot.x += dt * (0.35 + 0.28 * Math.sin(t * 0.53));
      rot.y += dt * (0.60 + 0.40 * Math.sin(t * 0.37));
      rot.z += dt * (0.10 + 0.18 * Math.sin(t * 0.81));

      const tv = VERTS.map(v => rotZ(rotY(rotX(v, rot.x), rot.y), rot.z));
      const pv = tv.map(v => project(v, SIZE));

      ctx.clearRect(0, 0, SIZE, SIZE);

      // Painter's algorithm — sort faces back-to-front by average Z
      const sorted = FACES
        .map(f => ({ f, z: (tv[f[0]][2] + tv[f[1]][2] + tv[f[2]][2]) / 3 }))
        .sort((a, b) => a.z - b.z);

      for (const { f } of sorted) {
        const n = norm(cross(sub(tv[f[1]], tv[f[0]]), sub(tv[f[2]], tv[f[0]])));
        const diffuse = Math.max(0, dot(n, LIGHT));
        const b = 0.15 + 0.85 * diffuse;   // ambient 0.15

        // Orange-yellow: interpolate #3a1400 → #FF9200
        const r = Math.round(58  + (255 - 58)  * b);
        const g = Math.round(20  + (146 - 20)  * b);
        const bl = Math.round(0  + (0   - 0)   * b);

        const [p0, p1, p2] = [pv[f[0]], pv[f[1]], pv[f[2]]];
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.closePath();
        ctx.fillStyle = `rgb(${r},${g},${bl})`;
        ctx.fill();
      }

      // Grey edge lines
      ctx.strokeStyle = '#aaaaaa';
      ctx.lineWidth = 1.2;
      for (const [a, b] of EDGES) {
        ctx.beginPath();
        ctx.moveTo(pv[a][0], pv[a][1]);
        ctx.lineTo(pv[b][0], pv[b][1]);
        ctx.stroke();
      }

      frameId = requestAnimationFrame(frame);
    }

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={220}
      height={220}
      style={{ display: 'block' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main loading screen
// ---------------------------------------------------------------------------
export default function LoadingScreen() {
  const { progress, active, total } = useProgress();
  const [visible, setVisible] = useState(true);
  const [hasStartedLoading, setHasStartedLoading] = useState(false);

  // Remove the server-rendered dark overlay so only this component covers the page
  useEffect(() => {
    document.getElementById('wom-initial-overlay')?.remove();
  }, []);

  useEffect(() => {
    if (active && total > 0) setHasStartedLoading(true);
  }, [active, total]);

  useEffect(() => {
    if (hasStartedLoading && !active && progress >= 100) {
      const t = setTimeout(() => setVisible(false), 400);
      return () => clearTimeout(t);
    }
  }, [hasStartedLoading, active, progress]);

  // Fallback: hide after 8 s if progress tracking never fires (all assets cached)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <>
      <style>{DOT_STYLES}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0a0a0a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}
      >
        {/* Title — matches globe scene style */}
        <p
          style={{
            color: 'rgba(255,255,255,0.8)',
            fontSize: '0.9rem',
            fontWeight: 300,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            marginBottom: '1.5rem',
            fontFamily: 'var(--font-geist-sans, sans-serif)',
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          }}
        >
          World of Mythos
        </p>

        {/* 2-D canvas octahedron — no WebGL, no conflicts */}
        <OctahedronCanvas />

        {/* Loading text with CSS-animated dots */}
        <p
          style={{
            color: '#888888',
            fontSize: '1.1rem',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-geist-sans, sans-serif)',
            marginTop: '1.25rem',
            display: 'flex',
            alignItems: 'baseline',
          }}
        >
          Loading
          <span style={{ animation: 'wom-dot-1 2s linear infinite', marginLeft: 1 }}>.</span>
          <span style={{ animation: 'wom-dot-2 2s linear infinite' }}>.</span>
          <span style={{ animation: 'wom-dot-3 2s linear infinite' }}>.</span>
        </p>
      </div>
    </>
  );
}
