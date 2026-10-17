'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthFlow } from '@/lib/useAuthFlow';
import { useCountdown } from '@/lib/useCountdown';
import { useToast } from '@/components/Toast';
import { RETURN_TO_MATCH } from '@/lib/rankedSign';
import { rankedSignSublabel } from '@/lib/matchCloud';
import { useRankedQueueContext } from '@/components/match/RankedQueueProvider';

/**
 * Joining, watching and rejoining the ranked queue
 * (docs/CITY_SCENE_PLAN.md §5.2), as the city's signpost presents it.
 *
 * The queue itself is held for the whole app by RankedQueueProvider, so it
 * follows the player everywhere (Mikael, 2026-10-17); this is the signpost's
 * view of it. Three states: idle (RANKED), searching (SEARCHING...), and a
 * match found (RETURN TO MATCH, with the countdown over "X/6", or GAME
 * STARTED!) -- at the signpost Blimkin's cloud stays away and the sign says
 * it instead.
 */
export interface RankedEntry {
  /** Click the arm or the Senate. Queues, cancels, or goes to the match
   *  depending on which of the three states we are in. */
  enterRanked: () => void;
  status: 'idle' | 'searching' | 'activeMatch';
  /** Top line for the signpost arm. */
  label: string;
  /** Live line(s) under it, `\n`-joined, or null when there is nothing to say. */
  sublabel: string | null;
  gateOpen: boolean;
  closeGate: () => void;
  authFlow: ReturnType<typeof useAuthFlow>;
}

export function useEnterRanked(): RankedEntry {
  const { showError } = useToast();
  const [gateOpen, setGateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const rq = useRankedQueueContext();
  const match = rq.match;
  const secondsLeft = useCountdown(match && !match.started ? match.deadline : null);

  // Animated "" -> "." -> ".." -> "..." while queued, so "SEARCHING" reads
  // as active rather than stalled. Starts at 0 dots so the bare word is
  // actually one of the states shown.
  const [searchingDots, setSearchingDots] = useState(0);
  useEffect(() => {
    if (rq.status !== 'searching') return;
    const id = setInterval(() => setSearchingDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(id);
  }, [rq.status]);

  const doRanked = useCallback(
    async (name: string) => {
      setLoading(true);
      try {
        await rq.startQueue(name);
        if (typeof window !== 'undefined') localStorage.setItem('playerName', name);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to join the ranked queue');
      } finally {
        setLoading(false);
      }
    },
    [rq, showError],
  );

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
    if (rq.status === 'searching') {
      void rq.cancelQueue();
      return;
    }
    if (rq.match) {
      rq.joinMatch().catch((err) => showError(err instanceof Error ? err.message : 'Failed to join the match.'));
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
  }, [rq, loading, doRanked, resetAuthFlow, showError]);

  const status: RankedEntry['status'] = rq.status === 'searching' ? 'searching' : match ? 'activeMatch' : 'idle';

  let label = 'RANKED';
  let sublabel: string | null = null;
  if (status === 'searching') {
    sublabel = `SEARCHING${'.'.repeat(searchingDots)}`;
  } else if (match) {
    label = RETURN_TO_MATCH;
    sublabel = rankedSignSublabel(match, secondsLeft);
  }

  const closeGate = useCallback(() => setGateOpen(false), []);

  return { enterRanked, status, label, sublabel, gateOpen, closeGate, authFlow };
}
