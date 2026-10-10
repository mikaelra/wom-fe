import { describe, expect, it } from 'vitest';
import {
  drawSignpostScene,
  drawText,
  layoutBoard,
  mix,
  skyBodies,
  skyFor,
  skyXY,
  textWidth,
  wrap,
  type Board,
  type Painter,
} from '@/lib/pixelSignpost';

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

const BOARDS: Board[] = [
  { label: 'RANKED', color: '#ff6666', side: 'left', row: 0 },
  { label: 'HADES', color: '#4da6ff', side: 'right', row: 0 },
  { label: 'MARKET', color: '#e8d9a0', side: 'left', row: 1 },
  { label: 'EARTH', color: '#5fd88a', side: 'right', row: 1 },
];

describe('pixel font', () => {
  it('measures and wraps by whole words', () => {
    expect(textWidth('HADES')).toBe(19);
    expect(wrap('return to match', 40)).toEqual(['RETURN TO', 'MATCH']);
    expect(wrap('EARTH', 40)).toEqual(['EARTH']);
  });

  it('draws letters, and nothing for a space', () => {
    const { ctx, pixels } = recorder(20, 10);
    drawText(ctx, 'H I', 0, 0, '#ffffff');
    expect(pixels.size).toBe(11 + 9); // H's pixels, then I's
  });
});

describe('the sky', () => {
  it('goes from day to golden hour, twilight and night with the Sun', () => {
    expect(skyFor(40).stars).toBe(0);
    expect(skyFor(5).horizon).toBe('#f3b05a');
    expect(skyFor(-3).light).toBeLessThan(skyFor(5).light);
    expect(skyFor(-20).stars).toBe(1);
  });

  it('finds the Sun high over Athens at noon and below it at midnight', () => {
    expect(skyBodies(new Date('2026-06-21T10:00:00Z'), 37.98, 23.73).sun.alt).toBeGreaterThan(60);
    expect(skyBodies(new Date('2026-06-21T22:00:00Z'), 37.98, 23.73).sun.alt).toBeLessThan(-10);
  });

  it('puts the east on the left, south in the middle, and higher up higher', () => {
    expect(skyXY({ alt: 0, az: 90 }, 100, 60)).toEqual([0, 60]);
    expect(skyXY({ alt: 90, az: 180 }, 100, 60)).toEqual([50, 0]);
  });

  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('the signpost', () => {
  it('hangs the boards either side of the post, top row over bottom', () => {
    const [ranked, hades, market] = BOARDS.map((b) => layoutBoard(b, 130, 281));
    expect(ranked.x + ranked.w).toBeLessThanOrEqual(65);
    expect(hades.x).toBeGreaterThanOrEqual(65);
    expect(market.y).toBeGreaterThan(ranked.y + ranked.h);
  });

  it("wraps a long board's words to fit its half of a phone", () => {
    const box = layoutBoard({ label: 'RETURN TO MATCH', color: '#fff', side: 'left', row: 0 }, 130, 281);
    expect(box.lines.length).toBe(2);
    expect(box.x).toBeGreaterThanOrEqual(0);
  });

  it('draws the whole scene, lettering in each arm colour', () => {
    const w = 130;
    const h = 281;
    const { ctx, pixels } = recorder(w, h);
    drawSignpostScene(ctx, w, h, BOARDS, skyBodies(new Date('2026-06-21T10:00:00Z'), 37.98, 23.73));
    expect(pixels.size).toBe(w * h);
    const colours = new Set(pixels.values());
    for (const b of BOARDS) expect(colours).toContain(b.color);
    expect(colours).toContain('#ffe600'); // the Sun, up at noon
  });
});
