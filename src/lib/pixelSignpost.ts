import * as Astronomy from 'astronomy-engine';

// The text city's scene (components/text/PixelSignpost.tsx): the 3D city's
// signpost in 8-bit -- a wooden post with arrow-shaped boards, each lettered
// in a pixel font in its arm's colour -- under the sky over the city as it
// is right now (day, golden hour, twilight or night, from the Sun's real
// height there), with the Sun or the Moon where they really are, above a
// pixel landscape (Mikael, 2026-10-10).

/** The bit of a canvas context the drawing needs (a fake one in tests). */
export interface Painter {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

// ── A 3x5 pixel font ────────────────────────────────────────────────────────

const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '.': ['...', '...', '...', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'],
  "'": ['.#.', '.#.', '...', '...', '...'],
};
export const GLYPH_W = 3;
export const GLYPH_H = 5;
// At scale `s` each font pixel is s x s; letters stay one pixel apart.
const advance = (s: number) => GLYPH_W * s + 1;
const lineHeight = (s: number) => GLYPH_H * s + 2;

/** Width in pixels of a line of text at scale `s`. */
export function textWidth(text: string, s = 1): number {
  return text.length ? text.length * advance(s) - 1 : 0;
}

/** The text in lines no wider than `maxW` pixels at scale `s`, broken
 *  between words. */
export function wrap(text: string, maxW: number, s = 1): string[] {
  const lines: string[] = [];
  for (const word of text.toUpperCase().split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && textWidth(`${last} ${word}`, s) <= maxW) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

export function drawText(ctx: Painter, text: string, x: number, y: number, color: string, s = 1) {
  ctx.fillStyle = color;
  [...text.toUpperCase()].forEach((ch, i) => {
    const glyph = GLYPHS[ch];
    if (!glyph) return; // a space, or a letter it doesn't have
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < GLYPH_W; gx++)
        if (row[gx] === '#') ctx.fillRect(x + i * advance(s) + gx * s, y + gy * s, s, s);
    });
  });
}

// ── The sky over the city ───────────────────────────────────────────────────

export interface Sky {
  /** Top of the sky, then the horizon. */
  top: string;
  horizon: string;
  /** How lit the land is, 0 (night) to 1 (day). */
  light: number;
  /** Stars showing: none, a few, or all. */
  stars: 0 | 0.4 | 1;
}

/** The sky's colours for the Sun at `alt` degrees above the horizon. */
export function skyFor(alt: number): Sky {
  if (alt > 10) return { top: '#2f6fd0', horizon: '#9fd0f5', light: 1, stars: 0 };
  if (alt > 0) return { top: '#4a6fb0', horizon: '#f3b05a', light: 0.85, stars: 0 };
  if (alt > -6) return { top: '#2b2f6b', horizon: '#e0705a', light: 0.55, stars: 0 };
  if (alt > -12) return { top: '#141a45', horizon: '#6b3f6e', light: 0.35, stars: 0.4 };
  return { top: '#070b20', horizon: '#18204a', light: 0.25, stars: 1 };
}

export interface HorizonPos {
  alt: number;
  az: number;
}

/** Where the Sun and the Moon are in the sky over (lat, lng) at `date`. */
export function skyBodies(date: Date, lat: number, lng: number): { sun: HorizonPos; moon: HorizonPos } {
  const observer = new Astronomy.Observer(lat, lng, 0);
  const time = Astronomy.MakeTime(date);
  const at = (body: Astronomy.Body): HorizonPos => {
    const eq = Astronomy.Equator(body, time, observer, true, true);
    const h = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal');
    return { alt: h.altitude, az: h.azimuth };
  };
  return { sun: at(Astronomy.Body.Sun), moon: at(Astronomy.Body.Moon) };
}

/** A sky position on screen, looking south: east at the left edge, west at
 *  the right, the horizon at `horizonY`, straight up at the top. */
export function skyXY(p: HorizonPos, w: number, horizonY: number): [number, number] {
  const x = ((p.az - 90) / 180) * w;
  const y = horizonY - (Math.max(0, p.alt) / 90) * horizonY;
  return [Math.round(x), Math.round(y)];
}

/** A colour mixed toward `to` by `t` (0..1). */
export function mix(from: string, to: string, t: number): string {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

// ── The signpost ────────────────────────────────────────────────────────────

/** Where things stand, as shares of the height. */
export const HORIZON = 0.68;
// The signpost stands close, in the foreground: big boards, and a post that
// runs down past the horizon into the grass in front.
const TOP_ROW = 0.33;
const ROW_GAP = 16; // room for two lines of white info over the lower row
const POST_FOOT = 22; // sky pixels below the horizon

export interface Board {
  label: string;
  color: string;
  side: 'left' | 'right';
  row: 0 | 1;
  /** What is going on there, in white over the board (lines split on \n). */
  info?: string | null;
}

/** A board's box in sky pixels, its point included. */
export interface BoardBox {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  /** The lettering's scale: 2, or 1 for words too long to fit at 2. */
  scale: number;
}

const PAD = 2;
const POINT = 3; // the arrow's tip
export const POST_W = 8;
const BIG = 2; // the lettering's scale

/** Every board's size on a screen `w` sky pixels wide: the same for all,
 *  whatever is written on it -- from the post to the screen's edge, and as
 *  high as a line of big lettering (or two small ones). */
function boardSize(w: number): { bw: number; bh: number; inner: number } {
  const bw = Math.floor(w / 2) - POST_W / 2;
  const textH = Math.max(lineHeight(BIG), 2 * lineHeight(1)) - 2;
  return { bw, bh: textH + PAD * 2, inner: bw - PAD * 2 - POINT };
}

/** Where each board goes on a screen `w` x `h` sky pixels: either side of
 *  the post, one row under the other, all the same size. Its words in big
 *  lettering on one line -- or small, in up to two, should they not fit. */
export function layoutBoard(board: Board, w: number, h: number): BoardBox {
  const cx = Math.floor(w / 2);
  const { bw, bh, inner } = boardSize(w);
  let scale = BIG;
  let lines = [board.label.toUpperCase()];
  if (textWidth(lines[0], BIG) > inner) {
    scale = 1;
    lines = wrap(board.label, inner, 1);
  }
  const y = Math.round(TOP_ROW * h) + board.row * (bh + ROW_GAP);
  const x = board.side === 'left' ? cx - POST_W / 2 - bw : cx + POST_W / 2;
  return { x, y, w: bw, h: bh, lines, scale };
}

// Dark, weathered wood.
const WOOD = '#5e3b1f';
const WOOD_LIGHT = '#74492a';
const WOOD_DARK = '#2e1c0e';

function drawBoard(ctx: Painter, board: Board, box: BoardBox, light: number) {
  const shadeOf = (c: string) => mix(c, '#000000', (1 - light) * 0.6);
  const { x, y, w, h, lines } = box;
  const bodyX = board.side === 'left' ? x + POINT : x;
  const bodyW = w - POINT;
  ctx.fillStyle = shadeOf(WOOD_DARK);
  ctx.fillRect(bodyX - 1, y - 1, bodyW + 2, h + 2); // outline
  ctx.fillStyle = shadeOf(WOOD);
  ctx.fillRect(bodyX, y, bodyW, h);
  ctx.fillStyle = shadeOf(WOOD_LIGHT);
  ctx.fillRect(bodyX, y, bodyW, 1); // the plank's lit edge
  // The point, a step at a time.
  for (let i = 0; i < POINT; i++) {
    const inset = i + 1;
    const px = board.side === 'left' ? x + POINT - 1 - i : x + bodyW + i;
    ctx.fillStyle = shadeOf(WOOD_DARK);
    ctx.fillRect(px, y - 1 + inset, 1, h + 2 - inset * 2);
    if (h - inset * 2 > 0) {
      ctx.fillStyle = shadeOf(WOOD);
      ctx.fillRect(px, y + inset, 1, h - inset * 2);
    }
  }
  // The lettering keeps its colour, day or night: it glows, as the 3D one does.
  // Centred on the board, across and down.
  const textH = box.lines.length * lineHeight(box.scale) - 2;
  const ty = y + Math.floor((h - textH) / 2);
  lines.forEach((line, i) => {
    const lx = bodyX + Math.floor((bodyW - textWidth(line, box.scale)) / 2);
    drawText(ctx, line, lx, ty + i * lineHeight(box.scale), board.color, box.scale);
  });
}

/** The white info over a board, in the pixel font: wrapped to the board's
 *  width, bottom line just over its top edge, with a dark shadow so it reads
 *  on any sky. */
function drawInfo(ctx: Painter, info: string, box: BoardBox) {
  const lines = info.split('\n').flatMap((part) => wrap(part, box.w, 1));
  const lh = lineHeight(1);
  const top = box.y - 2 - lines.length * lh;
  lines.forEach((line, i) => {
    const x = box.x + Math.floor((box.w - textWidth(line)) / 2);
    const y = top + i * lh;
    drawText(ctx, line, x + 1, y + 1, '#000000');
    drawText(ctx, line, x, y, '#ffffff');
  });
}

/** Stars that stay put: a sparse seeded scatter over the sky. */
function stars(w: number, horizonY: number): [number, number][] {
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: Math.round((w * horizonY) / 300) }, () => [Math.floor(rand() * w), Math.floor(rand() * horizonY)]);
}

/** The whole scene: sky, Sun or Moon, landscape, the post and its boards. */
export function drawSignpostScene(
  ctx: Painter,
  w: number,
  h: number,
  boards: Board[],
  bodies: { sun: HorizonPos; moon: HorizonPos },
  timewarp?: { glow: number; colors: string[] } | null,
) {
  const sky = skyFor(bodies.sun.alt);
  const horizonY = Math.round(HORIZON * h);
  const BANDS = 8; // the sky in bands, top to horizon -- 8-bit, not a gradient
  for (let b = 0; b < BANDS; b++) {
    ctx.fillStyle = mix(sky.top, sky.horizon, b / (BANDS - 1));
    const y0 = Math.round((b / BANDS) * horizonY);
    const y1 = Math.round(((b + 1) / BANDS) * horizonY);
    ctx.fillRect(0, y0, w, y1 - y0);
  }
  if (sky.stars) {
    ctx.fillStyle = '#ffffff';
    stars(w, horizonY).forEach(([sx, sy], i) => {
      if (sky.stars === 1 || i % 3 === 0) ctx.fillRect(sx, sy, 1, 1);
    });
  }
  if (bodies.moon.alt > 0) {
    const [mx, my] = skyXY(bodies.moon, w, horizonY);
    ctx.fillStyle = '#e8ecf5';
    ctx.fillRect(mx - 1, my - 2, 3, 5);
    ctx.fillRect(mx - 2, my - 1, 5, 3);
  }
  if (bodies.sun.alt > -1) {
    const [sx, sy] = skyXY(bodies.sun, w, horizonY);
    ctx.fillStyle = '#ffe600';
    ctx.fillRect(sx - 2, sy - 3, 5, 7);
    ctx.fillRect(sx - 3, sy - 2, 7, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - 1, sy - 1, 3, 3);
  }
  // A timewarp's electricity in the sky, in its colours: crooked bolts
  // flickering down from above, as many and as bright as its glow.
  if (timewarp && timewarp.glow > 0) {
    const bolts = Math.round(8 * timewarp.glow);
    for (let b = 0; b < bolts; b++) {
      ctx.fillStyle = timewarp.colors[b % timewarp.colors.length] ?? '#ffffff';
      let x = Math.random() * w;
      let y = Math.random() * horizonY * 0.5;
      for (let step = 0; step < 6; step++) {
        ctx.fillRect(Math.round(x), Math.round(y), 1, 2);
        x += Math.random() < 0.5 ? -1 : 1;
        y += 2;
      }
    }
  }
  // Hills on the horizon, then the land, darker as the light goes.
  const land = (c: string) => mix(c, '#0b1026', 1 - sky.light);
  ctx.fillStyle = land('#5b7f4a');
  for (let x = 0; x < w; x++) {
    const hill = Math.round(4 + 3 * Math.sin(x / 9) + 2 * Math.sin(x / 4 + 1));
    ctx.fillRect(x, horizonY - hill, 1, hill);
  }
  ctx.fillStyle = land('#4a7c3a');
  ctx.fillRect(0, horizonY, w, h - horizonY);
  ctx.fillStyle = land('#7a5a3a'); // the earth under the grass
  ctx.fillRect(0, horizonY + 4, w, h - horizonY - 4);
  ctx.fillStyle = land('#5e4329');
  for (let y = horizonY + 7; y < h; y += 4) for (let x = (y * 7) % 9; x < w; x += 9) ctx.fillRect(x, y, 2, 1);
  // The post, from above the top board into the ground.
  const cx = Math.floor(w / 2);
  const top = Math.round(TOP_ROW * h) - 4;
  const foot = Math.min(h, horizonY + POST_FOOT);
  ctx.fillStyle = mix(WOOD_DARK, '#000000', (1 - sky.light) * 0.6);
  ctx.fillRect(cx - POST_W / 2, top, POST_W, foot - top);
  ctx.fillStyle = mix(WOOD, '#000000', (1 - sky.light) * 0.6);
  ctx.fillRect(cx - POST_W / 2 + 1, top, POST_W - 2, foot - top);
  ctx.fillStyle = mix(WOOD_LIGHT, '#000000', (1 - sky.light) * 0.6);
  ctx.fillRect(cx - POST_W / 2 + 2, top, 1, foot - top); // the light down one side
  ctx.fillStyle = mix(WOOD_DARK, '#000000', (1 - sky.light) * 0.6);
  ctx.fillRect(cx - POST_W / 2 - 1, top - 2, POST_W + 2, 3); // its cap
  // Grass round its foot, in front of it: it stands close.
  ctx.fillStyle = land('#3f6b31');
  for (let i = -POST_W; i <= POST_W; i += 2) ctx.fillRect(cx + i, foot - 2 - (Math.abs(i) % 3), 1, 3);
  for (const board of boards) {
    const box = layoutBoard(board, w, h);
    drawBoard(ctx, board, box, sky.light);
    if (board.info) drawInfo(ctx, board.info, box);
  }
}
