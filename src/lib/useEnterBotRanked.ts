'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveBotRankedLobby } from '@/lib/api';
import { getStoredAccountToken, setStoredToken } from '@/lib/http';
import { useBotRankedQueue } from '@/lib/useBotRankedQueue';
import { useCountdown } from '@/lib/useCountdown';
import { useToast } from '@/components/Toast';

/**
 * Joining, watching and rejoining the bot-ranked queue -- the BOTS arm of
 * the fork signpost (docs/MY_AI.md §4). The sibling of useEnterRanked,
 * minus the auth-gate popup: bot-ranked is an account feature (it's your
 * AI's ladder), so a signed-out click is a plain "log in" toast rather
 * than a name-picker.
 */
export interface BotRankedEntry {
  /** Click the arm or the right Senate. Queues, cancels, or returns to a
   *  match depending on which state we're in. */
  enterBotRanked: () => void;
  status: 'idle' | 'searching' | 'activeMatch';
  /** Top line for the signpost arm. */
  label: string;
  /** Live second line, or null when there's nothing to say. */
  sublabel: string | null;
}

export function useEnterBotRanked(): BotRankedEntry {
  const router = useRouter();
  const { showError } = useToast();
  const [loading, setLoading] = useState(false);
  const botQueue = useBotRankedQueue();

  // A match this player is already in -- matched then navigated away from
  // ("Back to Earth" only leaves the page, never the lobby server-side),
  // or one already in progress. Checked once per mount.
  const [activeMatch, setActiveMatch] = useState<{
    lobbyId: string;
    deadline: string | null;
    started: boolean;
  } | null>(null);
  const activeMatchSecondsLeft = useCountdown(
    activeMatch?.started ? null : activeMatch?.deadline,
  );

  useEffect(() => {
    const token = getStoredAccountToken();
    if (!token) return;
    getActiveBotRankedLobby(token)
      .then((data) => {
        if (!data.lobby_id || !data.token) return;
        setStoredToken(data.lobby_id, data.token);
        setActiveMatch({
          lobbyId: data.lobby_id,
          deadline: data.ai_ranked_countdown_deadline,
          started: data.started,
        });
      })
      .catch(() => {
        // Best-effort -- worst case the arm reads "BOTS" again.
      });
  }, []);

  // Animated "" -> "." -> ".." -> "..." while queued.
  const [searchingDots, setSearchingDots] = useState(0);
  useEffect(() => {
    if (botQueue.status !== 'searching') return;
    const id = setInterval(() => setSearchingDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(id);
  }, [botQueue.status]);

  const doQueue = useCallback(
    async (name: string, token: string) => {
      setLoading(true);
      try {
        await botQueue.startQueue(name, token);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to join the bot-ranked queue');
      } finally {
        setLoading(false);
      }
    },
    [botQueue, showError],
  );

  const enterBotRanked = useCallback(() => {
    if (botQueue.status === 'searching') {
      botQueue.cancelQueue();
      return;
    }
    if (activeMatch) {
      router.push(`/lobby?id=${activeMatch.lobbyId}`);
      return;
    }
    if (loading) return;
    const token = getStoredAccountToken();
    if (!token) {
      showError('Log in with your account to enter bot-ranked.');
      return;
    }
    const name =
      typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!name) {
      showError('Set a battle name first (play a game or claim your name).');
      return;
    }
    doQueue(name, token);
  }, [botQueue, activeMatch, loading, router, doQueue, showError]);

  const status: BotRankedEntry['status'] =
    botQueue.status === 'searching' ? 'searching' : activeMatch ? 'activeMatch' : 'idle';

  let label = 'BOTS';
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

  return { enterBotRanked, status, label, sublabel };
}
