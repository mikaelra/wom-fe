import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCityPresence } from '@/lib/useCityPresence';
import * as socketModule from '@/lib/socket';

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

beforeEach(() => {
  socket.__reset();
});

describe('useCityPresence', () => {
  it('starts at all-zero and asks to watch on mount', () => {
    const { result } = renderHook(() => useCityPresence());
    expect(result.current).toEqual({ bossfight: 0, ranked: 0, bot_ranked: 0, market: 0 });
    expect(socket.__emit).toHaveBeenCalledWith('watch_city_presence');
  });

  it('takes a pushed count set', () => {
    const { result } = renderHook(() => useCityPresence());

    act(() => {
      socket.__push('city_presence', { bossfight: 3, ranked: 1, bot_ranked: 6, market: 2 });
    });

    expect(result.current).toEqual({ bossfight: 3, ranked: 1, bot_ranked: 6, market: 2 });
  });

  it('re-asks to watch after a reconnect', () => {
    renderHook(() => useCityPresence());
    socket.__emit.mockClear();

    act(() => { socket.__reconnect(); });

    expect(socket.__emit).toHaveBeenCalledWith('watch_city_presence');
  });

  it('stops watching on unmount', () => {
    const { unmount } = renderHook(() => useCityPresence());
    socket.__emit.mockClear();

    unmount();

    expect(socket.__emit).toHaveBeenCalledWith('stop_watching_city_presence');
  });
});
