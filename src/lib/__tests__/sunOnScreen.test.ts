import { describe, expect, it, vi } from 'vitest';
import { getSunOnScreen, setSunOnScreen, subscribeSunOnScreen } from '@/lib/sunOnScreen';

describe('sunOnScreen', () => {
  it('holds the last point and tells listeners when it moves', () => {
    const fn = vi.fn();
    const off = subscribeSunOnScreen(fn);
    setSunOnScreen({ x: 10, y: 20 });
    expect(getSunOnScreen()).toEqual({ x: 10, y: 20 });
    expect(fn).toHaveBeenCalledTimes(1);

    // Sub-pixel jitter is not a move.
    setSunOnScreen({ x: 10.2, y: 19.9 });
    expect(fn).toHaveBeenCalledTimes(1);

    setSunOnScreen(null);
    expect(getSunOnScreen()).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);

    off();
    setSunOnScreen({ x: 1, y: 1 });
    expect(fn).toHaveBeenCalledTimes(2);
    setSunOnScreen(null);
  });
});
