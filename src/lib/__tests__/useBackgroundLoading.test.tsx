import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { beginRequest, resetLoadingTracker } from '@/lib/loadingTracker';
import { BACKGROUND_LOADING_DELAY_MS, useBackgroundLoading } from '@/lib/useBackgroundLoading';

afterEach(() => {
  resetLoadingTracker();
  vi.useRealTimers();
});

describe('useBackgroundLoading', () => {
  it('only turns on after the delay, and off as soon as loading stops', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBackgroundLoading());
    expect(result.current).toBe(false);

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
    expect(result.current).toBe(false);
  });

  it('never shows for a request shorter than the delay', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBackgroundLoading());
    act(() => {
      const end = beginRequest();
      vi.advanceTimersByTime(BACKGROUND_LOADING_DELAY_MS - 50);
      end();
      vi.advanceTimersByTime(BACKGROUND_LOADING_DELAY_MS);
    });
    expect(result.current).toBe(false);
  });
});
