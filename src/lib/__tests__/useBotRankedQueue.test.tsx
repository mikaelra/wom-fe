import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBotRankedQueue } from '@/lib/useBotRankedQueue';
import { getActiveBotRankedLobby, joinBotRankedQueue, leaveBotRankedQueue } from '@/lib/api';
import { setStoredToken } from '@/lib/http';
import * as socketModule from '@/lib/socket';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  joinBotRankedQueue: vi.fn(),
  leaveBotRankedQueue: vi.fn(),
  getActiveBotRankedLobby: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  setStoredToken: vi.fn(),
}));

// Same fake-subscribe pattern as useRankedQueue.test.tsx (its sibling).
vi.mock('@/lib/socket', () => {
  const subscribeListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const connectListeners = new Set<() => void>();
  const emit = vi.fn();

  return {
    getSocket: () => ({ emit }),
    subscribe: (event: string, handler: (...args: unknown[]) => void) => {
      if (!subscribeListeners.has(event)) subscribeListeners.set(event, new Set());
      subscribeListeners.get(event)!.add(handler);
      return () => subscribeListeners.get(event)?.delete(handler);
    },
    subscribeConnect: (handler: () => void) => {
      connectListeners.add(handler);
      return () => connectListeners.delete(handler);
    },
    __fireSubscribeEvent: (event: string, payload: unknown) => {
      subscribeListeners.get(event)?.forEach((h) => h(payload));
    },
    __fireConnect: () => {
      connectListeners.forEach((h) => h());
    },
    __connectListenerCount: () => connectListeners.size,
    __emit: emit,
    __reset: () => {
      subscribeListeners.clear();
      connectListeners.clear();
      emit.mockClear();
    },
  };
});

const socket = socketModule as unknown as {
  __fireSubscribeEvent: (event: string, payload: unknown) => void;
  __fireConnect: () => void;
  __connectListenerCount: () => number;
  __emit: ReturnType<typeof vi.fn>;
  __reset: () => void;
};

const mockedJoin = vi.mocked(joinBotRankedQueue);
const mockedLeave = vi.mocked(leaveBotRankedQueue);
const mockedActive = vi.mocked(getActiveBotRankedLobby);
const mockedSetStoredToken = vi.mocked(setStoredToken);

/** Matches ACTIVE_MATCH_POLL_MS in the hook. */
const POLL_MS = 4000;

const noActiveMatch = {
  lobby_id: null,
  token: null,
  ai_ranked_countdown_deadline: null,
  started: false,
};

beforeEach(() => {
  socket.__reset();
  mockedJoin.mockReset();
  mockedLeave.mockReset();
  mockedActive.mockReset();
  mockedSetStoredToken.mockReset();
  push.mockReset();
  mockedActive.mockResolvedValue(noActiveMatch);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBotRankedQueue', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useBotRankedQueue());
    expect(result.current.status).toBe('idle');
  });

  it('emits join_ai_ranked_queue and calls the REST join on startQueue', async () => {
    mockedJoin.mockResolvedValue({ queued: true });
    const { result } = renderHook(() => useBotRankedQueue());

    await act(async () => {
      await result.current.startQueue('Alice', 'acct-tok');
    });

    expect(socket.__emit).toHaveBeenCalledWith('join_ai_ranked_queue', { name: 'Alice' });
    expect(mockedJoin).toHaveBeenCalledWith('acct-tok');
    expect(result.current.status).toBe('searching');
  });

  it('lands the matched player via join_room and navigates to the lobby', async () => {
    mockedJoin.mockResolvedValue({ queued: true });
    const { result } = renderHook(() => useBotRankedQueue());

    await act(async () => {
      await result.current.startQueue('Alice', 'acct-tok');
    });

    act(() => {
      socket.__fireSubscribeEvent('ai_ranked_match_found', { lobby_id: 'ABCD', token: 'tok-123' });
    });

    expect(mockedSetStoredToken).toHaveBeenCalledWith('ABCD', 'tok-123');
    expect(socket.__emit).toHaveBeenCalledWith('join_room', { lobby_id: 'ABCD', token: 'tok-123' });
    expect(push).toHaveBeenCalledWith('/lobby?id=ABCD');
  });

  it('goes back to idle and surfaces the error if the REST join fails', async () => {
    mockedJoin.mockRejectedValue(new Error('queue full'));
    const { result } = renderHook(() => useBotRankedQueue());

    await expect(
      act(async () => {
        await result.current.startQueue('Alice', 'acct-tok');
      })
    ).rejects.toThrow('queue full');

    expect(result.current.status).toBe('idle');
  });

  it('cancelQueue calls the REST leave and returns to idle', async () => {
    mockedJoin.mockResolvedValue({ queued: true });
    mockedLeave.mockResolvedValue({ left: true, was_queued: true });
    const { result } = renderHook(() => useBotRankedQueue());

    await act(async () => {
      await result.current.startQueue('Alice', 'acct-tok');
    });
    await act(async () => {
      await result.current.cancelQueue();
    });

    expect(mockedLeave).toHaveBeenCalledWith('acct-tok');
    expect(result.current.status).toBe('idle');
  });

  it('a match found after cancelQueue is ignored (unsubscribed)', async () => {
    mockedJoin.mockResolvedValue({ queued: true });
    mockedLeave.mockResolvedValue({ left: true, was_queued: true });
    const { result } = renderHook(() => useBotRankedQueue());

    await act(async () => {
      await result.current.startQueue('Alice', 'acct-tok');
    });
    await act(async () => {
      await result.current.cancelQueue();
    });

    act(() => {
      socket.__fireSubscribeEvent('ai_ranked_match_found', { lobby_id: 'ABCD', token: 'tok-123' });
    });

    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe('idle'));
  });

  describe('surviving a reconnect', () => {
    it('re-emits join_ai_ranked_queue on reconnect while searching', async () => {
      mockedJoin.mockResolvedValue({ queued: true });
      const { result } = renderHook(() => useBotRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice', 'acct-tok');
      });
      socket.__emit.mockClear();

      act(() => {
        socket.__fireConnect();
      });

      expect(socket.__emit).toHaveBeenCalledWith('join_ai_ranked_queue', { name: 'Alice' });
    });

    it('does not re-join once the match has been entered', async () => {
      mockedJoin.mockResolvedValue({ queued: true });
      const { result } = renderHook(() => useBotRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice', 'acct-tok');
      });
      act(() => {
        socket.__fireSubscribeEvent('ai_ranked_match_found', { lobby_id: 'ABCD', token: 'tok-123' });
      });
      socket.__emit.mockClear();

      act(() => {
        socket.__fireConnect();
      });

      expect(socket.__emit).not.toHaveBeenCalledWith('join_ai_ranked_queue', { name: 'Alice' });
    });
  });

  // The backup path: if the push is lost anyway, polling /my_ai/bot_ranked/active
  // is what still gets the player into the match they are already in.
  describe('active-match poll fallback', () => {
    it('enters a match the push never delivered', async () => {
      vi.useFakeTimers();
      mockedJoin.mockResolvedValue({ queued: true });
      const { result } = renderHook(() => useBotRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice', 'acct-tok');
      });

      mockedActive.mockResolvedValue({
        lobby_id: 'WXYZ', token: 'tok-poll', ai_ranked_countdown_deadline: null, started: false,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      expect(mockedActive).toHaveBeenCalledWith('acct-tok');
      expect(mockedSetStoredToken).toHaveBeenCalledWith('WXYZ', 'tok-poll');
      expect(socket.__emit).toHaveBeenCalledWith('join_room', { lobby_id: 'WXYZ', token: 'tok-poll' });
      expect(push).toHaveBeenCalledWith('/lobby?id=WXYZ');
    });

    it('navigates only once when the push and the poll both land', async () => {
      vi.useFakeTimers();
      mockedJoin.mockResolvedValue({ queued: true });
      const { result } = renderHook(() => useBotRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice', 'acct-tok');
      });

      mockedActive.mockResolvedValue({
        lobby_id: 'ABCD', token: 'tok-123', ai_ranked_countdown_deadline: null, started: false,
      });

      act(() => {
        socket.__fireSubscribeEvent('ai_ranked_match_found', { lobby_id: 'ABCD', token: 'tok-123' });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      });

      expect(push).toHaveBeenCalledTimes(1);
    });

    it('a poll response already in flight when the push wins still updates the stored token (bug list 260916)', async () => {
      // /my_ai/bot_ranked/active mints a fresh token on every call,
      // invalidating whatever it last issued -- so a poll request
      // dispatched just before the push wins the race can still land
      // moments later with a *different* token than the one the push just
      // used, silently killing it server-side (the reported "invalid
      // token" error joining bot-ranked). The old early-return in
      // enterMatch discarded that straggler, leaving the now-invalid
      // token as the only one ever stored -- every later rejoin attempt
      // then failed forever, with no reload able to fix it since the
      // still-valid token was never persisted anywhere.
      vi.useFakeTimers();
      mockedJoin.mockResolvedValue({ queued: true });
      let resolvePoll: (v: {
        lobby_id: string | null; token: string | null;
        ai_ranked_countdown_deadline: null; started: boolean;
      }) => void;
      mockedActive.mockImplementationOnce(
        () => new Promise((resolve) => { resolvePoll = resolve; })
      );
      const { result } = renderHook(() => useBotRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice', 'acct-tok');
      });

      // The poll tick fires (not yet entered) and dispatches its request,
      // which stays pending -- exactly an in-flight request at the moment
      // the push below wins the race.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      expect(mockedActive).toHaveBeenCalledTimes(1);

      act(() => {
        socket.__fireSubscribeEvent('ai_ranked_match_found', { lobby_id: 'ABCD', token: 'tok-stale' });
      });
      expect(push).toHaveBeenCalledTimes(1);

      // The in-flight poll request now resolves, moments too late to
      // matter for navigation but carrying the token still valid
      // server-side.
      await act(async () => {
        resolvePoll!({ lobby_id: 'ABCD', token: 'tok-fresher', ai_ranked_countdown_deadline: null, started: false });
      });

      expect(push).toHaveBeenCalledTimes(1); // still navigates only once
      expect(mockedSetStoredToken).toHaveBeenLastCalledWith('ABCD', 'tok-fresher');
      expect(socket.__emit).toHaveBeenLastCalledWith('join_room', { lobby_id: 'ABCD', token: 'tok-fresher' });
    });

    it('stops polling after cancelQueue', async () => {
      vi.useFakeTimers();
      mockedJoin.mockResolvedValue({ queued: true });
      mockedLeave.mockResolvedValue({ left: true, was_queued: true });
      const { result } = renderHook(() => useBotRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice', 'acct-tok');
      });
      await act(async () => {
        await result.current.cancelQueue();
      });
      mockedActive.mockClear();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      });

      expect(mockedActive).not.toHaveBeenCalled();
    });
  });

  it('tears down its socket and poll subscriptions on unmount', async () => {
    vi.useFakeTimers();
    mockedJoin.mockResolvedValue({ queued: true });
    const { result, unmount } = renderHook(() => useBotRankedQueue());

    await act(async () => {
      await result.current.startQueue('Alice', 'acct-tok');
    });
    expect(socket.__connectListenerCount()).toBe(1);

    unmount();
    mockedActive.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });

    expect(socket.__connectListenerCount()).toBe(0);
    expect(mockedActive).not.toHaveBeenCalled();
  });
});
