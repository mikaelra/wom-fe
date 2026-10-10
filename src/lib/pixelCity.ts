// The text city's background (components/text/PixelCity.tsx): an 8-bit
// overview of an ancient Greek city, with the player's own frog -- in the
// colour of the skin they wear -- in the middle of it (Mikael, 2026-10-10).
// The Colosseum top left, the Temple of Zeus top right, the market bottom
// left and the harbour bottom right; the text city puts its links on them
// (components/text/TextCity.tsx): RANKED, HADES, MARKET, EARTH.
//
// Everything is drawn in code, a sky pixel at a time, onto a canvas a
// quarter of the screen's size -- no images to download.

/** Where each place stands, as shares of the screen's width and height. */
export const CITY_SPOTS = {
  ranked: { x: 0.27, y: 0.36 },
  hades: { x: 0.73, y: 0.36 },
  market: { x: 0.27, y: 0.76 },
  earth: { x: 0.73, y: 0.76 },
  frog: { x: 0.5, y: 0.56 },
} as const;
export type CitySpot = keyof typeof CITY_SPOTS;

/** The bit of a canvas context the drawing needs (a fake one in tests). */
export interface Painter {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

const GRASS = '#4a7c3a';
const GRASS_DARK = '#3f6b31';
const PAVING = '#cdbf96';
const PAVING_DARK = '#b8a97f';
const STONE = '#d9c49a';
const STONE_DARK = '#a8915f';
const ARCH = '#5a4630';
const SAND = '#e8d5a0';
const MARBLE = '#f1ede4';
const MARBLE_SHADE = '#c9c3b5';
const GOLD = '#f5c542';
const WOOD = '#8a5a34';
const WOOD_DARK = '#5e3b20';
const WATER = '#2f6fb3';
const WAVE = '#6fa8dc';
const CYPRESS = '#1f4d2b';
const WALL = '#efe9dc';
const ROOF = '#b5532f';

/** Integer screen-to-sky position of a spot. */
export function spotXY(spot: CitySpot, w: number, h: number): [number, number] {
  return [Math.round(CITY_SPOTS[spot].x * w), Math.round(CITY_SPOTS[spot].y * h)];
}

function inEllipse(dx: number, dy: number, a: number, b: number): boolean {
  return (dx * dx) / (a * a) + (dy * dy) / (b * b) <= 1;
}

/** The ground: grass, a paved plaza in the middle and paved roads out to
 *  each place. */
export function drawGround(ctx: Painter, w: number, h: number) {
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = GRASS_DARK; // a little texture in the grass
  for (let y = 1; y < h; y += 5) for (let x = (y * 3) % 7; x < w; x += 7) ctx.fillRect(x, y, 1, 1);
  const [fx, fy] = spotXY('frog', w, h);
  for (const spot of ['ranked', 'hades', 'market', 'earth'] as const) {
    const [x, y] = spotXY(spot, w, h);
    ctx.fillStyle = PAVING;
    const steps = Math.max(Math.abs(x - fx), Math.abs(y - fy));
    for (let i = 0; i <= steps; i++) {
      const px = Math.round(fx + ((x - fx) * i) / steps);
      const py = Math.round(fy + ((y - fy) * i) / steps);
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }
  }
  const pr = Math.max(8, Math.round(Math.min(w, h) * 0.13));
  for (let dy = -pr; dy <= pr; dy++) {
    for (let dx = -pr; dx <= pr; dx++) {
      if (!inEllipse(dx, dy, pr, pr * 0.8)) continue;
      ctx.fillStyle = (dx + dy) % 4 === 0 ? PAVING_DARK : PAVING;
      ctx.fillRect(fx + dx, fy + dy, 1, 1);
    }
  }
}

/** The Colosseum: an oval of stone round a sandy arena, arches on its face. */
export function drawColosseum(ctx: Painter, cx: number, cy: number) {
  const a = 15;
  const b = 8;
  for (let dy = -b; dy <= b; dy++) {
    for (let dx = -a; dx <= a; dx++) {
      if (!inEllipse(dx, dy, a, b)) continue;
      const arena = inEllipse(dx, dy + 1, 10, 4);
      const rim = !inEllipse(dx, dy, a - 1, b - 1);
      const arch = dy > 1 && !arena && dx % 2 === 0 && (dy === 3 || dy === 5);
      ctx.fillStyle = arena ? SAND : arch ? ARCH : rim ? STONE_DARK : STONE;
      ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
}

/** The Temple of Zeus: steps, six columns, the roof's triangle, his gold. */
export function drawTemple(ctx: Painter, cx: number, cy: number) {
  const left = cx - 11;
  const base = cy + 7;
  ctx.fillStyle = MARBLE_SHADE;
  ctx.fillRect(left - 1, base + 1, 24, 1); // steps
  ctx.fillStyle = MARBLE;
  ctx.fillRect(left, base, 22, 1);
  for (let i = 0; i < 6; i++) {
    const x = left + 1 + i * 4;
    ctx.fillStyle = MARBLE;
    ctx.fillRect(x, cy - 2, 2, 9);
    ctx.fillStyle = MARBLE_SHADE;
    ctx.fillRect(x + 1, cy - 2, 1, 9);
  }
  ctx.fillStyle = MARBLE_SHADE;
  ctx.fillRect(left, cy - 3, 22, 1); // the beam over the columns
  ctx.fillStyle = MARBLE;
  ctx.fillRect(left, cy - 4, 22, 1);
  for (let row = 0; row < 5; row++) {
    ctx.fillStyle = row === 0 ? MARBLE_SHADE : MARBLE;
    ctx.fillRect(left + row * 2, cy - 5 - row, 22 - row * 4, 1);
  }
  ctx.fillStyle = GOLD;
  ctx.fillRect(cx - 1, cy - 7, 2, 2);
}

/** The market: three stalls under striped awnings, goods on the counters. */
export function drawMarket(ctx: Painter, cx: number, cy: number) {
  const stripes = [
    ['#c0392b', '#f4ecd8'],
    ['#2e6db4', '#f4ecd8'],
    ['#2f8f4e', '#f4ecd8'],
  ];
  const goods = ['#e74c3c', '#f39c12', '#8e44ad', '#27ae60'];
  for (let s = 0; s < 3; s++) {
    const left = cx - 14 + s * 10;
    for (let x = 0; x < 9; x++) {
      ctx.fillStyle = stripes[s][x % 2];
      ctx.fillRect(left + x, cy - 4, 1, 3);
    }
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(left, cy - 1, 1, 3); // posts
    ctx.fillRect(left + 8, cy - 1, 1, 3);
    ctx.fillStyle = WOOD;
    ctx.fillRect(left, cy + 2, 9, 2); // the counter
    for (let g = 0; g < 3; g++) {
      ctx.fillStyle = goods[(s + g) % goods.length];
      ctx.fillRect(left + 2 + g * 2, cy + 1, 1, 1);
    }
  }
}

/** The harbour: the sea out to the corner, a pier, and a ship with a sail. */
export function drawHarbour(ctx: Painter, cx: number, cy: number, w: number, h: number) {
  const top = cy - 6;
  const left = cx - 14;
  ctx.fillStyle = WATER;
  ctx.fillRect(left, top, w - left, h - top);
  ctx.fillStyle = WAVE;
  for (let y = top + 2; y < h; y += 4) for (let x = left + ((y * 5) % 6); x < w; x += 6) ctx.fillRect(x, y, 2, 1);
  ctx.fillStyle = STONE_DARK; // the quay
  ctx.fillRect(left, top, w - left, 1);
  ctx.fillRect(left, top, 1, h - top);
  ctx.fillStyle = WOOD; // the pier
  ctx.fillRect(left + 1, cy, 10, 2);
  ctx.fillStyle = WOOD_DARK;
  ctx.fillRect(left + 3, cy + 2, 1, 1);
  ctx.fillRect(left + 8, cy + 2, 1, 1);
  const sx = cx + 4; // the ship
  ctx.fillStyle = WOOD_DARK;
  ctx.fillRect(sx - 5, cy + 3, 11, 1);
  ctx.fillStyle = WOOD;
  ctx.fillRect(sx - 4, cy + 4, 9, 1);
  ctx.fillRect(sx, cy - 5, 1, 8); // mast
  for (let row = 0; row < 6; row++) {
    ctx.fillStyle = row === 2 ? '#c0392b' : '#f4ecd8';
    ctx.fillRect(sx + 1, cy - 5 + row, Math.max(1, 6 - row), 1);
  }
}

/** A few cypresses and white houses with red roofs about the city. */
export function drawTownscape(ctx: Painter, w: number, h: number) {
  const trees: [number, number][] = [
    [0.08, 0.5], [0.12, 0.62], [0.9, 0.5], [0.5, 0.33], [0.42, 0.88], [0.58, 0.9], [0.06, 0.92],
  ];
  for (const [tx, ty] of trees) {
    const x = Math.round(tx * w);
    const y = Math.round(ty * h);
    ctx.fillStyle = CYPRESS;
    ctx.fillRect(x, y - 4, 1, 1);
    ctx.fillRect(x - 1, y - 3, 3, 4);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(x, y + 1, 1, 1);
  }
  const houses: [number, number][] = [[0.36, 0.48], [0.64, 0.48], [0.36, 0.66], [0.64, 0.64], [0.5, 0.42]];
  for (const [hx, hy] of houses) {
    const x = Math.round(hx * w);
    const y = Math.round(hy * h);
    ctx.fillStyle = ROOF;
    ctx.fillRect(x - 2, y - 2, 5, 2);
    ctx.fillStyle = WALL;
    ctx.fillRect(x - 2, y, 5, 3);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(x, y + 1, 1, 2);
  }
}

// The frog, eleven sky pixels wide: B body, D its shade, W eye, K pupil, M mouth.
const FROG = [
  '..WW...WW..',
  '.WKWB.BWKW.',
  '.BBBBBBBBB.',
  'BBBBBBBBBBB',
  'BBMMMMMMMBB',
  'BBBBBBBBBBB',
  '.BDBBBBBDB.',
  'DD.......DD',
];

/** A colour darker by `f` (0..1). */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * (1 - f)).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/** The player's frog, in their skin's colour, centred on (cx, cy). */
export function drawFrog(ctx: Painter, cx: number, cy: number, color: string) {
  const colors: Record<string, string> = { B: color, D: shade(color, 0.35), W: '#ffffff', K: '#111111', M: shade(color, 0.55) };
  const left = cx - 5;
  const top = cy - 4;
  FROG.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(left + x, top + y, 1, 1);
    }
  });
}

/** The whole city, the frog in `frogColor`. */
export function drawCity(ctx: Painter, w: number, h: number, frogColor: string) {
  drawGround(ctx, w, h);
  const [ex, ey] = spotXY('earth', w, h);
  drawHarbour(ctx, ex, ey, w, h);
  drawTownscape(ctx, w, h);
  drawColosseum(ctx, ...spotXY('ranked', w, h));
  drawTemple(ctx, ...spotXY('hades', w, h));
  drawMarket(ctx, ...spotXY('market', w, h));
  drawFrog(ctx, ...spotXY('frog', w, h), frogColor);
}
