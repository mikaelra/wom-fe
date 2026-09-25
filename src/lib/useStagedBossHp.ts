import { useEffect, useRef, useState } from 'react';
import { onBossHpFx } from '@/lib/bossHpFx';

// Upper bound on one strike's lifetime, safety-net only -- mirrors
// useStagedResources' PER_ATTACK_MAX_MS + RECONCILE_BUFFER_MS sizing.
// Normally the onStrike-driven emitBossHpFx (LobbyScene.tsx) reveals the
// real value well before this fires.
const RECONCILE_MS = 2500;

/**
 * Freezes the displayed boss HP at its previous value across a round where
 * it dropped, revealing the true (already-known) new value only once the
 * local player's own strike against the boss visually connects -- emitted
 * via bossHpFx.ts from LobbyScene.tsx's onStrike callback. Without this,
 * the raw value (state.players' boss entry) updates the instant
 * state_update arrives, well before the sword-swing animation reaches its
 * target (bug list 260916: "Hp from Hades goes down before the attack
 * animations have been played").
 *
 * Only ever freezes for a genuine drop -- a spectator, someone who didn't
 * attack the boss this round, or a round where nobody landed a hit sees the
 * live value immediately (there is nothing here to desync from).
 *
 * A round where this client's own strike missed/was blocked, or wasn't
 * against the boss, still freezes if the boss took damage from some other,
 * unseen attacker -- there is no local strike for that damage to sync to,
 * so the safety-reconcile timer is what clears it then, close enough to
 * instant that it isn't perceptible as a stall.
 */
export function useStagedBossHp(bossHp: number | undefined, round: number | undefined): number | undefined {
  const [override, setOverride] = useState<number | undefined>(undefined);
  const prevRoundRef = useRef(0);
  const lastBossHpRef = useRef<number | undefined>(bossHp);

  // Render-phase freeze, mirroring useStagedResources: on a round increase,
  // if the boss's hp dropped, hold the display at the previous value so it
  // doesn't flash the new (lower) number before the staged reveal runs.
  if (bossHp !== undefined && round !== undefined && round > prevRoundRef.current) {
    const prevRound = prevRoundRef.current;
    prevRoundRef.current = round;
    const prevHp = lastBossHpRef.current;
    lastBossHpRef.current = bossHp;
    if (prevRound > 0 && prevHp !== undefined && bossHp < prevHp) {
      setOverride(prevHp);
    } else {
      setOverride(undefined);
    }
  }

  useEffect(() => {
    if (override === undefined) return;
    const t = setTimeout(() => setOverride(undefined), RECONCILE_MS);
    return () => clearTimeout(t);
    // Deliberately keyed on `round` alone, reading `override` fresh from
    // this render's closure -- re-arms exactly when a new freeze starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  useEffect(() => {
    return onBossHpFx((e) => {
      if (e.hp === lastBossHpRef.current) setOverride(undefined);
    });
  }, []);

  return override ?? bossHp;
}
