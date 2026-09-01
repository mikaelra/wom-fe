'use client';

import { PARCHMENT_COLORS } from '@/lib/cosmetics';

/**
 * The Parchment's inventory thumbnail.
 *
 * Inline SVG, not a live 3D preview. Same reasoning that put static PNGs
 * behind `skinThumbnailUrl` (`lib/frogSkins.ts`): browsers cap concurrent
 * WebGL contexts at roughly 8-16, and the inventory already spends several
 * on the equipped-skin viewer and the wheel/trade-up modals. A card that is
 * on screen alongside all of them should not claim another one.
 *
 * Colours come from the same constants the 3D model uses, so the card and
 * the thing floating beside your frog read as one object.
 */
export default function ParchmentCard({ className = '' }: { className?: string }) {
  const { paper, paperShade, rod, ribbon } = PARCHMENT_COLORS;
  return (
    <svg
      viewBox="0 0 100 100"
      className={`w-full h-full ${className}`}
      role="img"
      aria-label="A rolled parchment scroll"
    >
      <defs>
        <linearGradient id="parchment-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={paper} />
          <stop offset="100%" stopColor={paperShade} />
        </linearGradient>
      </defs>

      {/* Rod, poking out both ends of the roll. */}
      <rect x="12" y="45.5" width="76" height="9" rx="4.5" fill={rod} />

      {/* The rolled sheet. */}
      <rect x="22" y="34" width="56" height="32" rx="6" fill="url(#parchment-paper)" />

      {/* A furled edge, so the silhouette reads as paper rather than a tube. */}
      <path
        d="M22 50 q6 -5 12 0 q6 5 12 0 q6 -5 12 0 q6 5 12 0"
        fill="none"
        stroke={paperShade}
        strokeWidth="1.5"
        opacity="0.7"
      />

      {/* Ribbon tie -- small, but it is what makes the shape legible. */}
      <rect x="46" y="30" width="8" height="40" rx="2" fill={ribbon} />
    </svg>
  );
}
