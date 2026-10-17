import { describe, expect, it, vi } from 'vitest';
import { getEarthOnScreen, setEarthOnScreen, subscribeEarthOnScreen } from '@/lib/earthOnScreen';

describe('earthOnScreen', () => {
  it('holds the last point and tells listeners when it moves', () => {
    const fn = vi.fn();
    const off = subscribeEarthOnScreen(fn);
    setEarthOnScreen({ x: 10, y: 20 });
    expect(getEarthOnScreen()).toEqual({ x: 10, y: 20 });
    expect(fn).toHaveBeenCalledTimes(1);

    // Sub-pixel jitter is not a move.
    setEarthOnScreen({ x: 10.2, y: 19.9 });
    expect(fn).toHaveBeenCalledTimes(1);

    setEarthOnScreen(null);
    expect(getEarthOnScreen()).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);

    off();
    setEarthOnScreen({ x: 1, y: 1 });
    expect(fn).toHaveBeenCalledTimes(2);
    setEarthOnScreen(null);
  });
});
