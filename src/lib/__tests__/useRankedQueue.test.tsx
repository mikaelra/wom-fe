import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRankedQueue } from '@/lib/useRankedQueue';
import { getActiveRankedLobby, joinRankedQueue, leaveRankedQueue } from '@/lib/api';
import { setStoredToken } from '@/lib/http';
import * as socketModule from '@/lib/socket';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  joinRankedQueue: vi.fn(),
  leaveRankedQueue: vi.fn(),
  getActiveRankedLobby: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  setStoredToken: vi.fn(),
}));

// Same fake-subscribe pattern as useLobbyConnection.test.tsx, extended with
// subscribeConnect so a reconnect can be simulated.
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

const mockedJoin = vi.mocked(joinRankedQueue);
const mockedLeave = vi.mocked(leaveRankedQueue);
const mockedActive = vi.mocked(getActiveRankedLobby);
const mockedSetStoredToken = vi.mocked(setStoredToken);

/** Matches ACTIVE_MATCH_POLL_MS in the hook. */
const POLL_MS = 4000;

const noActiveMatch = {
  lobby_id: null,
  token: null,
  ranked_countdown_deadline: null,
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

describe('useRankedQueue', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useRankedQueue());
    expect(result.current.status).toBe('idle');
  });

  it('emits join_ranked_queue and calls the REST join on startQueue', async () => {
    mockedJoin.mockResolvedValue({ status: 'queued' });
    const { result } = renderHook(() => useRankedQueue());

    await act(async () => {
      await result.current.startQueue('Alice');
    });

    expect(socket.__emit).toHaveBeenCalledWith('join_ranked_queue', { name: 'Alice' });
    expect(mockedJoin).toHaveBeenCalledWith('Alice');
    expect(result.current.status).toBe('searching');
  });

  it('lands the matched player via join_room and navigates to the lobby', async () => {
    mockedJoin.mockResolvedValue({ status: 'queued' });
    const { result } = renderHook(() => useRankedQueue());

    await act(async () => {
      await result.current.startQueue('Alice');
    });

    act(() => {
      socket.__fireSubscribeEvent('ranked_match_found', { lobby_id: 'ABCD', token: 'tok-123' });
    });

    expect(mockedSetStoredToken).toHaveBeenCalledWith('ABCD', 'tok-123');
    expect(socket.__emit).toHaveBeenCalledWith('join_room', { lobby_id: 'ABCD', token: 'tok-123' });
    expect(push).toHaveBeenCalledWith('/lobby?id=ABCD');
  });

  it('goes back to idle and surfaces the error if the REST join fails', async () => {
    mockedJoin.mockRejectedValue(new Error('queue full'));
    const { result } = renderHook(() => useRankedQueue());

    await expect(
      act(async () => {
        await result.current.startQueue('Alice');
      })
    ).rejects.toThrow('queue full');

    expect(result.current.status).toBe('idle');
  });

  it('cancelQueue calls the REST leave and returns to idle', async () => {
    mockedJoin.mockResolvedValue({ status: 'queued' });
    mockedLeave.mockResolvedValue({ status: 'left', was_queued: true });
    const { result } = renderHook(() => useRankedQueue());

    await act(async () => {
      await result.current.startQueue('Alice');
    });
    await act(async () => {
      await result.current.cancelQueue();
    });

    expect(mockedLeave).toHaveBeenCalledWith('Alice');
    expect(result.current.status).toBe('idle');
  });

  it('a match found after cancelQueue is ignored (unsubscribed)', async () => {
    mockedJoin.mockResolvedValue({ status: 'queued' });
    mockedLeave.mockResolvedValue({ status: 'left', was_queued: true });
    const { result } = renderHook(() => useRankedQueue());

    await act(async () => {
      await result.current.startQueue('Alice');
    });
    await act(async () => {
      await result.current.cancelQueue();
    });

    act(() => {
      socket.__fireSubscribeEvent('ranked_match_found', { lobby_id: 'ABCD', token: 'tok-123' });
    });

    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe('idle'));
  });

  // Socket.IO rooms are keyed by connection, so a reconnect silently drops
  // the queue room the match-found push is addressed to. Without this
  // re-join the player stays queued but unreachable, and only finds out
  // they were matched by reloading the page.
  describe('surviving a reconnect', () => {
    it('re-emits join_ranked_queue on reconnect while searching', async () => {
      mockedJoin.mockResolvedValue({ status: 'queued' });
      const { result } = renderHook(() => useRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice');
      });
      socket.__emit.mockClear();

      act(() => {
        socket.__fireConnect();
      });

      expect(socket.__emit).toHaveBeenCalledWith('join_ranked_queue', { name: 'Alice' });
    });

    it('does not re-join the queue room after cancelling', async () => {
      mockedJoin.mockResolvedValue({ status: 'queued' });
      mockedLeave.mockResolvedValue({ status: 'left', was_queued: true });
      const { result } = renderHook(() => useRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice');
      });
      await act(async () => {
        await result.current.cancelQueue();
      });
      socket.__emit.mockClear();

      act(() => {
        socket.__fireConnect();
      });

      expect(socket.__emit).not.toHaveBeenCalled();
    });

    it('does not re-join once the match has been entered', async () => {
      mockedJoin.mockResolvedValue({ status: 'queued' });
      const { result } = renderHook(() => useRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice');
      });
      act(() => {
        socket.__fireSubscribeEvent('ranked_match_found', { lobby_id: 'ABCD', token: 'tok-123' });
      });
      socket.__emit.mockClear();

      act(() => {
        socket.__fireConnect();
      });

      expect(socket.__emit).not.toHaveBeenCalledWith('join_ranked_queue', { name: 'Alice' });
    });
  });

  // The backup path: if the push is lost anyway, polling /ranked/active is
  // what still gets the player into the match they are already in.
  describe('active-match poll fallback', () => {
    it('enters a match the push never delivered', async () => {
      vi.useFakeTimers();
      mockedJoin.mockResolvedValue({ status: 'queued' });
      const { result } = renderHook(() => useRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice');
      });

      mockedActive.mockResolvedValue({
        lobby_id: 'WXYZ',
        token: 'tok-poll',
        ranked_countdown_deadline: null,
        started: false,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      expect(mockedActive).toHaveBeenCalledWith('Alice');
      expect(mockedSetStoredToken).toHaveBeenCalledWith('WXYZ', 'tok-poll');
      expect(socket.__emit).toHaveBeenCalledWith('join_room', { lobby_id: 'WXYZ', token: 'tok-poll' });
      expect(push).toHaveBeenCalledWith('/lobby?id=WXYZ');
    });

    it('keeps waiting while no match is active yet', async () => {
      vi.useFakeTimers();
      mockedJoin.mockResolvedValue({ status: 'queued' });
      const { result } = renderHook(() => useRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice');
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      });

      expect(mockedActive).toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(result.current.status).toBe('searching');
    });

    it('navigates only once when the push and the poll both land', async () => {
      vi.useFakeTimers();
      mockedJoin.mockResolvedValue({ status: 'queued' });
      const { result } = renderHook(() => useRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice');
      });

      mockedActive.mockResolvedValue({
        lobby_id: 'ABCD',
        token: 'tok-123',
        ranked_countdown_deadline: null,
        started: false,
      });

      act(() => {
        socket.__fireSubscribeEvent('ranked_match_found', { lobby_id: 'ABCD', token: 'tok-123' });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      });

      expect(push).toHaveBeenCalledTimes(1);
    });

    it('survives a failing poll and enters on a later tick', async () => {
      vi.useFakeTimers();
      mockedJoin.mockResolvedValue({ status: 'queued' });
      const { result } = renderHook(() => useRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice');
      });

      mockedActive.mockRejectedValueOnce(new Error('network'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      expect(push).not.toHaveBeenCalled();

      mockedActive.mockResolvedValue({
        lobby_id: 'WXYZ',
        token: 'tok-poll',
        ranked_countdown_deadline: null,
        started: false,
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      expect(push).toHaveBeenCalledWith('/lobby?id=WXYZ');
    });

    it('stops polling after cancelQueue', async () => {
      vi.useFakeTimers();
      mockedJoin.mockResolvedValue({ status: 'queued' });
      mockedLeave.mockResolvedValue({ status: 'left', was_queued: true });
      const { result } = renderHook(() => useRankedQueue());

      await act(async () => {
        await result.current.startQueue('Alice');
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
    mockedJoin.mockResolvedValue({ status: 'queued' });
    const { result, unmount } = renderHook(() => useRankedQueue());

    await act(async () => {
      await result.current.startQueue('Alice');
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
