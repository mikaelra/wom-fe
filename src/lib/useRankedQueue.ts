'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket, subscribe } from '@/lib/socket';
import { setStoredToken } from '@/lib/http';
import { joinRankedQueue, leaveRankedQueue } from '@/lib/api';

export type RankedQueueStatus = 'idle' | 'searching';

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
 */
export function useRankedQueue() {
  const router = useRouter();
  const [status, setStatus] = useState<RankedQueueStatus>('idle');
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const queuedNameRef = useRef<string | null>(null);

  const stopListening = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  const startQueue = useCallback(
    async (name: string) => {
      queuedNameRef.current = name;
      setStatus('searching');

      getSocket().emit('join_ranked_queue', { name });
      stopListening();
      unsubscribeRef.current = subscribe('ranked_match_found', ({ lobby_id, token }) => {
        stopListening();
        setStoredToken(lobby_id, token);
        getSocket().emit('join_room', { lobby_id, token });
        router.push(`/lobby/${lobby_id}`);
      });

      try {
        await joinRankedQueue(name);
      } catch (err) {
        stopListening();
        setStatus('idle');
        throw err;
      }
    },
    [router, stopListening]
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
