import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRankedQueue } from '@/lib/useRankedQueue';
import { joinRankedQueue, leaveRankedQueue } from '@/lib/api';
import { setStoredToken } from '@/lib/http';
import * as socketModule from '@/lib/socket';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  joinRankedQueue: vi.fn(),
  leaveRankedQueue: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  setStoredToken: vi.fn(),
}));

// Same fake-subscribe pattern as useLobbyConnection.test.tsx.
vi.mock('@/lib/socket', () => {
  const subscribeListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emit = vi.fn();

  return {
    getSocket: () => ({ emit }),
    subscribe: (event: string, handler: (...args: unknown[]) => void) => {
      if (!subscribeListeners.has(event)) subscribeListeners.set(event, new Set());
      subscribeListeners.get(event)!.add(handler);
      return () => subscribeListeners.get(event)?.delete(handler);
    },
    __fireSubscribeEvent: (event: string, payload: unknown) => {
      subscribeListeners.get(event)?.forEach((h) => h(payload));
    },
    __emit: emit,
    __reset: () => {
      subscribeListeners.clear();
      emit.mockClear();
    },
  };
});

const socket = socketModule as unknown as {
  __fireSubscribeEvent: (event: string, payload: unknown) => void;
  __emit: ReturnType<typeof vi.fn>;
  __reset: () => void;
};

const mockedJoin = vi.mocked(joinRankedQueue);
const mockedLeave = vi.mocked(leaveRankedQueue);
const mockedSetStoredToken = vi.mocked(setStoredToken);

beforeEach(() => {
  socket.__reset();
  mockedJoin.mockReset();
  mockedLeave.mockReset();
  mockedSetStoredToken.mockReset();
  push.mockReset();
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
    expect(push).toHaveBeenCalledWith('/lobby/ABCD');
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
});
