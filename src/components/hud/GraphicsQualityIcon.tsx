import type { GraphicsQuality } from '@/lib/graphicsQuality';

// The graphics qualities as their short names (Mikael, 2026-10-11): LD for
// text mode (no 3D), SD for the standard web textures, HD for the HD ones.

export const QUALITY_LABEL: Record<GraphicsQuality, string> = {
  text: 'LD',
  sd: 'SD',
  hd: 'HD',
};

export default function GraphicsQualityIcon({ quality }: { quality: GraphicsQuality }) {
  return (
    <span aria-hidden="true" className="text-xs font-bold leading-none text-white">
      {QUALITY_LABEL[quality]}
    </span>
  );
}
