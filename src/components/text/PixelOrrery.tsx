'use client';

import { useEffect, useRef } from 'react';
import { ORRERY_BODIES, geoPoint, orreryColor, toXY, trail, type GeoPoint, type OrreryBody } from '@/lib/pixelOrrery';

// The text Earth page's background (lib/pixelOrrery.ts): an 8-bit sky with
// the Earth at its centre -- the Sun, the Moon and the planets where they
// are right now, each trailing its path. Drawn on a canvas a quarter of the
// screen's size and scaled up with sharp pixels: no three.js, no textures,
// a few kilobytes of drawing. Moves on as the sky does (once a minute), and
// its stars twinkle.

const PX = 4; // screen pixels per sky pixel
const BG = '#070b15';
const MINUTE = 60_000;
const TWINKLE_MS = 700;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Stars that stay put from one draw to the next: a small seeded scatter. */
function stars(w: number, h: number): [number, number][] {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: Math.round((w * h) / 120) }, () => [Math.floor(rand() * w), Math.floor(rand() * h)]);
}

function drawBody(ctx: CanvasRenderingContext2D, body: OrreryBody, x: number, y: number) {
  ctx.fillStyle = hex(orreryColor(body));
  if (body === 'Sun') {
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillRect(x, y - 3, 1, 1); // rays
    ctx.fillRect(x, y + 3, 1, 1);
    ctx.fillRect(x - 3, y, 1, 1);
    ctx.fillRect(x + 3, y, 1, 1);
  } else if (body === 'Moon' || body === 'Mercury') {
    ctx.fillRect(x, y, 1, 1);
  } else {
    ctx.fillRect(x, y, 2, 2);
    if (body === 'Saturn') {
      ctx.fillRect(x - 1, y + 1, 1, 1); // its ring
      ctx.fillRect(x + 2, y, 1, 1);
    }
  }
}

function drawEarth(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(cx - 1, cy - 1, 3, 3);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(cx, cy - 1, 1, 1);
  ctx.fillRect(cx - 1, cy, 1, 1);
}

export default function PixelOrrery() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let starField: [number, number][] = [];
    let now = new Date();
    const positions = () => Object.fromEntries(ORRERY_BODIES.map((b) => [b, geoPoint(b, now)])) as Record<OrreryBody, GeoPoint>;
    let current = positions();
    let paths: Partial<Record<OrreryBody, GeoPoint[]>> = {};
    let twinkle = 0;

    const draw = () => {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
      starField.forEach(([x, y], i) => {
        ctx.globalAlpha = (i + twinkle) % 9 === 0 ? 0.25 : 0.7;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      });
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      const r = Math.min(w, h) / 2 - 4;
      for (const body of ORRERY_BODIES) {
        const path = paths[body] ?? [];
        ctx.fillStyle = hex(orreryColor(body));
        path.forEach((p, i) => {
          ctx.globalAlpha = 0.12 + 0.4 * (i / path.length); // fading into the past
          const [x, y] = toXY(body, p, cx, cy, r);
          ctx.fillRect(x, y, 1, 1);
        });
      }
      ctx.globalAlpha = 1;
      drawEarth(ctx, cx, cy);
      for (const body of ORRERY_BODIES) {
        const [x, y] = toXY(body, current[body], cx, cy, r);
        drawBody(ctx, body, x, y);
      }
    };

    const resize = () => {
      w = Math.ceil(window.innerWidth / PX);
      h = Math.ceil(window.innerHeight / PX);
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = false;
      starField = stars(w, h);
      draw();
    };

    // The trails are the costly part: worked out once, after the page is
    // already up, and again each minute only for where the bodies are now.
    const traced = setTimeout(() => {
      paths = Object.fromEntries(ORRERY_BODIES.map((b) => [b, trail(b, now)]));
      draw();
    }, 0);
    const minute = setInterval(() => {
      now = new Date();
      current = positions();
      draw();
    }, MINUTE);
    const twinkling = setInterval(() => {
      twinkle = (twinkle + 1) % 9;
      draw();
    }, TWINKLE_MS);

    resize();
    window.addEventListener('resize', resize);
    return () => {
      clearTimeout(traced);
      clearInterval(minute);
      clearInterval(twinkling);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
