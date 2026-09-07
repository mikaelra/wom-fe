'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket, subscribe, subscribeConnect } from '@/lib/socket';
import { setStoredToken } from '@/lib/http';
import { getActiveRankedLobby, joinRankedQueue, leaveRankedQueue } from '@/lib/api';

export type RankedQueueStatus = 'idle' | 'searching';

/** How often a *searching* client re-asks the backend whether it has been
 *  matched already. Only a safety net behind the ranked_match_found push,
 *  so it wants to be as slow as it can afford to be -- but it cannot be
 *  slower than the shortest window between being matched and the match
 *  starting without you. That window is not the usual 60s countdown: a
 *  lobby that fills to RANKED_QUEUE_MAX_PLAYERS collapses its deadline to
 *  RANKED_COUNTDOWN_COLLAPSE_SECONDS (6s, wom-be config.py), so anything
 *  above ~5s would let a full lobby start without a player whose push was
 *  lost -- exactly the case this exists to catch.
 *
 *  Cost is bounded by queue depth rather than player count (only clients
 *  actually waiting poll, and they stop the moment they are in), which is
 *  what keeps this off wom-be's hot paths. */
const ACTIVE_MATCH_POLL_MS = 4000;

/**
 * The ranked queue's join/wait/cancel state machine (docs/RANK_SYSTEM_PLAN.md
 * §6/§10). Mirrors joinLobby's (api.ts) one-off-ack pattern: subscribe to
 * ranked_match_found, act on the first (and only) delivery, unsubscribe.
 * There's no failure ack to race against here -- the queue join itself is a
 * plain REST call that either succeeds or throws.
 *
 * On a match, the existing, unmodified join_room socket handler is what
 * actually lands the player in the lobby (same as every other join path in
 * this codebase) -- this hook just supplies it {lobby_id, token} and
 * navigates, no new landing logic.
 *
 * Getting matched and never being told
 * ------------------------------------
 * Queueing and being notified travel over two channels that do NOT fail
 * together, and that asymmetry used to lose players their matches outright:
 *
 *   * the queue entry is created by a REST call and lives server-side keyed
 *     by *name* (wom-be's services/ranked_queue_service._queue), so it
 *     survives anything that happens to this browser's socket;
 *   * the ranked_match_found push is emitted to a Socket.IO room, and rooms
 *     are keyed by *connection* (sid).
 *
 * So a reconnect -- routine on mobile, on a backgrounded tab, on any brief
 * network blip, and ranked waits run for minutes -- leaves the player queued
 * but sitting in no room. Matchmaking still matches them, still puts them in
 * the lobby, and still fires the push, which lands in a room with no live
 * connection in it and is dropped (Socket.IO does not buffer room emits for
 * absent members). Server-side they are in a ranked match; their browser
 * never hears about it, and the first they know is a ranked loss.
 *
 * Two layers guard it, because the cost of missing the event is that high:
 *
 *   1. re-emit join_ranked_queue on every `connect` while searching, which
 *      re-joins the room the reconnect just dropped (the backend handler is
 *      idempotent -- it only calls join_room);
 *   2. poll /ranked/active while searching, so a player who was matched
 *      during the gap is pulled into the lobby even if the push was lost for
 *      some reason layer 1 does not cover.
 *
 * Layer 2 alone fixes the reported symptom; layer 1 is what keeps the push
 * (and so the instant entry) working in the first place.
 */
export function useRankedQueue() {
  const router = useRouter();
  const [status, setStatus] = useState<RankedQueueStatus>('idle');
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const unsubscribeConnectRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queuedNameRef = useRef<string | null>(null);
  /** Set the instant either path commits to a match, so the push and the
   *  poll landing at the same moment can't both navigate. */
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

  // Nothing used to tear these down when the player navigated away mid-search
  // (the city scene unmounting, say), leaving a live subscription and now a
  // live interval behind on the shared socket.
  useEffect(() => stopListening, [stopListening]);

  /** The one place a found match is acted on, whichever layer found it. */
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
    async (name: string) => {
      queuedNameRef.current = name;
      enteredRef.current = false;
      setStatus('searching');

      getSocket().emit('join_ranked_queue', { name });
      stopListening();
      unsubscribeRef.current = subscribe('ranked_match_found', ({ lobby_id, token }) => {
        enterMatch(lobby_id, token);
      });

      // Layer 1: a reconnect drops the queue room, so re-join it.
      unsubscribeConnectRef.current = subscribeConnect(() => {
        const queuedName = queuedNameRef.current;
        if (queuedName && !enteredRef.current) {
          getSocket().emit('join_ranked_queue', { name: queuedName });
        }
      });

      // Layer 2: catch a match whose push never arrived.
      pollRef.current = setInterval(() => {
        const queuedName = queuedNameRef.current;
        if (!queuedName || enteredRef.current) return;
        getActiveRankedLobby(queuedName)
          .then(({ lobby_id, token }) => {
            if (lobby_id && token) enterMatch(lobby_id, token);
          })
          .catch(() => {
            // Best-effort: this is the backup path, and the push plus the
            // next tick both still stand behind it.
          });
      }, ACTIVE_MATCH_POLL_MS);

      try {
        await joinRankedQueue(name);
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
    const name = queuedNameRef.current;
    if (name) {
      await leaveRankedQueue(name).catch(() => {
        // Best-effort -- the queue entry also expires server-side
        // (RANKED_QUEUE_STALE_SECONDS) if this doesn't land.
      });
    }
  }, [stopListening]);

  return { status, startQueue, cancelQueue };
}
