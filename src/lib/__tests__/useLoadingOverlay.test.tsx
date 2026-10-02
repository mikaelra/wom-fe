import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  beginRequest,
  claimLoadingScreen,
  resetLoadingTracker,
  setAssetsLoading,
  suppressLoadingOverlay,
} from '@/lib/loadingTracker';
import {
  BACKDROP_RISE_MS,
  BACKDROP_START_OPACITY,
  BACKGROUND_LOADING_DELAY_MS,
  backdropOpacity,
  useLoadingBackdrop,
  useLoadingOverlay,
} from '@/lib/useLoadingOverlay';

afterEach(() => {
  resetLoadingTracker();
  vi.useRealTimers();
});

describe('useLoadingOverlay', () => {
  it('is up at once for a screen waiting on content', () => {
    const { result } = renderHook(() => useLoadingOverlay());
    expect(result.current).toBe(false);
    act(() => {
      claimLoadingScreen();
    });
    expect(result.current).toBe(true);
  });

  it('is up at once while a scene loads its assets', () => {
    const { result } = renderHook(() => useLoadingOverlay(BACKGROUND_LOADING_DELAY_MS, 0));
    act(() => setAssetsLoading(true));
    expect(result.current).toBe(true);
  });

  it('waits out the delay for an API call', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLoadingOverlay(BACKGROUND_LOADING_DELAY_MS, 0));
    let end = () => {};
    act(() => {
      end = beginRequest();
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(BACKGROUND_LOADING_DELAY_MS);
    });
    expect(result.current).toBe(true);
    act(() => end());
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });
});

describe('useLoadingOverlay switched off', () => {
  it('never shows while a page has switched it off, even mid hold', () => {
    const { result } = renderHook(() => useLoadingOverlay());
    let release = () => {};
    act(() => {
      claimLoadingScreen();
    });
    expect(result.current).toBe(true);
    act(() => {
      release = suppressLoadingOverlay();
    });
    expect(result.current).toBe(false);
    act(() => setAssetsLoading(true));
    expect(result.current).toBe(false);
    act(() => release());
    expect(result.current).toBe(true);
  });
});

describe('backdropOpacity', () => {
  it('fades the earth scene as it loads', () => {
    expect(backdropOpacity(true, false, 0, 0)).toBe(1);
    expect(backdropOpacity(true, false, 0.25, 9999)).toBe(0.75);
    expect(backdropOpacity(true, false, 1, 0)).toBe(0);
    expect(backdropOpacity(true, false, 3, 0)).toBe(0);
  });

  it('starts everything else half grey and climbs to opaque while loading goes on', () => {
    expect(backdropOpacity(false, false, 0, 0)).toBe(BACKDROP_START_OPACITY);
    expect(backdropOpacity(false, true, 0, BACKDROP_RISE_MS / 2)).toBeCloseTo(0.75, 9);
    expect(backdropOpacity(false, false, 0.9, BACKDROP_RISE_MS)).toBe(1);
    expect(backdropOpacity(false, false, 0, BACKDROP_RISE_MS * 3)).toBe(1);
  });

  it('treats the earth like the others while a screen waits on content', () => {
    expect(backdropOpacity(true, true, 0.8, 0)).toBe(BACKDROP_START_OPACITY);
  });
});

describe('useLoadingBackdrop', () => {
  it('fades with the earth scene load, never thickens again, and resets when hidden', () => {
    const { result, rerender } = renderHook(({ visible }) => useLoadingBackdrop(visible), {
      initialProps: { visible: true },
    });
    act(() => setAssetsLoading(true, 0, true));
    expect(result.current).toBe(1);
    act(() => setAssetsLoading(true, 0.6, true));
    expect(result.current).toBeCloseTo(0.4, 9);
    act(() => setAssetsLoading(true, 0.3, true)); // more loads queued: the raw fraction dips
    expect(result.current).toBeCloseTo(0.4, 9);
    act(() => setAssetsLoading(false));
    expect(result.current).toBe(0); // all in: clear while the loop finishes

    rerender({ visible: false });
    rerender({ visible: true });
    expect(result.current).toBe(BACKDROP_START_OPACITY);
  });

  it('climbs from half grey only while things are still loading in', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLoadingBackdrop(true));
    expect(result.current).toBe(BACKDROP_START_OPACITY);
    let release = () => {};
    act(() => {
      release = claimLoadingScreen();
    });
    act(() => {
      vi.advanceTimersByTime(BACKDROP_RISE_MS / 2);
    });
    const halfway = result.current;
    expect(halfway).toBeGreaterThan(0.7);
    expect(halfway).toBeLessThan(0.8);
    act(() => release());
    act(() => {
      vi.advanceTimersByTime(BACKDROP_RISE_MS);
    });
    expect(result.current).toBe(halfway); // nothing left loading: holds its level

    act(() => setAssetsLoading(true, 0)); // a non-earth scene's assets
    act(() => {
      vi.advanceTimersByTime(BACKDROP_RISE_MS);
    });
    expect(result.current).toBe(1);
  });
});
