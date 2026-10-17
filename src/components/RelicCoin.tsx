'use client';

import { useGLTF } from '@react-three/drei';
import SpinningModelViewer from '@/components/SpinningModelViewer';
// The model urls: lib/relics.ts (no three.js there).
import { COIN_MODEL_URL, RELIC_MODEL_URLS, relicModelUrl } from '@/lib/relics';
import { PIXEL_COIN_URL, pixelImageStyle, pixelRelicUrl } from '@/lib/pixelArt';
import { useTextMode } from '@/lib/textMode';
export { relicModelUrl };



// Relics whose inventory card shows a flat picture instead of the spinning
// model -- the model is kept for where the relic is staged large (the
// merchant's counter, via relicModelUrl).
const RELIC_THUMBNAIL_URLS: Record<string, string> = {
  Pen: '/models/relics/pen_v1.thumbnail.png',
};


// A small, self-contained <Canvas> per card -- relic counts per player are
// low (a handful of distinct bosses at most), so this stays well under
// browsers' concurrent-WebGL-context limits. Revisit with a shared/View-based
// canvas if that stops being true.
export default function RelicCoin({ relicName }: { relicName?: string } = {}) {
  const lowDefinition = useTextMode();
  // Low Definition (lib/pixelArt.ts): the relic's 32x32 picture, or its glyph
  // -- never a 3D model. Nothing is drawn until the mode is known, so a
  // Low Definition player never starts loading one.
  if (lowDefinition === null) return null;
  if (lowDefinition) {
    // Any relic without a picture of its own is the gold coin, as it is in 3D.
    const url = pixelRelicUrl(relicName) ?? PIXEL_COIN_URL;
    // eslint-disable-next-line @next/next/no-img-element -- a small static file from public/
    return <img src={url} alt={relicName} className="w-full h-full object-contain" style={pixelImageStyle} draggable={false} />;
  }
  const thumbnail = relicName && RELIC_THUMBNAIL_URLS[relicName];
  if (thumbnail) {
    // eslint-disable-next-line @next/next/no-img-element -- a small static file from public/, same as the inventory's skin previews
    return <img src={thumbnail} alt={relicName} className="w-full h-full object-contain" draggable={false} />;
  }
  return <SpinningModelViewer url={relicModelUrl(relicName)} targetSize={1.1} spinSpeed={0.8} />;
}

useGLTF.preload(COIN_MODEL_URL);
for (const url of Object.values(RELIC_MODEL_URLS)) useGLTF.preload(url);
