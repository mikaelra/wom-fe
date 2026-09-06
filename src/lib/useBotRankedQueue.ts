'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket, subscribe, subscribeConnect } from '@/lib/socket';
import { setStoredToken } from '@/lib/http';
import {
  getActiveBotRankedLobby,
  joinBotRankedQueue,
  leaveBotRankedQueue,
} from '@/lib/api';

export type BotRankedQueueStatus = 'idle' | 'searching';

/** Safety-net poll behind the ai_ranked_match_found push -- same role as
 *  useRankedQueue's ACTIVE_MATCH_POLL_MS. Bot-ranked has no deadline
 *  collapse (no min-player gate, no rating bands), so the tightest window
 *  is just the countdown itself; 4s is comfortably inside it. */
const ACTIVE_MATCH_POLL_MS = 4000;

/**
 * The bot-ranked queue's join/wait/cancel state machine (docs/MY_AI.md §4).
 * A direct sibling of useRankedQueue -- see that file's long comment for
 * why queueing (a REST call, keyed server-side by name) and being notified
 * (a Socket.IO room emit, keyed by connection) don't fail together, and
 * why the two guard layers below matter:
 *
 *   1. re-emit join_ai_ranked_queue on every `connect` while searching,
 *      re-joining the room a reconnect dropped (the backend handler only
 *      calls join_room, so it's idempotent);
 *   2. poll /my_ai/bot_ranked/active while searching, to pull in a player
 *      who was matched during a gap the push didn't survive.
 *
 * The one shape difference from useRankedQueue: the REST calls here are
 * authed by the account token, not the player name, so startQueue takes
 * both -- the name for the socket room, the token for the REST surface.
 */
export function useBotRankedQueue() {
  const router = useRouter();
  const [status, setStatus] = useState<BotRankedQueueStatus>('idle');
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const unsubscribeConnectRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queuedNameRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  /** Set the instant either path commits to a match, so the push and the
   *  poll landing together can't both navigate. */
  const enteredRef = useRef(false);

  const stopListening = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    unsubscribeConnectRef.current?.();
    unsubscribeConnectRef.current = null;
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopListening, [stopListening]);

  const enterMatch = useCallback(
    (lobbyId: string, token: string) => {
      if (enteredRef.current) return;
      enteredRef.current = true;
      stopListening();
      setStoredToken(lobbyId, token);
      getSocket().emit('join_room', { lobby_id: lobbyId, token });
      router.push(`/lobby?id=${lobbyId}`);
    },
    [router, stopListening]
  );

  const startQueue = useCallback(
    async (name: string, accountToken: string) => {
      queuedNameRef.current = name;
      tokenRef.current = accountToken;
      enteredRef.current = false;
      setStatus('searching');

      getSocket().emit('join_ai_ranked_queue', { name });
      stopListening();
      unsubscribeRef.current = subscribe('ai_ranked_match_found', ({ lobby_id, token }) => {
        enterMatch(lobby_id, token);
      });

      // Layer 1: a reconnect drops the queue room, so re-join it.
      unsubscribeConnectRef.current = subscribeConnect(() => {
        const queuedName = queuedNameRef.current;
        if (queuedName && !enteredRef.current) {
          getSocket().emit('join_ai_ranked_queue', { name: queuedName });
        }
      });

      // Layer 2: catch a match whose push never arrived.
      pollRef.current = setInterval(() => {
        const token = tokenRef.current;
        if (!token || enteredRef.current) return;
        getActiveBotRankedLobby(token)
          .then(({ lobby_id, token: lobbyToken }) => {
            if (lobby_id && lobbyToken) enterMatch(lobby_id, lobbyToken);
          })
          .catch(() => {
            // Best-effort backup; the push and the next tick still stand.
          });
      }, ACTIVE_MATCH_POLL_MS);

      try {
        await joinBotRankedQueue(accountToken);
      } catch (err) {
        stopListening();
        setStatus('idle');
        throw err;
      }
    },
    [enterMatch, stopListening]
  );

  const cancelQueue = useCallback(async () => {
    stopListening();
    setStatus('idle');
    const token = tokenRef.current;
    if (token) {
      await leaveBotRankedQueue(token).catch(() => {
        // Best-effort -- the entry also expires server-side
        // (AI_RANKED_QUEUE_STALE_SECONDS) if this doesn't land.
      });
    }
  }, [stopListening]);

  return { status, startQueue, cancelQueue };
}
