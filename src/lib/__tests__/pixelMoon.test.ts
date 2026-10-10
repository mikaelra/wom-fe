import { describe, expect, it } from 'vitest';
import { drawMoon, moonPhase, moonPixels } from '@/lib/pixelMoon';

const lit = (phase: number) => moonPixels(5, phase).filter((p) => p.lit);

describe('pixelMoon', () => {
  it('finds the phase: full on 2026-10-26, new on 2026-10-10', () => {
    expect(moonPhase(new Date('2026-10-26T12:00:00Z'))).toBeGreaterThan(170);
    expect(moonPhase(new Date('2026-10-26T12:00:00Z'))).toBeLessThan(190);
    const nearNew = moonPhase(new Date('2026-10-10T12:00:00Z'));
    expect(Math.min(nearNew, 360 - nearNew)).toBeLessThan(15);
  });

  it('draws a round disc, the corners left out', () => {
    const disc = moonPixels(5, 180);
    expect(disc).toHaveLength(21);
    expect(disc.find((p) => p.x === 0 && p.y === 0)).toBeUndefined();
  });

  it('lights none of it new and all of it full', () => {
    expect(lit(0)).toHaveLength(0);
    expect(lit(180)).toHaveLength(21);
  });

  it('lights the right side waxing and the left side waning', () => {
    const first = lit(90);
    const last = lit(270);
    expect(first.every((p) => p.x >= 3)).toBe(true);
    expect(last.every((p) => p.x <= 1)).toBe(true);
    expect(first.length).toBe(last.length);
  });

  it('grows from crescent to gibbous', () => {
    expect(lit(45).length).toBeLessThan(lit(90).length);
    expect(lit(90).length).toBeLessThan(lit(135).length);
    expect(lit(225).length).toBeGreaterThan(lit(315).length);
  });

  it('paints each pixel lit or dark, centred on the point', () => {
    const fills: [string, number, number][] = [];
    const ctx = {
      fillStyle: '',
      fillRect(x: number, y: number) {
        fills.push([String(this.fillStyle), x, y]);
      },
    };
    drawMoon(ctx, 10, 10, 5, 90, { lit: 'L', dark: 'D' });
    expect(fills).toHaveLength(21);
    expect(fills).toContainEqual(['L', 12, 10]); // right edge, lit
    expect(fills).toContainEqual(['D', 8, 10]); // left edge, dark
  });
});
