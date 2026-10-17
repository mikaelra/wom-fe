import * as Astronomy from 'astronomy-engine';

// The Moon in 8-bit, in its phase right now: a small pixel disc, its lit side
// turned toward the Sun on screen (Mikael, 2026-10-16) -- without a Sun to
// face, as it looks from Greece: the right side growing to full, then the left
// side shrinking to new -- the dark rest drawn faint so the disc still shows.
// For the text Earth's sky (components/text/PixelOrrery.tsx) and the text
// city's (lib/pixelSignpost.ts).

/** The Moon's phase as an angle: 0 new, 90 first quarter, 180 full, 270
 *  last quarter. */
export function moonPhase(date: Date): number {
  return Astronomy.MoonPhase(date);
}

/** A screen direction, x right and y down: where the Sun is from the Moon. */
export type Sunward = [number, number];

/** The pixels of a disc `size` across, each lit or dark in `phase`, as
 *  offsets from its top-left corner -- lit on the side toward `sunward`, or,
 *  without one, on the right waxing and the left waning. */
export function moonPixels(
  size: number,
  phase: number,
  sunward?: Sunward,
): { x: number; y: number; lit: boolean }[] {
  const raw = Math.cos((phase * Math.PI) / 180);
  const c = Math.abs(raw) < 1e-9 ? 0 : raw; // a quarter is exactly half, either way
  const len = sunward ? Math.hypot(sunward[0], sunward[1]) : 0;
  // The unit direction the lit side faces.
  const [sx, sy] = len > 0 ? [sunward![0] / len, sunward![1] / len] : phase % 360 < 180 ? [1, 0] : [-1, 0];
  const half = size / 2;
  const out: { x: number; y: number; lit: boolean }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5 - half) / half;
      const v = (y + 0.5 - half) / half;
      if (u * u + v * v > 1) continue;
      // Along the Sun's direction (a) and across it (b); the terminator sits
      // across the half-width at b, by the phase.
      const a = u * sx + v * sy;
      const b = v * sx - u * sy;
      const edge = Math.sqrt(Math.max(0, 1 - b * b)) * c;
      out.push({ x, y, lit: a > edge });
    }
  }
  return out;
}

export interface MoonPainter {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** The Moon `size` pixels across, centred on (cx, cy). */
export function drawMoon(
  ctx: MoonPainter,
  cx: number,
  cy: number,
  size: number,
  phase: number,
  colors: { lit: string; dark: string },
  sunward?: Sunward,
) {
  const x0 = cx - Math.floor(size / 2);
  const y0 = cy - Math.floor(size / 2);
  for (const p of moonPixels(size, phase, sunward)) {
    ctx.fillStyle = p.lit ? colors.lit : colors.dark;
    ctx.fillRect(x0 + p.x, y0 + p.y, 1, 1);
  }
}
