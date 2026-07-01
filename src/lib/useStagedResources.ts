import { useEffect, useRef, useState } from 'react';
import type { LobbyState } from '@/types/game';
import { getPlayerMessages } from '@/lib/api';
import { parseWellReward, type WellRewardComponent } from '@/lib/parseWellReward';
import { parseCombatMessages } from '@/lib/parseCombatMessages';
import { onHpFx } from '@/lib/resourceFx';

export interface Resources {
  hp: number;
  coins: number;
  attackDamage: number;
}

export interface StagedResources extends Resources {
  /** Animation kind for the latest HP value change. */
  hpAnim: 'bounce' | 'shake';
  /** Counter incremented on each blocked/reflected incoming attack. */
  hpBlockPulse: number;
}

// When the local player wins the Well, the reward is held back at round start
// and revealed ~this long later — lined up with the moment the 3D reward model
// lands on the player (WellRewardEffect.tsx TRAVEL_DUR = 0.85s).
const WELL_REVEAL_DELAY_MS = 850;

// Upper bound on one incoming strike's lifetime + gap, mirroring LobbyScene
// (ONE_DEF_MS 1050 + GAP_MS 200). Used only to size the safety-reconcile timer.
const PER_ATTACK_MAX_MS = 1250;
const RECONCILE_BUFFER_MS = 1500;

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
 * staging each per-round change as its own animated beat:
 *
 *   1. income/other  — a bounce at round start (Phase 1)
 *   2. Well reward    — a delayed tick-up, synced to the reward model landing (Phase 2)
 *   3. combat damage  — peeled one incoming attack at a time, each a red shake in
 *                       sync with its sword strike; blocks pulse the border blue (Phase 3)
 *
 * The Well win is known synchronously (state.raidwinner); the amounts come from
 * the player's messages (async). Combat impact *timing* is driven by the 3D
 * scene via the resourceFx bus (LobbyScene emits at each strike's impact), while
 * the amounts/baseline are computed here from the same messages.
 *
 * Combat staging only runs when `stageCombat` is set (the lobby/PvP path);
 * gremlin mode leaves it off and keeps the Phase 1/2 behaviour.
 *
 * Returns null when there is no local player (cards aren't rendered then).
 */
export function useStagedResources(
  state: LobbyState | null,
  playerName: string,
  lobbyId: string,
  options?: { stageCombat?: boolean },
): StagedResources | null {
  const stageCombat = options?.stageCombat ?? false;

  const me = state?.players.find((p) => p.name === playerName);
  const final: Resources | null = me
    ? { hp: me.hp, coins: me.coins, attackDamage: me.attackDamage }
    : null;

  // When non-null, the value to show instead of `final` (an in-progress stage).
  const [override, setOverride] = useState<Resources | null>(null);
  const [hpAnim, setHpAnim] = useState<'bounce' | 'shake'>('bounce');
  const [hpBlockPulse, setHpBlockPulse] = useState(0);

  const prevRoundRef = useRef(0);
  const lastFinalRef = useRef<Resources | null>(final);
  const prevFinalAtRoundRef = useRef<Resources | null>(null);
  // True only while combat-peel events should be applied (between the staged
  // baseline being set and the safety reconcile). Guards stale/late bus events.
  const combatActiveRef = useRef(false);

  // Render-phase: on a round transition, freeze the relevant cards so they don't
  // flash their final number before the staged reveal runs. HP is frozen at the
  // previous value whenever it will be staged (Well win or combat); coins/atk are
  // frozen at the previous value only on a Well win, otherwise shown immediately
  // so their income bounce stays snappy. (Calling setState during render, guarded
  // by a changed round, is the supported "adjust state on prop change" pattern.)
  if (state && final && state.round > prevRoundRef.current) {
    const prevRound = prevRoundRef.current;
    prevRoundRef.current = state.round;
    const prev = lastFinalRef.current;
    prevFinalAtRoundRef.current = prev;
    lastFinalRef.current = final;
    combatActiveRef.current = false;

    const wonWell = state.raidwinner === playerName;
    if (prevRound > 0 && prev && (wonWell || stageCombat)) {
      // Freeze every card at the previous value, then let the async pass below
      // reveal each gain as its own beat. Coins/ATK are held back too (not just
      // HP) so a kill's looted coins + the +1 ATK tick up when the kill lands
      // rather than appearing instantly at round start.
      setOverride({ hp: prev.hp, coins: prev.coins, attackDamage: prev.attackDamage });
      setHpAnim('bounce');
    } else {
      setOverride(null);
    }
  }

  // Async staged reveal: parse the round's messages and run the income → well →
  // (combat window opens) timeline. Combat decrements themselves arrive via the bus.
  useEffect(() => {
    if (!state || state.round <= 0) return;
    const p = state.players.find((x) => x.name === playerName);
    if (!p) return;
    const finalNow: Resources = { hp: p.hp, coins: p.coins, attackDamage: p.attackDamage };
    const wonWell = state.raidwinner === playerName;
    if (!wonWell && !stageCombat) return; // nothing to stage

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    getPlayerMessages(lobbyId, playerName)
      .then((json) => {
        if (cancelled) return;
        const msgs = json.messages ?? [];
        const wellDelta = wellStatDelta(parseWellReward(msgs));

        let combatLoss = 0;
        let hasKill = false;
        let incomingCount = 0;
        // Gains from kills *I* made this round: their coins + the +1 ATK. Held
        // back from the baseline and revealed when the kill lands (killgain bus
        // event from LobbyScene), so the cards tick up in sync with the 3D fx.
        let killCoins = 0;
        let killAtk = 0;
        if (stageCombat) {
          const combat = parseCombatMessages(msgs);
          incomingCount = combat.incoming.length;
          for (const inc of combat.incoming) {
            if (inc.outcome === 'hit') combatLoss += inc.damage ?? 1;
            else if (inc.outcome === 'instakill') hasKill = true;
            // Reflection kill: my shield finished the attacker → I gain coins + ATK.
            if (inc.attackerDied && inc.coinsReceived != null) {
              killCoins += inc.coinsReceived;
              killAtk += 1;
            }
          }
          if (combat.outgoing?.eliminated) {
            killCoins += combat.outgoing.coinsReceived ?? 0;
            killAtk += 1;
          }
        }

        // Baseline = pre-well, pre-combat values. For HP this is finalHp +
        // combatLoss − wellHp, which equals prevHp + income (so it bounces only
        // if income raised it, then gets peeled down by the attacks). An
        // instakill has no recoverable per-hit number, so fall back to the
        // previous HP and let the kill drop it to 0.
        const prev = prevFinalAtRoundRef.current;
        const baseline: Resources = {
          hp: hasKill ? prev?.hp ?? finalNow.hp : finalNow.hp + combatLoss - wellDelta.hp,
          coins: finalNow.coins - wellDelta.coins - killCoins,
          attackDamage: finalNow.attackDamage - wellDelta.attackDamage - killAtk,
        };
        setHpAnim('bounce');
        setOverride(baseline);
        combatActiveRef.current = stageCombat;

        const wellActive = wellDelta.hp !== 0 || wellDelta.coins !== 0 || wellDelta.attackDamage !== 0;
        if (wellActive) {
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              setHpAnim('bounce');
              setOverride({
                hp: baseline.hp + wellDelta.hp,
                coins: baseline.coins + wellDelta.coins,
                attackDamage: baseline.attackDamage + wellDelta.attackDamage,
              });
            }, WELL_REVEAL_DELAY_MS),
          );
        }

        // Safety net: snap to the real state after the combat window, covering
        // bus events missed while the 3D frame loop was paused (background tab).
        const reconcileMs =
          (wonWell ? WELL_REVEAL_DELAY_MS + 1000 : 0) +
          incomingCount * PER_ATTACK_MAX_MS +
          RECONCILE_BUFFER_MS;
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            combatActiveRef.current = false;
            setOverride(null);
          }, reconcileMs),
        );
      })
      .catch(() => {
        if (!cancelled) {
          combatActiveRef.current = false;
          setOverride(null);
        }
      });

    return () => {
      cancelled = true;
      combatActiveRef.current = false;
      timers.forEach(clearTimeout);
    };
    // Re-run once per round. Other deps are stable for the round's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.round, stageCombat]);

  // Apply per-attack combat feedback as the 3D strikes land (driven by the bus).
  useEffect(() => {
    return onHpFx((e) => {
      if (!combatActiveRef.current) return;
      if (e.kind === 'block') {
        setHpBlockPulse((n) => n + 1);
        return;
      }
      // A kill I made: tick the Coins + ATK cards up to reflect the loot/ATK gain.
      if (e.kind === 'killgain') {
        setOverride((o) =>
          o ? { ...o, coins: o.coins + e.coins, attackDamage: o.attackDamage + e.atk } : o,
        );
        return;
      }
      setHpAnim('shake');
      setOverride((o) =>
        o ? { ...o, hp: e.kind === 'kill' ? 0 : Math.max(0, o.hp - e.damage) } : o,
      );
    });
  }, []);

  if (!final) return null;
  const values = override ?? final;
  return { ...values, hpAnim, hpBlockPulse };
}
