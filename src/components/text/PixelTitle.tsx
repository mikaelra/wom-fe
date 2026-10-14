'use client';

import { useEffect, useRef } from 'react';
import { drawText, textWidth } from '@/lib/pixelSignpost';
import { rem } from '@/lib/uiScale';

// A title in the city signpost's 3x5 pixel font (lib/pixelSignpost.ts),
// drawn small on a canvas and scaled up with sharp pixels, with a dark
// drop shadow so it reads on any background. The text is there for screen
// readers as the canvas's label.

const PX = 6; // screen pixels per font pixel
const SHADOW = '#000000';

export default function PixelTitle({ text, color, px = PX }: { text: string; color: string; px?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = textWidth(text) + 1;
  const h = 6;

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    drawText(ctx, text, 1, 1, SHADOW);
    drawText(ctx, text, 0, 0, color);
  }, [text, color, w]);

  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      role="img"
      aria-label={text}
      className="block mx-auto mb-4 max-w-full"
      // height auto: a narrow phone shrinks it whole rather than squashing it.
      style={{ width: rem(w * px), height: 'auto', imageRendering: 'pixelated' }}
    />
  );
}
