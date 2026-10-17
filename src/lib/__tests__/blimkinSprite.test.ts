import { describe, expect, it } from 'vitest';
import { BLIMKIN_BREATHE, BLIMKIN_COLS, BLIMKIN_IDLE, BLIMKIN_ROWS } from '@/lib/blimkinSprite';

const text = (frame: typeof BLIMKIN_IDLE) => frame.map((row) => row.map((c) => c[0]).join(''));

describe('blimkinSprite', () => {
  it('is the statusline Blimkin, 13 x 7', () => {
    for (const frame of [BLIMKIN_IDLE, BLIMKIN_BREATHE]) {
      expect(frame).toHaveLength(BLIMKIN_ROWS);
      for (const row of frame) expect(row).toHaveLength(BLIMKIN_COLS);
    }
    expect(text(BLIMKIN_IDLE)[0].trim()).toBe('◢◣');
    expect(text(BLIMKIN_IDLE)[3]).toContain('●');
  });

  it('is yellow with red pupils', () => {
    const colours = new Set(BLIMKIN_IDLE.flat().map((c) => c[1]));
    expect(colours).toContain('#ffd214');
    expect(colours).toContain('#e61e28');
  });

  it('opens only his mouth to breathe', () => {
    const changed = BLIMKIN_IDLE.flatMap((row, r) =>
      row.flatMap((cell, c) => (JSON.stringify(cell) === JSON.stringify(BLIMKIN_BREATHE[r][c]) ? [] : [[r, c]])),
    );
    expect(changed.length).toBe(3);
    expect(changed.every(([r]) => r === 4)).toBe(true);
  });
});
