'use client';

import SpinningModelViewer from '@/components/SpinningModelViewer';
import { skinUrl } from '@/lib/frogSkins';
import { pixelImageStyle, skinPicture } from '@/lib/pixelArt';
import { useTextMode } from '@/lib/textMode';

/**
 * A skin's preview, filling its box. SD and HD spin the 3D model; Low
 * Definition (lib/textMode.ts) draws the skin's 32x32 face on its aura
 * instead (lib/pixelArt.ts) and never starts a 3D scene -- so nothing is drawn until
 * the mode is known.
 */
export default function SkinPreview({
  skin,
  targetSize = 1.8,
  spinSpeed = 0.6,
}: {
  skin: string;
  targetSize?: number;
  spinSpeed?: number;
}) {
  const lowDefinition = useTextMode();
  if (lowDefinition === null) return null;
  if (lowDefinition) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small fixed set of local static assets
      <img
        src={skinPicture(skin, true, true)}
        alt=""
        className="w-full h-full object-contain"
        style={pixelImageStyle}
        draggable={false}
      />
    );
  }
  return <SpinningModelViewer key={skin} url={skinUrl(skin)} targetSize={targetSize} spinSpeed={spinSpeed} />;
}
