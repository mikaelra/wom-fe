import { describe, expect, it } from 'vitest';
import { isClickNotDrag, DRAG_PX, HOLD_MS } from '@/lib/useClickNotDrag';

const at = (x: number, y: number, t: number) => ({ x, y, t });

describe('isClickNotDrag', () => {
  it('activates on a clean tap in place', () => {
    expect(isClickNotDrag(at(100, 100, 0), at(100, 100, 80))).toBe(true);
  });

  it('tolerates the small wobble of a real finger or mouse', () => {
    expect(isClickNotDrag(at(100, 100, 0), at(103, 102, 120))).toBe(true);
  });

  it('rejects a drag past the travel threshold', () => {
    expect(isClickNotDrag(at(100, 100, 0), at(100 + DRAG_PX + 1, 100, 80))).toBe(false);
  });

  it('measures travel as a straight line, not per axis', () => {
    // 5px on each axis is 7.07px of actual travel -- over the 6px threshold.
    // A per-axis check would wave this through, which is the bug this guards.
    expect(isClickNotDrag(at(0, 0, 0), at(5, 5, 50))).toBe(false);
    // ...while the same total travel along one axis is equally rejected.
    expect(isClickNotDrag(at(0, 0, 0), at(7, 0, 50))).toBe(false);
  });

  it('rejects a press held too long, even without moving', () => {
    expect(isClickNotDrag(at(100, 100, 0), at(100, 100, HOLD_MS + 1))).toBe(false);
  });

  it('accepts exactly at each threshold, rejecting only beyond it', () => {
    expect(isClickNotDrag(at(0, 0, 0), at(DRAG_PX, 0, 0))).toBe(true);
    expect(isClickNotDrag(at(0, 0, 0), at(0, 0, HOLD_MS))).toBe(true);
  });

  it('fails closed on a backwards timestamp rather than firing', () => {
    // A clock change or synthetic event must never activate a bossfight entry.
    expect(isClickNotDrag(at(100, 100, 500), at(100, 100, 100))).toBe(false);
    expect(isClickNotDrag(at(100, 100, 0), at(100, 100, NaN))).toBe(false);
  });

  it('honours caller-supplied thresholds', () => {
    expect(isClickNotDrag(at(0, 0, 0), at(20, 0, 50), { dragPx: 30 })).toBe(true);
    expect(isClickNotDrag(at(0, 0, 0), at(0, 0, 900), { holdMs: 1000 })).toBe(true);
  });
});
