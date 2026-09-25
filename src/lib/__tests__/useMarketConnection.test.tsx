import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMarketConnection } from '@/lib/useMarketConnection';
import { getMarketListings } from '@/lib/api';
import * as socketModule from '@/lib/socket';
import type { MarketListing } from '@/lib/market';

vi.mock('@/lib/api', () => ({ getMarketListings: vi.fn() }));
vi.mock('@/lib/http', () => ({ getStoredAccountToken: () => 'tok-1' }));

vi.mock('@/lib/socket', () => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const connectHandlers = new Set<() => void>();
  const emit = vi.fn();
  return {
    getSocket: () => ({
      emit,
      on: (event: string, handler: () => void) => {
        if (event === 'connect') connectHandlers.add(handler);
      },
      off: (event: string, handler: () => void) => {
        if (event === 'connect') connectHandlers.delete(handler);
      },
    }),
    subscribe: (event: string, handler: (payload: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => listeners.get(event)?.delete(handler);
    },
    __push: (event: string, payload: unknown) => {
      listeners.get(event)?.forEach((h) => h(payload));
    },
    __reconnect: () => connectHandlers.forEach((h) => h()),
    __emit: emit,
    __reset: () => { listeners.clear(); connectHandlers.clear(); emit.mockClear(); },
  };
});

const socket = socketModule as unknown as {
  __push: (event: string, payload: unknown) => void;
  __reconnect: () => void;
  __emit: ReturnType<typeof vi.fn>;
  __reset: () => void;
};

const mockedGet = vi.mocked(getMarketListings);

const listing = (over: Partial<MarketListing> = {}): MarketListing => ({
  id: 1,
  kind: 'quick',
  status: 'open',
  seller_player_id: 5,
  seller_name: 'Ada',
  created_at: '2026-09-02T10:00:00Z',
  expires_at: '2026-09-02T10:01:00Z',
  give: [],
  want: [],
  ...over,
});

const emptyBoard = { listings: [], server_time: '2026-09-02T10:00:30Z' };

beforeEach(() => {
  socket.__reset();
  mockedGet.mockReset();
  mockedGet.mockResolvedValue(emptyBoard);
});

describe('useMarketConnection', () => {
  it('joins the market room on mount, no token required to watch', () => {
    renderHook(() => useMarketConnection());
    expect(socket.__emit).toHaveBeenCalledWith('join_market', { token: 'tok-1' });
  });

  it('fills the board from the initial poll', async () => {
    mockedGet.mockResolvedValue({ ...emptyBoard, listings: [listing({ id: 9 })] });
    const { result } = renderHook(() => useMarketConnection());
    await waitFor(() => expect(result.current.listings.map((l) => l.id)).toEqual([9]));
  });

  it('records the server clock offset from a fetch', async () => {
    const { result } = renderHook(() => useMarketConnection());
    await waitFor(() => expect(result.current.clockOffsetMs).not.toBe(0));
    // server_time is a fixed past instant, so the offset is strongly negative.
    expect(result.current.clockOffsetMs).toBeLessThan(0);
  });

  it('takes a created listing from a push without waiting for a poll', async () => {
    const { result } = renderHook(() => useMarketConnection());
    await waitFor(() => expect(result.current.listings).toEqual([]));
    act(() => { socket.__push('listing_created', listing({ id: 2 })); });
    expect(result.current.listings.map((l) => l.id)).toEqual([2]);
  });

  it('drops a listing off the board when its update is no longer open', async () => {
    const { result } = renderHook(() => useMarketConnection());
    act(() => { socket.__push('listing_created', listing({ id: 3 })); });
    expect(result.current.listings).toHaveLength(1);
    act(() => { socket.__push('listing_updated', listing({ id: 3, status: 'fulfilled' })); });
    expect(result.current.listings).toEqual([]);
  });

  it('removes a listing on the expired push', async () => {
    const { result } = renderHook(() => useMarketConnection());
    act(() => { socket.__push('listing_created', listing({ id: 4 })); });
    act(() => { socket.__push('listing_expired', { id: 4 }); });
    expect(result.current.listings).toEqual([]);
  });

  it('orders the board newest first', async () => {
    const { result } = renderHook(() => useMarketConnection());
    act(() => {
      socket.__push('listing_created', listing({ id: 1, created_at: '2026-09-02T10:00:00Z' }));
      socket.__push('listing_created', listing({ id: 2, created_at: '2026-09-02T10:05:00Z' }));
    });
    expect(result.current.listings.map((l) => l.id)).toEqual([2, 1]);
  });

  it('takes the chat backlog and then appends live messages', async () => {
    const { result } = renderHook(() => useMarketConnection());
    act(() => {
      socket.__push('market_chat_backlog', {
        messages: [{ sender: 'Ada', message: 'hi', timestamp: '2026-09-02T10:00:00Z' }],
      });
    });
    expect(result.current.chat).toHaveLength(1);
    act(() => {
      socket.__push('market_chat_message', { sender: 'Bo', message: 'yo', timestamp: '2026-09-02T10:00:10Z' });
    });
    expect(result.current.chat.map((m) => m.sender)).toEqual(['Ada', 'Bo']);
  });

  it('starts with an empty frog list and takes a pushed one', () => {
    const { result } = renderHook(() => useMarketConnection());
    expect(result.current.frogs).toEqual({ count: 0, names: [] });

    act(() => {
      socket.__push('market_frogs', { count: 3, names: ['Ada', 'Bo'] });
    });

    expect(result.current.frogs).toEqual({ count: 3, names: ['Ada', 'Bo'] });
  });

  it('sendChat emits nothing for a blank message and the trimmed text otherwise', () => {
    const { result } = renderHook(() => useMarketConnection());
    socket.__emit.mockClear();
    act(() => { result.current.sendChat('   '); });
    expect(socket.__emit).not.toHaveBeenCalled();
    act(() => { result.current.sendChat('  hello  '); });
    expect(socket.__emit).toHaveBeenCalledWith('send_market_message', { token: 'tok-1', message: 'hello' });
  });

  it('refetch pulls the board again on demand', async () => {
    const { result } = renderHook(() => useMarketConnection());
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));
    mockedGet.mockResolvedValue({ ...emptyBoard, listings: [listing({ id: 7 })] });
    await act(async () => { result.current.refetch(); });
    await waitFor(() => expect(result.current.listings.map((l) => l.id)).toEqual([7]));
  });

  it('re-joins the room after a reconnect', () => {
    renderHook(() => useMarketConnection());
    socket.__emit.mockClear();
    act(() => { socket.__reconnect(); });
    expect(socket.__emit).toHaveBeenCalledWith('join_market', { token: 'tok-1' });
  });

  it('keeps the last board when a poll fails', async () => {
    const { result } = renderHook(() => useMarketConnection(20));
    act(() => { socket.__push('listing_created', listing({ id: 8 })); });
    mockedGet.mockRejectedValue(new Error('offline'));
    await new Promise((r) => setTimeout(r, 60));
    expect(result.current.listings.map((l) => l.id)).toEqual([8]);
  });

  it('leaves the room on unmount and ignores a later push', () => {
    const { result, unmount } = renderHook(() => useMarketConnection());
    unmount();
    expect(socket.__emit).toHaveBeenCalledWith('leave_market');
    const before = result.current;
    act(() => { socket.__push('listing_created', listing({ id: 99 })); });
    expect(result.current).toBe(before);
  });
});
