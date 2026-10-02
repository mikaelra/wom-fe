import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { beginRequest, claimLoadingScreen, resetLoadingTracker, setAssetsLoading } from '@/lib/loadingTracker';
import { BACKGROUND_LOADING_DELAY_MS, useLoadingOverlay } from '@/lib/useLoadingOverlay';

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

  it('waits out the delay for background loading (API calls and 3D assets)', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLoadingOverlay(BACKGROUND_LOADING_DELAY_MS, 0));
    act(() => {
      setAssetsLoading(true);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(BACKGROUND_LOADING_DELAY_MS);
    });
    expect(result.current).toBe(true);
    act(() => {
      setAssetsLoading(false);
    });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);

    act(() => {
      beginRequest();
    });
    act(() => {
      vi.advanceTimersByTime(BACKGROUND_LOADING_DELAY_MS);
    });
    expect(result.current).toBe(true);
  });
});
