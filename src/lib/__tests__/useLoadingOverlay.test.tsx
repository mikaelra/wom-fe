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
  BACKGROUND_LOADING_DELAY_MS,
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
