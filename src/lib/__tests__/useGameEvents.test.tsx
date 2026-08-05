import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGameEvents } from '@/lib/useGameEvents';
import { getPlayerMessages } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getPlayerMessages: vi.fn(),
}));

const mockedGetPlayerMessages = vi.mocked(getPlayerMessages);

const flushMicrotasks = () => act(() => Promise.resolve());

beforeEach(() => {
  mockedGetPlayerMessages.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useGameEvents', () => {
  it('does not fetch without a round', () => {
    renderHook(() => useGameEvents('AAAA', 'Alice', undefined, undefined));
    expect(mockedGetPlayerMessages).not.toHaveBeenCalled();
  });

  it('does not fetch without a lobbyId or playerName', () => {
    renderHook(() => useGameEvents('', 'Alice', 1, undefined));
    renderHook(() => useGameEvents('AAAA', '', 1, undefined));
    expect(mockedGetPlayerMessages).not.toHaveBeenCalled();
  });

  it('fetches once round is set and tags the result with that round', async () => {
    mockedGetPlayerMessages.mockResolvedValue({ messages: [['hi']], events: [], instakill: false });

    const { result } = renderHook(() => useGameEvents('AAAA', 'Alice', 1, undefined));
    await flushMicrotasks();

    expect(mockedGetPlayerMessages).toHaveBeenCalledWith('AAAA', 'Alice');
    expect(result.current).toEqual({ round: 1, messages: [['hi']], events: [], instakill: false });
  });

  it('refetches when round changes', async () => {
    mockedGetPlayerMessages.mockResolvedValue({ messages: [], events: [], instakill: false });

    const { rerender } = renderHook(
      ({ round }) => useGameEvents('AAAA', 'Alice', round, undefined),
      { initialProps: { round: 1 } }
    );
    await flushMicrotasks();
    expect(mockedGetPlayerMessages).toHaveBeenCalledTimes(1);

    rerender({ round: 2 });
    await flushMicrotasks();
    expect(mockedGetPlayerMessages).toHaveBeenCalledTimes(2);
  });

  it('refetches when denyTarget changes within the same round', async () => {
    mockedGetPlayerMessages.mockResolvedValue({ messages: [], events: [], instakill: false });

    const { rerender } = renderHook(
      ({ denyTarget }: { denyTarget: string | undefined }) =>
        useGameEvents('AAAA', 'Alice', 1, denyTarget),
      { initialProps: { denyTarget: undefined as string | undefined } }
    );
    await flushMicrotasks();
    expect(mockedGetPlayerMessages).toHaveBeenCalledTimes(1);

    rerender({ denyTarget: 'Bob' });
    await flushMicrotasks();
    expect(mockedGetPlayerMessages).toHaveBeenCalledTimes(2);
  });

  it('ignores a resolution that arrives after the round changed again (cancellation guard)', async () => {
    let resolveFirst: (value: { messages: never[]; events: never[]; instakill: boolean }) => void;
    mockedGetPlayerMessages.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    mockedGetPlayerMessages.mockResolvedValueOnce({ messages: [['round2']], events: [], instakill: false });

    const { result, rerender } = renderHook(
      ({ round }) => useGameEvents('AAAA', 'Alice', round, undefined),
      { initialProps: { round: 1 } }
    );

    rerender({ round: 2 });
    await flushMicrotasks();
    expect(result.current).toEqual({ round: 2, messages: [['round2']], events: [], instakill: false });

    await act(async () => {
      resolveFirst!({ messages: [], events: [], instakill: false });
      await Promise.resolve();
    });

    // The stale round-1 fetch resolving afterwards must not clobber round 2's data.
    expect(result.current).toEqual({ round: 2, messages: [['round2']], events: [], instakill: false });
  });

  it('does not update state after unmounting before the fetch resolves', async () => {
    let resolveFetch: (value: { messages: never[]; events: never[]; instakill: boolean }) => void;
    mockedGetPlayerMessages.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { unmount } = renderHook(() => useGameEvents('AAAA', 'Alice', 1, undefined));
    unmount();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      resolveFetch!({ messages: [], events: [], instakill: false });
      await Promise.resolve();
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
