import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCountdown } from '@/lib/useCountdown';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCountdown', () => {
  it('returns null when the deadline is null', () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current).toBeNull();
  });

  it('ticks down once a second from the given deadline', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const deadline = new Date(now.getTime() + 60_000).toISOString();

    const { result } = renderHook(() => useCountdown(deadline));
    // Set immediately on mount, unlike useBossfightCountdown (no fetch to await).
    expect(result.current).toBe(60);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(55);
  });

  it('clamps to 0 once the deadline passes, never negative', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const deadline = new Date(now.getTime() + 2000).toISOString();

    const { result } = renderHook(() => useCountdown(deadline));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(0);
  });

  it('re-derives from a new deadline (e.g. the collapse rule pulling it earlier)', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const farDeadline = new Date(now.getTime() + 60_000).toISOString();
    const nearDeadline = new Date(now.getTime() + 6000).toISOString();

    const { result, rerender } = renderHook(({ deadline }) => useCountdown(deadline), {
      initialProps: { deadline: farDeadline },
    });
    expect(result.current).toBe(60);

    rerender({ deadline: nearDeadline });
    expect(result.current).toBe(6);
  });

  it('goes back to null if the deadline becomes null', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const deadline = new Date(now.getTime() + 60_000).toISOString();

    const { result, rerender } = renderHook<number | null, { deadline: string | null }>(
      ({ deadline }) => useCountdown(deadline),
      { initialProps: { deadline } }
    );
    expect(result.current).toBe(60);

    rerender({ deadline: null });
    expect(result.current).toBeNull();
  });
});
