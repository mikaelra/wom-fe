import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRoundTimer } from '@/lib/useRoundTimer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRoundTimer', () => {
  it('is null when there is no round end time', () => {
    const { result } = renderHook(() => useRoundTimer(null));
    expect(result.current).toBeNull();
  });

  it('computes the remaining time immediately, then counts down every second', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const roundEndTime = new Date(now.getTime() + 5000).toISOString();

    const { result } = renderHook(() => useRoundTimer(roundEndTime));
    expect(result.current).toBe(5);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(4);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(2);
  });

  it('never goes below 0', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const roundEndTime = new Date(now.getTime() + 1000).toISOString();

    const { result } = renderHook(() => useRoundTimer(roundEndTime));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });

  it('resets to null when roundEndTime becomes null', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const roundEndTime = new Date(now.getTime() + 5000).toISOString();

    const { result, rerender } = renderHook(
      ({ endTime }) => useRoundTimer(endTime),
      { initialProps: { endTime: roundEndTime as string | null } }
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(4);

    rerender({ endTime: null });
    expect(result.current).toBeNull();
  });

  it('restarts the countdown when roundEndTime changes to a new value', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const firstEnd = new Date(now.getTime() + 5000).toISOString();
    const secondEnd = new Date(now.getTime() + 20000).toISOString();

    const { result, rerender } = renderHook(
      ({ endTime }) => useRoundTimer(endTime),
      { initialProps: { endTime: firstEnd } }
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(4);

    rerender({ endTime: secondEnd });
    // Regression: secondsLeft must reflect the new deadline as soon as
    // roundEndTime changes, not hold onto the old round's stale low value
    // (4, here) until the next interval tick a second later -- that stale
    // low value briefly satisfies the warn-blink threshold and made every
    // resource/action button (and the reminder bubbles) flash at the start
    // of every round.
    expect(result.current).toBe(19);

    // A total of 2000ms of fake-clock time has now passed since `now` (the
    // first 1000ms before rerender, plus this one) -- the new interval's
    // own first tick reflects that, not just the 1000ms since rerender.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(18);
  });
});
