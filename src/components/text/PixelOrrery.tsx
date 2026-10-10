'use client';

import { useEffect, useRef } from 'react';
import {
  PLANETS,
  SKY_STARS,
  azimuthAt,
  helioPoint,
  moonPoint,
  orreryColor,
  project,
  projectStar,
  sceneBodies,
  startAzimuth,
  turntableCamera,
  type OrbitPoint,
  type OrreryBody,
  type Planet,
} from '@/lib/pixelOrrery';

// The text Earth page's background (lib/pixelOrrery.ts): an 8-bit solar
// system with the Earth at the centre of the screen -- the Sun, the Moon and
// the planets where they are right now round the Sun -- seen from a little
// above the ecliptic by a camera turning round the Earth, as the 3D globe's
// does, with the real bright stars turning behind. Drawn on a canvas a
// quarter of the screen's size and scaled up with sharp pixels: no three.js,
// no textures, a few kilobytes of drawing, eight frames a second (each moves
// things a pixel at most). It stands still while the page is hidden, and for
// anyone who has asked their device for less motion.

const PX = 4; // screen pixels per sky pixel
const BG = '#070b15';
const MINUTE = 60_000;
const FRAME_MS = 125;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

// Sprite sizes in sky pixels, centred on each body's position.
const SIZE: Record<Exclude<OrreryBody, 'Earth' | 'Sun'>, number> = {
  Moon: 2,
  Mercury: 2,
  Venus: 2,
  Mars: 3,
  Jupiter: 4,
  Saturn: 3,
};

const NEARER = 1.15;

/** A filled square of side `n` centred on (x, y). */
function square(ctx: CanvasRenderingContext2D, x: number, y: number, n: number) {
  const o = Math.floor(n / 2);
  ctx.fillRect(x - o, y - o, n, n);
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  body: Exclude<OrreryBody, 'Earth'>,
  x: number,
  y: number,
  near: number,
) {
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
  // Nearer than the Earth by a fair bit: a pixel bigger.
  square(ctx, x, y, SIZE[body] + (near > NEARER ? 1 : 0));
  if (body === 'Saturn') {
    ctx.fillRect(x - 3, y + 1, 2, 1); // its ring
    ctx.fillRect(x + 2, y - 1, 2, 1);
  }
}

/** The Moon kept a few pixels off the Earth, whichever way the camera looks
 *  at its little ring. */
function offEarth(x: number, y: number, cx: number, cy: number): [number, number] {
  const d = Math.hypot(x - cx, y - cy);
  if (d >= 3) return [x, y];
  if (d === 0) return [cx + 3, cy];
  return [Math.round(cx + ((x - cx) * 3) / d), Math.round(cy + ((y - cy) * 3) / d)];
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
    const moment = () => dateRef.current ?? new Date();
    let now = moment();
    type Now = { planets: Record<Planet, OrbitPoint>; moon: OrbitPoint };
    const positions = (): Now => ({
      planets: Object.fromEntries(PLANETS.map((p) => [p, helioPoint(p, now)])) as Record<Planet, OrbitPoint>,
      moon: moonPoint(now),
    });
    const sceneNow = () => {
      const { planets, moon } = positions();
      return sceneBodies(planets, moon);
    };
    let bodies = sceneNow();
    // The camera starts with the Sun behind the Earth, as the globe's does.
    const start = startAzimuth(bodies.Sun);
    const startedAt = Date.now();
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const draw = () => {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      // A margin keeps Saturn's sprite (and ring) whole at the edge.
      const cam = turntableCamera(
        still ? start : azimuthAt(start, Date.now() - startedAt),
        cx,
        cy,
        w / 2 - 4,
        h / 2 - 4,
      );
      ctx.fillStyle = '#ffffff';
      for (const star of SKY_STARS) {
        const at = projectStar(cam, star.dir, w, h);
        if (!at) continue;
        ctx.globalAlpha = star.mag < 1 ? 0.9 : star.mag < 2 ? 0.6 : 0.35; // steady, dimmer as fainter
        ctx.fillRect(at[0], at[1], 1, 1);
      }
      ctx.globalAlpha = 1;
      // Farthest first, so the near side is drawn over the far.
      const shown = (Object.entries(bodies) as [Exclude<OrreryBody, 'Earth'>, (typeof bodies)['Sun']][])
        .map(([body, p]) => ({ body, at: project(cam, p) }))
        .filter((b): b is { body: Exclude<OrreryBody, 'Earth'>; at: NonNullable<ReturnType<typeof project>> } => !!b.at)
        .sort((a, b) => a.at.near - b.at.near);
      let earthDrawn = false;
      for (const { body, at } of shown) {
        if (!earthDrawn && at.near > 1) {
          drawEarth(ctx, cx, cy);
          earthDrawn = true;
        }
        let { x, y } = at;
        if (body === 'Moon') [x, y] = offEarth(x, y, cx, cy);
        drawBody(ctx, body, x, y, at.near);
      }
      if (!earthDrawn) drawEarth(ctx, cx, cy);
      const fx = fxRef.current;
      if (fx && fx.glow > 0) drawSparks(ctx, cx, cy, fx.glow, fx.colors);
    };
    redraw.current = () => {
      now = moment();
      bodies = sceneNow();
      draw();
    };

    const resize = () => {
      w = Math.ceil(window.innerWidth / PX);
      h = Math.ceil(window.innerHeight / PX);
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = false;
      draw();
    };

    // The camera turning, while the page is in view.
    const turn = setInterval(() => {
      if (!still && document.visibilityState !== 'hidden') draw();
    }, FRAME_MS);
    // Keeping time itself: once a minute, when no moment is given.
    const minute = setInterval(() => {
      if (!dateRef.current) redraw.current();
    }, MINUTE);

    resize();
    window.addEventListener('resize', resize);
    return () => {
      clearInterval(turn);
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
