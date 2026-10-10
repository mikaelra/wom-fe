'use client';

import { useEffect, useRef } from 'react';
import {
  PLANETS,
  aroundEarth,
  aroundSun,
  helioPoint,
  moonPoint,
  orreryColor,
  saturnScale,
  sunPosition,
  type OrbitPoint,
  type OrreryBody,
  type Planet,
} from '@/lib/pixelOrrery';

// The text Earth page's background (lib/pixelOrrery.ts): an 8-bit solar
// system with the Earth at the centre of the screen -- the Sun, the Moon and
// the planets where they are right now round the Sun. Drawn on a canvas a
// quarter of the screen's size and scaled up with sharp pixels: no three.js,
// no textures, a few kilobytes of drawing. Moves on as the sky does (once a
// minute); the stars hold still.

const PX = 4; // screen pixels per sky pixel
const BG = '#070b15';
const MINUTE = 60_000;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Stars that stay put from one draw to the next: a small seeded scatter. */
function stars(w: number, h: number): [number, number][] {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // A sparse scatter, so the stars never crowd the planets.
  return Array.from({ length: Math.round((w * h) / 1500) }, () => [Math.floor(rand() * w), Math.floor(rand() * h)]);
}

// Sprite sizes in sky pixels, centred on each body's position.
const SIZE: Record<Exclude<OrreryBody, 'Earth' | 'Sun'>, number> = {
  Moon: 2,
  Mercury: 2,
  Venus: 2,
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
    ctx.fillStyle = '#ffffff'; // its white-hot centre
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillRect(x - 1, y, 3, 1);
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

/**
 * A timewarp's electricity round the Earth (the globe's clouds and
 * lightning, components/worldmap/TimewarpFx.tsx, in 8-bit): short zigzags
 * of sparks in the warp's colours, new ones every frame so they flicker,
 * as many and as bright as its glow.
 */
function drawSparks(ctx: CanvasRenderingContext2D, cx: number, cy: number, glow: number, colors: string[]) {
  const bolts = Math.round(10 * glow);
  ctx.globalAlpha = Math.min(1, 0.3 + glow);
  for (let b = 0; b < bolts; b++) {
    ctx.fillStyle = colors[b % colors.length] ?? '#ffffff';
    const a = Math.random() * Math.PI * 2;
    let x = cx + Math.cos(a) * (4 + Math.random() * 4);
    let y = cy + Math.sin(a) * (4 + Math.random() * 4);
    for (let step = 0; step < 4; step++) {
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      x += Math.cos(a) + (Math.random() - 0.5) * 1.5; // outward, crooked
      y += Math.sin(a) + (Math.random() - 0.5) * 1.5;
    }
  }
  ctx.globalAlpha = 1;
}

export default function PixelOrrery({
  date,
  timewarp,
}: {
  /** The sky's moment: a timewarp's as it runs, or a reverted sky's. Left
   *  out, the sky keeps time itself. */
  date?: Date;
  /** A timewarp playing: its glow (0..1) and colours. */
  timewarp?: { glow: number; colors: string[] } | null;
} = {}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dateRef = useRef(date);
  const fxRef = useRef(timewarp);
  dateRef.current = date;
  fxRef.current = timewarp;
  const redraw = useRef<() => void>(() => undefined);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let starField: [number, number][] = [];
    const moment = () => dateRef.current ?? new Date();
    let now = moment();
    type Now = { planets: Record<Planet, OrbitPoint>; moon: OrbitPoint };
    const positions = (): Now => ({
      planets: Object.fromEntries(PLANETS.map((p) => [p, helioPoint(p, now)])) as Record<Planet, OrbitPoint>,
      moon: moonPoint(now),
    });
    let current = positions();

    const draw = () => {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
      starField.forEach(([x, y], i) => {
        ctx.globalAlpha = i % 3 === 0 ? 0.35 : 0.7; // steady, some dimmer
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      });
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      // Saturn against the edge, everything else to its scale; the margin
      // keeps its sprite (and ring) whole.
      const r = saturnScale(current.planets.Saturn, current.planets.Earth, w / 2 - 4, h / 2 - 4);
      const [sx, sy] = sunPosition(current.planets.Earth, cx, cy, r);
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
      const fx = fxRef.current;
      if (fx && fx.glow > 0) drawSparks(ctx, cx, cy, fx.glow, fx.colors);
    };
    redraw.current = () => {
      now = moment();
      current = positions();
      draw();
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

    // Keeping time itself: once a minute, when no moment is given.
    const minute = setInterval(() => {
      if (!dateRef.current) redraw.current();
    }, MINUTE);

    resize();
    window.addEventListener('resize', resize);
    return () => {
      clearInterval(minute);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // A timewarp's every step (or a new reverted moment) redraws the sky.
  const when = date?.getTime();
  const glow = timewarp?.glow;
  useEffect(() => {
    redraw.current();
  }, [when, glow]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
