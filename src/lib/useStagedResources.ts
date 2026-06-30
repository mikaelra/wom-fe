import { useEffect, useRef, useState } from 'react';
import type { LobbyState } from '@/types/game';
import { getPlayerMessages } from '@/lib/api';
import { parseWellReward, type WellRewardComponent } from '@/lib/parseWellReward';

export interface Resources {
  hp: number;
  coins: number;
  attackDamage: number;
}

// When the local player wins the Well, the reward is held back at round start
// and revealed ~this long later — lined up with the moment the 3D reward model
// lands on the player (WellRewardEffect.tsx TRAVEL_DUR = 0.85s).
const WELL_REVEAL_DELAY_MS = 850;

/** Sum a parsed well result into per-resource stat gains. */
function wellStatDelta(components: WellRewardComponent[]): Resources {
  const delta: Resources = { hp: 0, coins: 0, attackDamage: 0 };
  for (const c of components) {
    if (c.type === 'health') delta.hp += c.count;
    else if (c.type === 'gold') delta.coins += c.count;
    else if (c.type === 'sword') delta.attackDamage += c.count;
    else if (c.type === 'steal') {
      delta.coins += (c.victims ?? []).reduce((s, v) => s + v.amount, 0);
    }
    // instakill / deny / info grant no stat change.
  }
  return delta;
}

/**
 * Computes the resource values to *display* on the local player's stat cards,
 * staging the Well reward as its own delayed step.
 *
 * On a round where the local player won the Well, the affected card(s) are first
 * shown without the well reward (the income/other bounce at round start), then
 * tick up by the well amount ~WELL_REVEAL_DELAY_MS later — synced to the 3D
 * reward model landing on the player. Every other case returns the player's real
 * values immediately (Phase 1 behaviour, one bounce on any change).
 *
 * Returns null when there is no local player (cards aren't rendered then).
 */
export function useStagedResources(
  state: LobbyState | null,
  playerName: string,
  lobbyId: string,
): Resources | null {
  const me = state?.players.find((p) => p.name === playerName);
  const final: Resources | null = me
    ? { hp: me.hp, coins: me.coins, attackDamage: me.attackDamage }
    : null;

  // When non-null, the value to show instead of `final`.
  const [held, setHeld] = useState<Resources | null>(null);

  const prevRoundRef = useRef(state?.round ?? 0);
  const lastFinalRef = useRef<Resources | null>(final);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Render-phase: on a round transition where we won the Well, freeze the cards
  // at last round's values so they don't flash the final number before the
  // staged reveal runs. (Calling setState during render, guarded by a changed
  // value, is the supported "adjust state when a prop changes" React pattern.)
  if (state && state.round > prevRoundRef.current) {
    const prevRound = prevRoundRef.current;
    prevRoundRef.current = state.round;
    if (prevRound > 0 && state.raidwinner === playerName) {
      setHeld(lastFinalRef.current);
    } else {
      setHeld(null);
    }
  }

  // Keep the previous committed final values for the next freeze.
  useEffect(() => {
    lastFinalRef.current = final;
  });

  // Async staged reveal for a Well win: fetch the reward, show the pre-well
  // value (first bounce), then reveal the full total after the delay (tick-up).
  useEffect(() => {
    if (!state || !final || state.raidwinner !== playerName) return;

    let cancelled = false;
    getPlayerMessages(lobbyId, playerName)
      .then((json) => {
        if (cancelled) return;
        const delta = wellStatDelta(parseWellReward(json.messages ?? []));
        if (delta.hp === 0 && delta.coins === 0 && delta.attackDamage === 0) {
          setHeld(null); // No stat reward — reveal final now (Phase 1 behaviour).
          return;
        }
        setHeld({
          hp: final.hp - delta.hp,
          coins: final.coins - delta.coins,
          attackDamage: final.attackDamage - delta.attackDamage,
        });
        timerRef.current = setTimeout(() => setHeld(null), WELL_REVEAL_DELAY_MS);
      })
      .catch(() => {
        if (!cancelled) setHeld(null);
      });

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Re-run once per round. Other deps are stable for the round's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.round]);

  return held ?? final;
}
