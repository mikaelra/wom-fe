'use client';

import { useEffect, useRef, useState } from 'react';
import { getInventory } from '@/lib/api';
import { skinColor } from '@/lib/frogSkins';
import { getStoredAccountToken } from '@/lib/http';
import { drawCity } from '@/lib/pixelCity';

// The text city's background (lib/pixelCity.ts): an 8-bit ancient Greek
// city with the player's frog in the middle, in the colour of the skin they
// wear (the same equipped skin the top bar shows). A canvas a quarter of the
// screen's size, scaled up with sharp pixels; drawn once, and again on a
// resize or once the skin is known.

const PX = 4; // screen pixels per sky pixel
const DEFAULT_SKIN = 'frog_green_v1';

export default function PixelCity() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [skin, setSkin] = useState(DEFAULT_SKIN);

  useEffect(() => {
    const token = getStoredAccountToken();
    if (!token) return;
    getInventory(token)
      .then((data) => setSkin(data.equipped_skin ?? DEFAULT_SKIN))
      .catch(() => undefined); // the default frog, then
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const draw = () => {
      const w = Math.ceil(window.innerWidth / PX);
      const h = Math.ceil(window.innerHeight / PX);
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = false;
      drawCity(ctx, w, h, skinColor(skin));
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [skin]);

  return (
    <canvas ref={ref} aria-hidden="true" className="fixed inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />
  );
}
