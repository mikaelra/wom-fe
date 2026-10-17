import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBossfightRoster } from '@/lib/useBossfightRoster';
import { getBossfightRoster } from '@/lib/api';
import * as socketModule from '@/lib/socket';

vi.mock('@/lib/api', () => ({ getBossfightRoster: vi.fn() }));

// A fake socket that records emits and lets a test push a server event.
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

const mockedGet = vi.mocked(getBossfightRoster);
const empty = { lobby_id: null, round: 0, start_time: null, players: [] };
const occupant = (name: string) => ({
  name, skin: null, alive: true, spectator: false, bot: false,
});

beforeEach(() => {
  socket.__reset();
  mockedGet.mockReset();
  mockedGet.mockResolvedValue(empty);
});

describe('useBossfightRoster', () => {
  it('asks to watch the city as soon as it mounts', () => {
    renderHook(() => useBossfightRoster());
    expect(socket.__emit).toHaveBeenCalledWith('watch_bossfight');
  });

  it('takes a pushed roster without waiting for a poll', async () => {
    const { result } = renderHook(() => useBossfightRoster());
    await waitFor(() => expect(result.current).toEqual(empty));

    act(() => {
      socket.__push('bossfight_roster', {
        lobby_id: 'bf1', round: 0, start_time: null, players: [occupant('Ada')],
      });
    });

    expect(result.current.players.map((p) => p.name)).toEqual(['Ada']);
  });

  it('follows the round starting, which is the whole point of the push', async () => {
    const { result } = renderHook(() => useBossfightRoster());
    act(() => {
      socket.__push('bossfight_roster', {
        lobby_id: 'bf1', round: 0, start_time: null, players: [occupant('Ada')],
      });
    });
    expect(result.current.round).toBe(0);

    act(() => {
      socket.__push('bossfight_roster', {
        lobby_id: 'bf1', round: 1, start_time: null, players: [occupant('Ada')],
      });
    });
    expect(result.current.round).toBe(1);
  });

  it('re-asks to watch after a reconnect, since rooms do not survive one', () => {
    renderHook(() => useBossfightRoster());
    socket.__emit.mockClear();

    act(() => { socket.__reconnect(); });

    expect(socket.__emit).toHaveBeenCalledWith('watch_bossfight');
  });

  it('still fills the temple from the poll when no push arrives', async () => {
    mockedGet.mockResolvedValue({
      lobby_id: 'bf1', round: 2, start_time: null, players: [occupant('Bo')],
    });
    const { result } = renderHook(() => useBossfightRoster());

    await waitFor(() => expect(result.current.players.map((p) => p.name)).toEqual(['Bo']));
  });

  it('keeps the last roster when a poll fails rather than emptying the temple', async () => {
    // Polled fast here so several attempts land inside the test.
    const { result } = renderHook(() => useBossfightRoster(20));
    await waitFor(() => expect(result.current).toEqual(empty));
    act(() => {
      socket.__push('bossfight_roster', {
        lobby_id: 'bf1', round: 1, start_time: null, players: [occupant('Ada')],
      });
    });
    mockedGet.mockRejectedValue(new Error('offline'));

    // A blink of a network error must not look like everyone walked out.
    await new Promise((r) => setTimeout(r, 80));
    expect(result.current.players.map((p) => p.name)).toEqual(['Ada']);
  });

  it('does not let a poll that was already in flight undo a newer push', async () => {
    // The poll is the safety net under the push, so it must never be the
    // thing that puts stale news back on the signpost -- most visibly
    // right after the round starts, flipping PLAYING back to WAITING.
    let resolvePoll: (r: typeof empty) => void = () => {};
    mockedGet.mockReturnValue(new Promise((res) => { resolvePoll = res; }));
    const { result } = renderHook(() => useBossfightRoster());

    act(() => {
      socket.__push('bossfight_roster', {
        lobby_id: 'bf1', round: 1, start_time: null, players: [occupant('Ada')],
      });
    });
    // The request that was in flight all along now answers, with the view
    // from before the round started.
    await act(async () => { resolvePoll(empty); });

    expect(result.current.round).toBe(1);
    expect(result.current.players.map((p) => p.name)).toEqual(['Ada']);
  });

  it('stops watching when the city scene goes away', () => {
    const { unmount } = renderHook(() => useBossfightRoster());
    socket.__emit.mockClear();

    unmount();

    expect(socket.__emit).toHaveBeenCalledWith('stop_watching_bossfight');
  });

  it('ignores a push that arrives after unmount', () => {
    const { result, unmount } = renderHook(() => useBossfightRoster());
    const before = result.current;
    unmount();

    act(() => {
      socket.__push('bossfight_roster', {
        lobby_id: 'bf1', round: 1, start_time: null, players: [occupant('Ada')],
      });
    });

    expect(result.current).toBe(before);
  });
});
