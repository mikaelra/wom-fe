import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { LOADING_LOOP_MS, useMinimumLoading } from '@/lib/useMinimumLoading';
import { LOADING_SPEC, loopDuration } from '@/lib/loadingAnimation';

afterEach(() => {
  vi.useRealTimers();
});

describe('useMinimumLoading', () => {
  it('defaults to one whole loop of the loading animation', () => {
    expect(LOADING_LOOP_MS).toBeCloseTo(loopDuration(LOADING_SPEC) * 1000, 6);
  });

  it('keeps showing for the rest of the loop when loading ends early', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ loading }) => useMinimumLoading(loading), {
      initialProps: { loading: true },
    });
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(500));
    rerender({ loading: false });
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(LOADING_LOOP_MS - 500 - 10));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(20));
    expect(result.current).toBe(false);
  });

  it('lets go straight away once the loop has already played', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ loading }) => useMinimumLoading(loading, 1000), {
      initialProps: { loading: true },
    });
    act(() => vi.advanceTimersByTime(1500));
    rerender({ loading: false });
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(false);
  });

  it('never shows a wait that never started', () => {
    const { result } = renderHook(() => useMinimumLoading(false));
    expect(result.current).toBe(false);
  });

  it('starts a fresh minimum for each new wait', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ loading }) => useMinimumLoading(loading, 1000), {
      initialProps: { loading: false },
    });
    rerender({ loading: true });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    rerender({ loading: false });
    act(() => vi.advanceTimersByTime(799));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(2));
    expect(result.current).toBe(false);

    rerender({ loading: true });
    act(() => vi.advanceTimersByTime(100));
    rerender({ loading: false });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(401));
    expect(result.current).toBe(false);
  });
});
