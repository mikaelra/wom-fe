import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLobbyConnection } from '@/lib/useLobbyConnection';
import { setStoredToken } from '@/lib/http';
import * as socketModule from '@/lib/socket';

// A minimal fake for @/lib/socket's getSocket()/subscribe(): real socket.io
// events (connect/disconnect) go through a fake emitter with on/off/emit;
// our own validated event map (state_update/chat_message/error) goes
// through a separate registry mirroring subscribe()'s real contract
// (register a handler, return an unsubscribe). Test helpers below let a
// test fire either kind directly, without a real socket or zod parsing.
vi.mock('@/lib/socket', () => {
  const socketListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const subscribeListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emit = vi.fn();

  const fakeSocket = {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (!socketListeners.has(event)) socketListeners.set(event, new Set());
      socketListeners.get(event)!.add(handler);
    },
    off: (event: string, handler: (...args: unknown[]) => void) => {
      socketListeners.get(event)?.delete(handler);
    },
    emit,
  };

  return {
    getSocket: () => fakeSocket,
    subscribe: (event: string, handler: (...args: unknown[]) => void) => {
      if (!subscribeListeners.has(event)) subscribeListeners.set(event, new Set());
      subscribeListeners.get(event)!.add(handler);
      return () => subscribeListeners.get(event)?.delete(handler);
    },
    __fireSocketEvent: (event: string, payload?: unknown) => {
      socketListeners.get(event)?.forEach((h) => h(payload));
    },
    __fireSubscribeEvent: (event: string, payload: unknown) => {
      subscribeListeners.get(event)?.forEach((h) => h(payload));
    },
    __emit: emit,
    __reset: () => {
      socketListeners.clear();
      subscribeListeners.clear();
      emit.mockClear();
    },
  };
});

const socket = socketModule as unknown as {
  __fireSocketEvent: (event: string, payload?: unknown) => void;
  __fireSubscribeEvent: (event: string, payload: unknown) => void;
  __emit: ReturnType<typeof vi.fn>;
  __reset: () => void;
};

const baseLobbyState = {
  round: 0,
  players: [],
  winner: null,
  wellwinner: null,
  pending_deny: null,
  deny_target: null,
  readyPlayers: [],
  history: [],
  round_end_time: null,
  boss_fight: false,
  start_time: null,
  gameover: false,
  chat: [],
};

beforeEach(() => {
  socket.__reset();
  setStoredToken('AAAA', 'test-token');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLobbyConnection', () => {
  it('starts connecting, stays connecting on the raw connect event alone, and only flips to connected once a state_update confirms the rejoin', () => {
    const { result } = renderHook(() => useLobbyConnection('AAAA', 'Alice'));
    expect(result.current.connectionStatus).toBe('connecting');

    act(() => {
      socket.__fireSocketEvent('connect');
    });
    expect(result.current.connectionStatus).toBe('connecting');

    act(() => {
      socket.__fireSubscribeEvent('state_update', baseLobbyState);
    });
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('emits join_lobby and join_room on mount', () => {
    renderHook(() => useLobbyConnection('AAAA', 'Alice'));

    expect(socket.__emit).toHaveBeenCalledWith('join_lobby', {
      lobby_id: 'AAAA',
      name: 'Alice',
      email: '',
    });
    expect(socket.__emit).toHaveBeenCalledWith('join_room', {
      lobby_id: 'AAAA',
      token: 'test-token',
    });
  });

  it('populates state from a state_update broadcast', () => {
    const { result } = renderHook(() => useLobbyConnection('AAAA', 'Alice'));

    act(() => {
      socket.__fireSubscribeEvent('state_update', { ...baseLobbyState, round: 2 });
    });

    expect(result.current.state).toEqual({ ...baseLobbyState, round: 2 });
  });

  it('flips to disconnected on a disconnect event, re-emits join_room on reconnect, and only flips back to connected once a state_update confirms the rejoin', () => {
    const { result } = renderHook(() => useLobbyConnection('AAAA', 'Alice'));

    act(() => {
      socket.__fireSocketEvent('disconnect');
    });
    expect(result.current.connectionStatus).toBe('disconnected');

    socket.__emit.mockClear();
    act(() => {
      socket.__fireSocketEvent('connect');
    });

    // Raw transport reconnecting alone isn't proof the rejoin succeeded --
    // status stays 'disconnected' until a real state_update confirms it.
    expect(result.current.connectionStatus).toBe('disconnected');
    expect(socket.__emit).toHaveBeenCalledWith('join_room', {
      lobby_id: 'AAAA',
      token: 'test-token',
    });

    act(() => {
      socket.__fireSubscribeEvent('state_update', baseLobbyState);
    });
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('stays disconnected if the transport reconnects but the rejoin never succeeds, e.g. the lobby is gone after a backend restart', () => {
    // Regression for wom-e2e KNOWN_ISSUES.md #5: a backend restart wipes
    // all lobby state, so a rejoin against the fresh process gets back an
    // "error" (lobby not found), never another state_update.
    // connectionStatus must not flip back to 'connected' just because the
    // raw socket transport reconnected -- that would let SceneOverlay
    // silently resume rendering the stale pre-restart UI with no further
    // indication the session is actually gone.
    const { result } = renderHook(() => useLobbyConnection('AAAA', 'Alice'));

    act(() => {
      socket.__fireSocketEvent('disconnect');
    });
    act(() => {
      socket.__fireSocketEvent('connect');
    });
    act(() => {
      socket.__fireSubscribeEvent('error', { message: 'Lobby AAAA not found' });
    });

    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('re-reads playerEmail from localStorage on every reconnect, not just at mount', () => {
    // Regression: rejoin() used to capture localStorage's playerEmail once
    // when the effect first ran and reuse that value on every later
    // reconnect. A same-tab email verification that completes after mount
    // (e.g. via BossSignupNudge) was invisible to it -- the next reconnect
    // (a backgrounded tab regaining focus is a common trigger) re-sent the
    // stale empty email, which the backend legitimately reads as "someone
    // else's account" and rejects.
    renderHook(() => useLobbyConnection('AAAA', 'Alice'));
    expect(socket.__emit).toHaveBeenCalledWith('join_lobby', {
      lobby_id: 'AAAA',
      name: 'Alice',
      email: '',
    });

    localStorage.setItem('playerEmail', 'alice@example.com');
    socket.__emit.mockClear();
    act(() => {
      socket.__fireSocketEvent('connect');
    });

    expect(socket.__emit).toHaveBeenCalledWith('join_lobby', {
      lobby_id: 'AAAA',
      name: 'Alice',
      email: 'alice@example.com',
    });
    localStorage.clear();
  });

  it('merges a chat_message into state.chat and calls onChatMessage', () => {
    const onChatMessage = vi.fn();
    const { result } = renderHook(() =>
      useLobbyConnection('AAAA', 'Alice', { onChatMessage })
    );

    act(() => {
      socket.__fireSubscribeEvent('state_update', baseLobbyState);
    });

    const msg = { sender: 'Bob', message: 'hi', timestamp: '2026-01-01T00:00:00Z' };
    act(() => {
      socket.__fireSubscribeEvent('chat_message', msg);
    });

    expect(result.current.state?.chat).toEqual([msg]);
    expect(onChatMessage).toHaveBeenCalledWith(msg);
  });

  it('calls onError for socket error events', () => {
    const onError = vi.fn();
    renderHook(() => useLobbyConnection('AAAA', 'Alice', { onError }));

    act(() => {
      socket.__fireSubscribeEvent('error', { message: 'Lobby not found' });
    });

    expect(onError).toHaveBeenCalledWith('Lobby not found');
  });

  it('resets state to null when lobbyId changes', () => {
    const { result, rerender } = renderHook(
      ({ lobbyId }) => useLobbyConnection(lobbyId, 'Alice'),
      { initialProps: { lobbyId: 'AAAA' } }
    );

    act(() => {
      socket.__fireSubscribeEvent('state_update', baseLobbyState);
    });
    expect(result.current.state).not.toBeNull();

    rerender({ lobbyId: 'BBBB' });

    expect(result.current.state).toBeNull();
  });

  it('polls join_room every 3s while the game has not started', () => {
    vi.useFakeTimers();
    renderHook(() => useLobbyConnection('AAAA', 'Alice'));

    act(() => {
      socket.__fireSubscribeEvent('state_update', { ...baseLobbyState, round: 0 });
    });

    socket.__emit.mockClear();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(socket.__emit).toHaveBeenCalledWith('join_room', {
      lobby_id: 'AAAA',
      token: 'test-token',
    });
  });

  it('does not poll once a round has started', () => {
    vi.useFakeTimers();
    renderHook(() => useLobbyConnection('AAAA', 'Alice'));

    act(() => {
      socket.__fireSubscribeEvent('state_update', { ...baseLobbyState, round: 1 });
    });

    socket.__emit.mockClear();
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(socket.__emit).not.toHaveBeenCalledWith('join_room', expect.anything());
  });

  it('does not poll on the post-gameover screen (the removed Rematch feature is the only reason it used to)', () => {
    vi.useFakeTimers();
    renderHook(() => useLobbyConnection('AAAA', 'Alice'));

    act(() => {
      socket.__fireSubscribeEvent('state_update', { ...baseLobbyState, round: 3, gameover: true });
    });

    socket.__emit.mockClear();
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(socket.__emit).not.toHaveBeenCalledWith('join_room', expect.anything());
  });
});
