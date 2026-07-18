import { useEffect, useRef, useState } from 'react';
import { getSocket, subscribe } from '@/lib/socket';
import { getStoredToken } from '@/lib/http';
import type { LobbyState, ChatMessage } from '@/types/game';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type UseLobbyConnectionOptions = {
  /** Fired for each incoming chat broadcast (state.chat is updated either way). */
  onChatMessage?: (msg: ChatMessage) => void;
  /** Fired for socket "error" events. */
  onError?: (message: string) => void;
};

/**
 * Owns the socket lifecycle for one lobby: joins on mount and on every
 * reconnect, feeds `state_update` broadcasts into React state, folds chat
 * broadcasts into `state.chat`, tracks connectionStatus via the socket's
 * own connect/disconnect events, and leaves the room on unmount.
 *
 * Also runs a low-frequency polling fallback during the pre-game lobby --
 * an idle window where a silently dropped broadcast would otherwise leave
 * the UI stuck with no other event to self-correct it. (This used to also
 * poll for the entire post-gameover screen, added for the since-removed
 * Rematch feature's live vote count -- today's gameover screen has nothing
 * live left to poll for, so that half was dropped, not carried forward.)
 */
export function useLobbyConnection(
  lobbyId: string,
  playerName: string,
  options: UseLobbyConnectionOptions = {}
): { state: LobbyState | null; connectionStatus: ConnectionStatus } {
  const [state, setState] = useState<LobbyState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  // Callbacks live in a ref so their identity never forces a resubscribe.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!lobbyId || !playerName) return;
    // Fresh lobby -> drop the previous lobby's state immediately rather
    // than briefly rendering stale data while the new join completes.
    setState(null);
    setConnectionStatus('connecting');

    const sock = getSocket();

    // join_room is what actually subscribes this socket to the lobby's
    // broadcast room, so it must fire on every (re)connect regardless of
    // whether join_lobby succeeds or reports "Name taken" (the common case
    // for anyone who already joined earlier). Gating it behind a successful
    // "joined_lobby" response left reconnecting clients silently stuck
    // outside the room with no further state_update broadcasts.
    //
    // join_room authenticates via the join-issued session token instead of
    // a client-supplied name (backend Phase 1a) -- the server resolves the
    // actor's name from the token itself.
    //
    // email is read fresh on every call rather than captured once above --
    // a reconnect can happen well after mount (e.g. a backgrounded tab
    // regaining focus), and by then localStorage's playerEmail may have
    // changed (e.g. BossSignupNudge just wrote a freshly-verified one). A
    // captured empty string here used to get re-sent on every later
    // reconnect, which the backend correctly reads as "someone else's
    // email" and rejects with "This name is claimed" even for the account's
    // own owner.
    const rejoin = () => {
      const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') ?? '' : '';
      sock.emit('join_lobby', { lobby_id: lobbyId, name: playerName, email });
      sock.emit('join_room', { lobby_id: lobbyId, token: getStoredToken(lobbyId) });
    };

    const handleConnect = () => {
      setConnectionStatus('connected');
      rejoin();
    };
    const handleDisconnect = () => {
      setConnectionStatus('disconnected');
    };

    sock.on('connect', handleConnect);
    sock.on('disconnect', handleDisconnect);
    rejoin();

    const unsubState = subscribe('state_update', (data) => {
      setState(data);
    });

    const unsubChat = subscribe('chat_message', (msg) => {
      setState((prev) => (prev ? { ...prev, chat: [...(prev.chat ?? []), msg] } : prev));
      optionsRef.current.onChatMessage?.(msg);
    });

    const unsubError = subscribe('error', (data) => {
      optionsRef.current.onError?.(data.message);
    });

    return () => {
      sock.off('connect', handleConnect);
      sock.off('disconnect', handleDisconnect);
      sock.emit('leave_room', { lobby_id: lobbyId });
      unsubState();
      unsubChat();
      unsubError();
    };
  }, [lobbyId, playerName]);

  // Polling fallback for the pre-game lobby idle window only -- see the
  // module docstring for why the post-gameover half was dropped.
  const gameStarted = (state?.round ?? 0) > 0;
  useEffect(() => {
    if (!lobbyId || !playerName) return;
    if (gameStarted) return;
    const interval = setInterval(() => {
      getSocket().emit('join_room', { lobby_id: lobbyId, token: getStoredToken(lobbyId) });
    }, 3000);
    return () => clearInterval(interval);
  }, [lobbyId, playerName, gameStarted]);

  return { state, connectionStatus };
}
