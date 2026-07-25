'use client';

import { useEffect, useRef } from 'react';
import type { Slice, ViewportGeometry } from '@/lib/wheelGeometry';
import { skinColor } from '@/lib/frogSkins';

const TWO_PI = Math.PI * 2;
const MAX_DPR = 2;
// Existing dark UI's bg-gray-950 (§3.5.4) -- vignette/fade targets this so
// slices dissolve into the surrounding page instead of stopping short of it.
const BG_COLOR = '#030712';

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

// Representative of `angle` (mod 2π) nearest `center`, within (center-π, center+π].
function wrapNear(angle: number, center: number): number {
  return center + mod(angle - center + Math.PI, TWO_PI) - Math.PI;
}

type Props = {
  slices: Slice[];
  geometry: ViewportGeometry;
  rotation: number;
  rotationDelta: number;
  blurSteps: 1 | 2 | 4;
  /** Index into `slices` of the one slice to highlight (the exact slice
   * landed on) -- not every slice sharing its color. */
  highlightIndex?: number | null;
  onContextUnavailable?: () => void;
};

export default function WheelCanvas({
  slices,
  geometry,
  rotation,
  rotationDelta,
  blurSteps,
  highlightIndex,
  onContextUnavailable,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gradientCacheRef = useRef<{ key: string; slices: Map<string, CanvasGradient>; rim: CanvasGradient; peg: CanvasGradient } | null>(
    null,
  );

  // Backing-store sizing: DPR-scaled canvas pixels for a CSS-pixel-sized
  // element, capped at 2x per §3.5.9. Only depends on geometry, not on the
  // per-frame rotation.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onContextUnavailable?.();
      return;
    }
    ctxRef.current = ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(geometry.W * dpr);
    canvas.height = Math.round(geometry.H * dpr);
    canvas.style.width = `${geometry.W}px`;
    canvas.style.height = `${geometry.H}px`;
    // Gradients are pinned to this geometry -- rebuilt only when it (or the
    // ctx) changes, then reused every frame (§3.5.9: "no allocation inside
    // the frame loop").
    gradientCacheRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry.W, geometry.H, geometry.R, geometry.R_inner, geometry.cx, geometry.cy, geometry.rimWidth]);

  useEffect(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const { W, H, R, R_inner, cx, cy, rimWidth, halfArc } = geometry;

    let cache = gradientCacheRef.current;
    if (!cache) {
      const sliceGradients = new Map<string, CanvasGradient>();
      for (const s of slices) {
        // Rainbow is rebuilt per-slice, per-frame in the draw loop below
        // (see the isSweptSkin check) -- a gradient cached here would be
        // anchored to fixed canvas coordinates, so whichever slice ended up
        // under the pointer would always show the same narrow sliver of it
        // rather than a real sweep across that slice's own width. Bling
        // uses this same plain cached radial gradient as every other
        // skin (its light-green base) -- the sparkle glints layered on top
        // (drawn separately below) are what makes it read as "bling".
        if (isSweptSkin(s.skin) || sliceGradients.has(s.skin)) continue;
        sliceGradients.set(s.skin, buildSliceGradient(ctx, s.skin, cx, cy, R_inner, R));
      }
      const rim = ctx.createLinearGradient(0, 0, W, 0);
      rim.addColorStop(0, '#8a6216');
      rim.addColorStop(0.5, '#f0d590');
      rim.addColorStop(1, '#7a5512');
      const pegR = Math.max(3, Math.min(7, 0.018 * H));
      const peg = ctx.createRadialGradient(-pegR * 0.3, -pegR * 0.3, 0, 0, 0, pegR);
      peg.addColorStop(0, '#f5e3ac');
      peg.addColorStop(1, '#6b4a10');
      cache = { key: '', slices: sliceGradients, rim, peg };
      gradientCacheRef.current = cache;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const visibleLo = -Math.PI / 2 - halfArc - 0.08;
    const visibleHi = -Math.PI / 2 + halfArc + 0.08;
    const pegR = Math.max(3, Math.min(7, 0.018 * H));
    const pegRadiusPos = R - rimWidth / 2;

    const drawSlicesAt = (rot: number, alpha: number) => {
      ctx.globalAlpha = alpha;
      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        const localMid = (slice.startAngle + slice.endAngle) / 2;
        const width = slice.endAngle - slice.startAngle;
        const mid = wrapNear(-Math.PI / 2 + localMid + rot, -Math.PI / 2);
        if (mid < visibleLo || mid > visibleHi) continue;
        const a0 = mid - width / 2;
        const a1 = mid + width / 2;
        const isWinner = highlightIndex != null && i === highlightIndex;
        const dim = highlightIndex != null && !isWinner ? 0.32 : 1;

        ctx.globalAlpha = alpha * dim;
        ctx.fillStyle = isSweptSkin(slice.skin)
          ? buildSweptSliceGradient(ctx, cx, cy, R_inner, R, a0, a1)
          : (cache!.slices.get(slice.skin) ?? '#6b7280');
        ctx.beginPath();
        ctx.moveTo(cx + R_inner * Math.cos(a0), cy + R_inner * Math.sin(a0));
        ctx.arc(cx, cy, R, a0, a1);
        ctx.lineTo(cx + R_inner * Math.cos(a1), cy + R_inner * Math.sin(a1));
        ctx.arc(cx, cy, R_inner, a1, a0, true);
        ctx.closePath();
        ctx.fill();

        if (slice.skin === 'frog_bling_v1') {
          // Silver sparkle glints over the light-green base -- deliberately
          // NOT clipped to the wedge (product feedback: the glow should be
          // allowed to bleed a little past the slice's own edges, not be
          // hard-cut at them).
          for (const spot of BLING_SPARKLE_SPOTS) {
            const ang = a0 + (a1 - a0) * spot.af;
            const rad = R_inner + (R - R_inner) * spot.rf;
            drawSparkle(ctx, cx + rad * Math.cos(ang), cy + rad * Math.sin(ang), spot.size * (R - R_inner));
          }
        }

        if (isWinner) {
          // Only the exact slice landed on lights up -- not every slice of
          // its color. A white wash brightens it past its resting color,
          // reusing the same path (still current, no beginPath).
          ctx.globalAlpha = alpha * 0.4;
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.shadowColor = 'rgba(255, 225, 140, 1)';
          ctx.shadowBlur = 28;
          ctx.strokeStyle = 'rgba(255, 248, 210, 1)';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        }

        // Groove (dark line) + leading-edge highlight, at the boundary this
        // slice owns (its start edge) -- each boundary drawn exactly once.
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.lineWidth = 2; // CSS px -- the ctx.setTransform(dpr, ...) above scales this to device px
        ctx.beginPath();
        ctx.moveTo(cx + R_inner * Math.cos(a0), cy + R_inner * Math.sin(a0));
        ctx.lineTo(cx + R * Math.cos(a0), cy + R * Math.sin(a0));
        ctx.stroke();

        const highlightAngle = a0 + 0.0025;
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + R_inner * Math.cos(highlightAngle), cy + R_inner * Math.sin(highlightAngle));
        ctx.lineTo(cx + R * Math.cos(highlightAngle), cy + R * Math.sin(highlightAngle));
        ctx.stroke();

        // Peg at this boundary.
        const pegX = cx + pegRadiusPos * Math.cos(a0);
        const pegY = cy + pegRadiusPos * Math.sin(a0);
        ctx.save();
        ctx.translate(pegX, pegY);
        ctx.fillStyle = cache!.peg;
        ctx.beginPath();
        ctx.arc(0, 0, pegR, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
      }
    };

    if (blurSteps <= 1) {
      drawSlicesAt(rotation, 1);
    } else {
      // Temporal supersampling: draw the visible slices `blurSteps` times,
      // spread across this frame's angular sweep, at 1/blurSteps alpha
      // each (§3.5.9's anti-strobe fix for the wagon-wheel effect).
      for (let i = 0; i < blurSteps; i++) {
        const t = blurSteps === 1 ? 0 : i / (blurSteps - 1);
        drawSlicesAt(rotation - rotationDelta * t, 1 / blurSteps);
      }
    }
    ctx.globalAlpha = 1;

    // Rim.
    ctx.lineWidth = rimWidth;
    ctx.strokeStyle = cache.rim;
    ctx.beginPath();
    ctx.arc(cx, cy, R, visibleLo, visibleHi);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.beginPath();
    ctx.arc(cx, cy, R + rimWidth / 2, visibleLo, visibleHi);
    ctx.stroke();

    // Overlays, in order (§3.5.4).
    const sheen = ctx.createLinearGradient(0, 0, 0, H * 0.4);
    sheen.addColorStop(0, 'rgba(255,255,255,.10)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H * 0.4);

    ctx.lineWidth = clampNum(0.03 * H, 8, 14);
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, R - ctx.lineWidth / 2, visibleLo, visibleHi);
    ctx.stroke();

    // Wide, front-loaded fade -- narrow phones especially need this to sell
    // "the wheel continues past the screen" rather than reading as clipped.
    // Most of the opacity is spent in the first third of the band so a
    // slice sitting right at the true edge is already mostly hidden, with
    // a longer soft tail so the transition itself isn't a visible seam.
    const vignetteWidth = clampNum(W * 0.22, 70, 420);
    const left = ctx.createLinearGradient(0, 0, vignetteWidth, 0);
    left.addColorStop(0, 'rgba(3,7,18,1)');
    left.addColorStop(0.35, 'rgba(3,7,18,0.88)');
    left.addColorStop(0.7, 'rgba(3,7,18,0.4)');
    left.addColorStop(1, 'rgba(3,7,18,0)');
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, vignetteWidth, H);

    const right = ctx.createLinearGradient(W, 0, W - vignetteWidth, 0);
    right.addColorStop(0, 'rgba(3,7,18,1)');
    right.addColorStop(0.35, 'rgba(3,7,18,0.88)');
    right.addColorStop(0.7, 'rgba(3,7,18,0.4)');
    right.addColorStop(1, 'rgba(3,7,18,0)');
    ctx.fillStyle = right;
    ctx.fillRect(W - vignetteWidth, 0, vignetteWidth, H);

    const bottom = ctx.createLinearGradient(0, H, 0, H * 0.75);
    bottom.addColorStop(0, BG_COLOR);
    bottom.addColorStop(1, 'rgba(3,7,18,0)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, H * 0.75, W, H * 0.25);

    ctx.restore();
  }, [slices, geometry, rotation, rotationDelta, blurSteps, highlightIndex]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        display: 'block',
        transform: 'perspective(1400px) rotateX(8deg)',
        transformOrigin: '50% 100%',
        filter: 'drop-shadow(0 18px 30px rgba(0,0,0,.55))',
      }}
    />
  );
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Rainbow is the only skin drawn with a gradient that sweeps across each
// individual slice's own angular width (buildSweptSliceGradient below), not
// the plain per-skin radial gradient every other skin (including bling,
// now just a flat light-green base) uses.
function isSweptSkin(skin: string): boolean {
  return skin === 'frog_rainbow_v2';
}

// A flat SKIN_COLORS hex can't actually read as "rainbow", and a gradient
// anchored to fixed canvas coordinates doesn't work either -- whichever
// slice happens to land under the (screen-fixed) pointer would always show
// the same narrow sliver of it. Instead this is rebuilt every frame from
// the slice's own current on-screen bounding box (post-rotation), so the
// pattern always spans that one slice's own width, regardless of where the
// wheel has rotated to. Only ever 1-3 slices are this skin and only the
// ones on screen get rebuilt, so the per-frame cost is negligible.
//
// Horizontal (screen x-axis, not the slice's own angled edges) and repeated
// (the palette cycles a few times across the slice) per product feedback --
// a single smooth sweep along the wedge read as too subtle/washed out.
const GRADIENT_REPEATS = 3;
function buildSweptSliceGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R_inner: number,
  R: number,
  a0: number,
  a1: number,
): CanvasGradient {
  const corners = [
    { x: cx + R_inner * Math.cos(a0), y: cy + R_inner * Math.sin(a0) },
    { x: cx + R * Math.cos(a0), y: cy + R * Math.sin(a0) },
    { x: cx + R_inner * Math.cos(a1), y: cy + R_inner * Math.sin(a1) },
    { x: cx + R * Math.cos(a1), y: cy + R * Math.sin(a1) },
  ];
  const minX = Math.min(...corners.map((p) => p.x));
  const maxX = Math.max(...corners.map((p) => p.x));
  // from.y === to.y -- a purely horizontal projection, color depends only on x.
  const g = ctx.createLinearGradient(minX, cy, Math.max(maxX, minX + 1), cy);
  const palette = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#818cf8', '#e879f9'];
  const totalStops = palette.length * GRADIENT_REPEATS;
  for (let i = 0; i <= totalStops; i++) {
    g.addColorStop(Math.min(1, i / totalStops), palette[i % palette.length]);
  }
  return g;
}

// A small 4-point glint/star, white-hot at the center fading to nothing --
// a cheap stand-in for a diamond facet catching light. Deliberately not
// clipped to the slice's wedge by the caller -- shadowBlur is what gives it
// an actual shine (the glow visibly bleeds a bit past the star's own sharp
// core), and per product feedback that's allowed to spill past the slice's
// own edges too, not just the star's outline.
function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(226,232,240,.9)'; // silver
  ctx.shadowBlur = size * 0.6;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, 'rgba(226,232,240,.9)'); // silver
  grad.addColorStop(1, 'rgba(226,232,240,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.18, -size * 0.18);
  ctx.lineTo(size, 0);
  ctx.lineTo(size * 0.18, size * 0.18);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.18, size * 0.18);
  ctx.lineTo(-size, 0);
  ctx.lineTo(-size * 0.18, -size * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Fixed relative (angle-fraction, radius-fraction) spots within a slice's
// own [a0,a1] x [R_inner,R] span -- stable relative to the slice as it
// rotates (no per-frame randomness/flicker). "Lots" of them (was 2), kept
// individually small so they read as distinct glints scattered across the
// light-green base rather than fusing into one solid bright mass.
const BLING_SPARKLE_SPOTS = [
  { af: 0.12, rf: 0.18, size: 0.011 },
  { af: 0.5, rf: 0.12, size: 0.008 },
  { af: 0.85, rf: 0.22, size: 0.01 },
  { af: 0.65, rf: 0.38, size: 0.013 },
  { af: 0.08, rf: 0.62, size: 0.009 },
  { af: 0.75, rf: 0.82, size: 0.008 },
  { af: 0.55, rf: 0.94, size: 0.01 },
  { af: 0.2, rf: 0.06, size: 0.009 },
  { af: 0.95, rf: 0.42, size: 0.011 },
  { af: 0.05, rf: 0.35, size: 0.012 },
  { af: 0.18, rf: 0.5, size: 0.01 },
  { af: 0.48, rf: 0.86, size: 0.008 },
  { af: 0.88, rf: 0.9, size: 0.011 },
];

function buildSliceGradient(
  ctx: CanvasRenderingContext2D,
  skin: string,
  cx: number,
  cy: number,
  R_inner: number,
  R: number,
): CanvasGradient {
  const g = ctx.createRadialGradient(cx, cy, R_inner, cx, cy, R);
  const base = skinColor(skin);
  g.addColorStop(0, lighten(base, 0.72));
  g.addColorStop(1, base);
  return g;
}

function lighten(hex: string, towardWhiteFraction: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * towardWhiteFraction);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
