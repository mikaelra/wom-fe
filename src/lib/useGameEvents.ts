import { useEffect, useState } from 'react';
import { getPlayerMessages } from '@/lib/api';
import type { GameEvent } from '@/lib/gameEvents';

export interface GameEventsResult {
  /** The round this result was fetched for. */
  round: number;
  messages: (string | string[])[];
  events: GameEvent[];
  /** Whether the local player currently holds an active Poisoned Dagger charge. */
  instakill: boolean;
}

/**
 * Centralizes the per-round `getPlayerMessages` fetch that used to be
 * independently duplicated in SceneOverlay.tsx, useStagedResources.ts and
 * LobbyScene.tsx (one network call each, up to 3x per round). Fetches
 * whenever round or denyTarget changes -- the broadest of the 3 former
 * trigger conditions, so it's a superset covering every consumer's needs.
 *
 * Each consumer keeps its own gating/timing logic (e.g. only acting on a
 * round *increase*, or only when a Well was won) by comparing its own
 * round of interest against the returned result's `round`, instead of
 * firing its own fetch.
 */
export function useGameEvents(
  lobbyId: string,
  playerName: string,
  round: number | undefined,
  denyTarget: string | null | undefined
): GameEventsResult | null {
  const [result, setResult] = useState<GameEventsResult | null>(null);

  useEffect(() => {
    if (!lobbyId || !playerName || !round) return;
    let cancelled = false;

    getPlayerMessages(lobbyId, playerName).then((json) => {
      if (cancelled) return;
      setResult({ round, messages: json.messages, events: json.events, instakill: json.instakill });
    });

    return () => {
      cancelled = true;
    };
  }, [lobbyId, playerName, round, denyTarget]);

  return result;
}
