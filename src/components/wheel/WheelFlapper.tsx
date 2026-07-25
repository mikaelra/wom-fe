'use client';

import { useId } from 'react';
import type { ViewportGeometry } from '@/lib/wheelGeometry';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type Props = {
  geometry: ViewportGeometry;
  /** Radians, deflection from vertical. */
  thetaRad: number;
};

// SVG on top of the canvas (§3.5.5) -- crisp edges and a trivial transform,
// rather than fighting the canvas for a shape that's really just a rotated
// blade.
export default function WheelFlapper({ geometry, thetaRad }: Props) {
  const gradientId = useId();
  const { W, TOP_INSET, rimWidth } = geometry;

  // Thick red blade with a black outline, wide at the pivot and tapering to
  // a true point -- it needs to read as an arrow, not a needle. 1.5x per
  // product feedback that the previous size read too small -- the pivot
  // itself stays flush against the rim (TOP_INSET, below), only the blade
  // and its outline scale up.
  const SIZE_SCALE = 1.5;
  const pivotWidth = clamp(rimWidth * 0.55, 6, 15) * SIZE_SCALE;
  const bossRadius = pivotWidth * 0.55;
  // Half the previous in-wheel length (that version's blade ran from y=0
  // with 65% of its length inside the wheel, i.e. 0.65 * TOP_INSET/0.35).
  // The pivot now sits flush against the rim (translated by TOP_INSET
  // below) instead of at the top of the band, so there's no gap between
  // where the blade hangs from and the wheel itself.
  const length = ((TOP_INSET / 0.35 - TOP_INSET) / 2) * SIZE_SCALE;
  const deg = (thetaRad * 180) / Math.PI;
  const baseY = bossRadius * 0.5;
  // A true triangle -- apex at the tip, not a flat-topped taper.
  const bladePath = `M ${-pivotWidth / 2} ${baseY} L ${pivotWidth / 2} ${baseY} L 0 ${length} Z`;
  const svgHeight = TOP_INSET + length + bossRadius;
  const strokeWidth = clamp(rimWidth * 0.06, 1, 2) * SIZE_SCALE;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-10"
      width={W}
      height={svgHeight}
      style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.5))' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#991b1b" />
          <stop offset="50%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
      </defs>
      <g transform={`translate(${W / 2}, ${TOP_INSET}) rotate(${deg})`}>
        <path d={bladePath} fill={`url(#${gradientId})`} stroke="#000000" strokeWidth={strokeWidth} strokeLinejoin="round" />
        <circle r={bossRadius} fill={`url(#${gradientId})`} stroke="#000000" strokeWidth={strokeWidth} />
      </g>
    </svg>
  );
}
