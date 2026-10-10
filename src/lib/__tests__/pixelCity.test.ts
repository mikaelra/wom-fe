import { describe, expect, it } from 'vitest';
import { CITY_SPOTS, drawCity, drawFrog, shade, spotXY, type Painter } from '@/lib/pixelCity';

/** Records every pixel painted, by colour. */
function recorder(w: number, h: number) {
  const pixels = new Map<string, string>();
  const ctx: Painter = {
    fillStyle: '#000000',
    fillRect(x, y, rw, rh) {
      for (let j = 0; j < rh; j++)
        for (let i = 0; i < rw; i++) {
          const px = x + i;
          const py = y + j;
          if (px >= 0 && py >= 0 && px < w && py < h) pixels.set(`${px},${py}`, String(this.fillStyle));
        }
    },
  };
  return { ctx, pixels };
}

describe('pixelCity', () => {
  it('puts the four places in the four corners round the frog in the middle', () => {
    const { ranked, hades, market, earth, frog } = CITY_SPOTS;
    expect(ranked.x).toBeLessThan(frog.x);
    expect(hades.x).toBeGreaterThan(frog.x);
    expect(ranked.y).toBeLessThan(frog.y);
    expect(market.y).toBeGreaterThan(frog.y);
    expect(earth.x).toBeGreaterThan(frog.x);
    expect(spotXY('frog', 100, 200)).toEqual([50, 112]);
  });

  it('draws the frog in the colour of the skin worn', () => {
    const { ctx, pixels } = recorder(20, 20);
    drawFrog(ctx, 10, 10, '#ec4899');
    const colours = [...pixels.values()];
    expect(colours.filter((c) => c === '#ec4899').length).toBeGreaterThan(30);
    expect(colours).toContain('#ffffff'); // its eyes
  });

  it('fills the whole screen and keeps every place on it (a phone, a quarter scale)', () => {
    const w = 98;
    const h = 211;
    const { ctx, pixels } = recorder(w, h);
    drawCity(ctx, w, h, '#22c55e');
    expect(pixels.size).toBe(w * h);
    const colours = new Set(pixels.values());
    for (const c of ['#e8d5a0', '#f1ede4', '#2f6fb3', '#22c55e']) expect(colours).toContain(c); // arena, temple, sea, frog
  });

  it('darkens a colour', () => {
    expect(shade('#ffffff', 0.5)).toBe('#808080');
    expect(shade('#22c55e', 0)).toBe('#22c55e');
  });
});
