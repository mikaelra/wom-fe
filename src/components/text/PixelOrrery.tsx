'use client';

import { useEffect, useRef } from 'react';
import {
  PLANETS,
  aroundEarth,
  aroundSun,
  helioPoint,
  moonPoint,
  orbit,
  orreryColor,
  scaleFor,
  sunPosition,
  type OrbitPoint,
  type OrreryBody,
  type Planet,
} from '@/lib/pixelOrrery';

// The text Earth page's background (lib/pixelOrrery.ts): an 8-bit solar
// system with the Earth at the centre of the screen -- the Sun, the Moon and
// the planets where they are right now, each planet on its orbit round the
// Sun. Drawn on a canvas a quarter of the
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
  // A sparse scatter, so the stars never crowd the orbits.
  return Array.from({ length: Math.round((w * h) / 1500) }, () => [Math.floor(rand() * w), Math.floor(rand() * h)]);
}

// Sprite sizes in sky pixels, centred on each body's position.
const SIZE: Record<Exclude<OrreryBody, 'Earth' | 'Sun'>, number> = {
  Moon: 2,
  Mercury: 2,
  Venus: 3,
  Mars: 3,
  Jupiter: 4,
  Saturn: 3,
};

/** A filled square of side `n` centred on (x, y). */
function square(ctx: CanvasRenderingContext2D, x: number, y: number, n: number) {
  const o = Math.floor(n / 2);
  ctx.fillRect(x - o, y - o, n, n);
}

function drawBody(ctx: CanvasRenderingContext2D, body: Exclude<OrreryBody, 'Earth'>, x: number, y: number) {
  ctx.fillStyle = hex(orreryColor(body));
  if (body === 'Sun') {
    square(ctx, x, y, 5);
    ctx.fillRect(x, y - 5, 1, 2); // rays
    ctx.fillRect(x, y + 4, 1, 2);
    ctx.fillRect(x - 5, y, 2, 1);
    ctx.fillRect(x + 4, y, 2, 1);
    return;
  }
  square(ctx, x, y, SIZE[body]);
  if (body === 'Saturn') {
    ctx.fillRect(x - 3, y + 1, 2, 1); // its ring
    ctx.fillRect(x + 2, y - 1, 2, 1);
  }
}

function drawEarth(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.fillStyle = hex(orreryColor('Earth'));
  square(ctx, cx, cy, 3);
  ctx.fillStyle = '#22c55e'; // land
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
    type Now = { planets: Record<Planet, OrbitPoint>; moon: OrbitPoint };
    const positions = (): Now => ({
      planets: Object.fromEntries(PLANETS.map((p) => [p, helioPoint(p, now)])) as Record<Planet, OrbitPoint>,
      moon: moonPoint(now),
    });
    let current = positions();
    let orbits: Partial<Record<Planet, OrbitPoint[]>> = {};
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
      const r = scaleFor(Math.min(w, h) / 2 - 2);
      const [sx, sy] = sunPosition(current.planets.Earth, cx, cy, r);
      ctx.globalAlpha = 0.35;
      for (const planet of PLANETS) {
        ctx.fillStyle = hex(orreryColor(planet));
        for (const p of orbits[planet] ?? []) {
          const [x, y] = aroundSun(p, sx, sy, r);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
      drawBody(ctx, 'Sun', sx, sy);
      for (const planet of PLANETS) {
        if (planet === 'Earth') continue;
        const [x, y] = aroundSun(current.planets[planet], sx, sy, r);
        drawBody(ctx, planet, x, y);
      }
      drawEarth(ctx, cx, cy);
      const [mx, my] = aroundEarth(current.moon, cx, cy, r);
      drawBody(ctx, 'Moon', mx, my);
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

    // The orbits are the costly part: worked out once, after the page is
    // already up; each minute only where the bodies are now.
    const traced = setTimeout(() => {
      orbits = Object.fromEntries(PLANETS.map((p) => [p, orbit(p, now)]));
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
