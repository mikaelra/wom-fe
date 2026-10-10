import * as Astronomy from 'astronomy-engine';

// The Moon in 8-bit, in its phase right now: a small pixel disc lit as it
// looks from Greece -- the right side growing to full, then the left side
// shrinking to new -- the dark rest drawn faint so the disc still shows.
// For the text Earth's sky (components/text/PixelOrrery.tsx) and the text
// city's (lib/pixelSignpost.ts).

/** The Moon's phase as an angle: 0 new, 90 first quarter, 180 full, 270
 *  last quarter. */
export function moonPhase(date: Date): number {
  return Astronomy.MoonPhase(date);
}

/** The pixels of a disc `size` across, each lit or dark in `phase`, as
 *  offsets from its top-left corner. */
export function moonPixels(size: number, phase: number): { x: number; y: number; lit: boolean }[] {
  const raw = Math.cos((phase * Math.PI) / 180);
  const c = Math.abs(raw) < 1e-9 ? 0 : raw; // a quarter is exactly half, either way
  const waxing = phase % 360 < 180;
  const half = size / 2;
  const out: { x: number; y: number; lit: boolean }[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5 - half) / half;
      const v = (y + 0.5 - half) / half;
      if (u * u + v * v > 1) continue;
      // The terminator: across the row's half-width, by the phase.
      const edge = Math.sqrt(1 - v * v) * c;
      out.push({ x, y, lit: waxing ? u > edge : u < -edge });
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
) {
  const x0 = cx - Math.floor(size / 2);
  const y0 = cy - Math.floor(size / 2);
  for (const p of moonPixels(size, phase)) {
    ctx.fillStyle = p.lit ? colors.lit : colors.dark;
    ctx.fillRect(x0 + p.x, y0 + p.y, 1, 1);
  }
}
