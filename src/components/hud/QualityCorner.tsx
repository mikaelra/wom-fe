import type { CSSProperties } from 'react';
import GraphicsQualityButton from '@/components/hud/GraphicsQualityButton';

// Where the graphics quality button sits: under the top bar's user-menu
// button, as the Earth's hide-HUD eye does (worldmap/HudToggle.tsx, which
// puts it left of the eye). On the scenes without the eye -- the city, and
// the text Earth and city -- it sits there on its own.

export const CORNER_CLASS = 'absolute right-3 sm:right-[calc(50%-257px)] z-10';
export const CORNER_STYLE: CSSProperties = { top: 'calc(env(safe-area-inset-top) + 0.5rem + 54px + 0.5rem)' };

export default function QualityCorner() {
  return (
    <div className={CORNER_CLASS} style={CORNER_STYLE}>
      <GraphicsQualityButton />
    </div>
  );
}
