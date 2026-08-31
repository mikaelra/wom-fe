'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveRankedLobby } from '@/lib/api';
import { setStoredToken } from '@/lib/http';
import { useAuthFlow } from '@/lib/useAuthFlow';
import { useRankedQueue } from '@/lib/useRankedQueue';
import { useCountdown } from '@/lib/useCountdown';
import { useToast } from '@/components/Toast';

/**
 * Joining, watching and rejoining the ranked queue
 * (docs/CITY_SCENE_PLAN.md §5.2).
 *
 * Lifted out of `app/page.tsx`, where it hung off the New York sword, so the
 * city's Senate and signpost arm can own it. Behaviour is unchanged; only
 * where it is presented moved. It reports its own arm copy, because the
 * three states this can be in (idle / searching / already in a match) are
 * exactly what the arm has to say.
 */
export interface RankedEntry {
  /** Click the arm or the Senate. Queues, cancels, or returns to a match
   *  depending on which of the three states we are in. */
  enterRanked: () => void;
  status: 'idle' | 'searching' | 'activeMatch';
  /** Top line for the signpost arm. */
  label: string;
  /** Live second line, or null when there is nothing to say. */
  sublabel: string | null;
  gateOpen: boolean;
  closeGate: () => void;
  authFlow: ReturnType<typeof useAuthFlow>;
}

export function useEnterRanked(): RankedEntry {
  const router = useRouter();
  const { showError } = useToast();
  const [gateOpen, setGateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const rankedQueue = useRankedQueue();

  // A match this player is already in -- either matched and then navigated
  // away from (going "Back to Earth" only leaves the page, never the lobby
  // server-side; see wom-be's sockets/lobby.py handle_disconnect) or one
  // already in progress. Checked once per mount.
  const [activeMatch, setActiveMatch] = useState<{
    lobbyId: string;
    deadline: string | null;
    started: boolean;
  } | null>(null);
  const activeMatchSecondsLeft = useCountdown(activeMatch?.started ? null : activeMatch?.deadline);

  useEffect(() => {
    const name = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!name) return;
    getActiveRankedLobby(name)
      .then((data) => {
        if (!data.lobby_id || !data.token) return;
        setStoredToken(data.lobby_id, data.token);
        setActiveMatch({ lobbyId: data.lobby_id, deadline: data.ranked_countdown_deadline, started: data.started });
      })
      .catch(() => {
        // Best-effort -- worst case the player sees "RANKED" again, and the
        // backend's own duplicate-name guard still protects them if they
        // re-queue while actually still in the old match.
      });
  }, []);

  // Animated "" -> "." -> ".." -> "..." while queued, so "SEARCHING" reads
  // as active rather than stalled. Starts at 0 dots so the bare word is
  // actually one of the states shown.
  const [searchingDots, setSearchingDots] = useState(0);
  useEffect(() => {
    if (rankedQueue.status !== 'searching') return;
    const id = setInterval(() => setSearchingDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(id);
  }, [rankedQueue.status]);

  const doRanked = useCallback(async (name: string) => {
    setLoading(true);
    try {
      await rankedQueue.startQueue(name);
      if (typeof window !== 'undefined') localStorage.setItem('playerName', name);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to join the ranked queue');
    } finally {
      setLoading(false);
    }
  }, [rankedQueue, showError]);

  const authFlow = useAuthFlow({
    submitErrorFallback: 'Failed to join the ranked queue.',
    onAuthenticated: (name, email) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('playerName', name);
        if (email) localStorage.setItem('playerEmail', email);
      }
      setGateOpen(false);
      doRanked(name);
    },
  });
  const resetAuthFlow = authFlow.reset;

  const enterRanked = useCallback(() => {
    if (rankedQueue.status === 'searching') {
      rankedQueue.cancelQueue();
      return;
    }
    if (activeMatch) {
      router.push(`/lobby?id=${activeMatch.lobbyId}`);
      return;
    }
    if (loading) return;
    const name = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!name) {
      resetAuthFlow();
      setGateOpen(true);
      return;
    }
    doRanked(name);
  }, [rankedQueue, activeMatch, loading, router, doRanked, resetAuthFlow]);

  const status: RankedEntry['status'] =
    rankedQueue.status === 'searching' ? 'searching' : activeMatch ? 'activeMatch' : 'idle';

  let label = 'RANKED';
  let sublabel: string | null = null;
  if (status === 'searching') {
    sublabel = `SEARCHING${'.'.repeat(searchingDots)}`;
  } else if (status === 'activeMatch') {
    label = 'RETURN TO MATCH';
    sublabel = activeMatch?.started
      ? 'GAME STARTED!'
      : activeMatchSecondsLeft != null
        ? `STARTS IN ${activeMatchSecondsLeft}s`
        : 'STARTING SOON';
  }

  const closeGate = useCallback(() => setGateOpen(false), []);

  return { enterRanked, status, label, sublabel, gateOpen, closeGate, authFlow };
}
