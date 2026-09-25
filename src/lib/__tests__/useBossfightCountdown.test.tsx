import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';
import { getNextBossfightTime } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getNextBossfightTime: vi.fn(),
}));

const mockedGetNextBossfightTime = vi.mocked(getNextBossfightTime);

// Flushes a mocked promise's microtask queue without advancing any real or
// fake timers -- needed because these tests use fake timers throughout
// (to control the setInterval tick), which `waitFor`'s real-timer-based
// polling can't coexist with.
const flushMicrotasks = () => act(() => Promise.resolve());

beforeEach(() => {
  vi.useFakeTimers();
  mockedGetNextBossfightTime.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBossfightCountdown', () => {
  it('does not fetch while disabled', () => {
    renderHook(() => useBossfightCountdown(false));
    expect(mockedGetNextBossfightTime).not.toHaveBeenCalled();
  });

  it('fetches and ticks a countdown while enabled', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    mockedGetNextBossfightTime.mockResolvedValue({
      start_time: new Date(now.getTime() + 90_000).toISOString(),
    });

    const { result } = renderHook(() => useBossfightCountdown(true));
    await flushMicrotasks();
    // Same "null until the first tick" shape as useRoundTimer: the fetch
    // resolving only starts the interval, it doesn't set state itself.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.secondsUntil).toBe(89);
    expect(result.current.bossfightMins).toBe(1);
    expect(result.current.bossfightSecs).toBe(29);

    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(result.current.secondsUntil).toBe(60);
    expect(result.current.bossfightMins).toBe(1);
    expect(result.current.bossfightSecs).toBe(0);
  });

  it('clamps to 0 once the deadline passes, never negative', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    mockedGetNextBossfightTime.mockResolvedValue({
      start_time: new Date(now.getTime() + 2000).toISOString(),
    });

    const { result } = renderHook(() => useBossfightCountdown(true));
    await flushMicrotasks();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.secondsUntil).toBe(0);
    expect(result.current.bossfightMins).toBe(0);
    expect(result.current.bossfightSecs).toBe(0);
  });

  it('sets secondsUntil to null when the fetch fails', async () => {
    mockedGetNextBossfightTime.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useBossfightCountdown(true));
    await flushMicrotasks();

    expect(mockedGetNextBossfightTime).toHaveBeenCalledTimes(1);
    expect(result.current.secondsUntil).toBeNull();
    expect(result.current.bossfightMins).toBeNull();
    expect(result.current.bossfightSecs).toBeNull();
  });

  it('does not update state after unmounting before the fetch resolves', async () => {
    let resolveFetch: (value: { start_time: string }) => void;
    mockedGetNextBossfightTime.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { unmount } = renderHook(() => useBossfightCountdown(true));
    unmount();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      resolveFetch!({ start_time: new Date().toISOString() });
      await Promise.resolve();
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('refetches when re-enabled after being disabled', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    vi.setSystemTime(now);
    mockedGetNextBossfightTime.mockResolvedValue({
      start_time: new Date(now.getTime() + 10_000).toISOString(),
    });

    const { result, rerender } = renderHook(
      ({ enabled }) => useBossfightCountdown(enabled),
      { initialProps: { enabled: false } }
    );
    expect(mockedGetNextBossfightTime).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await flushMicrotasks();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.secondsUntil).toBe(9);
    expect(mockedGetNextBossfightTime).toHaveBeenCalledTimes(1);
  });
});
