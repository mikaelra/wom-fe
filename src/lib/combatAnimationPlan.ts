import type { GameEvent, WellRewardComponent } from '@/lib/gameEvents';
import { combatFromEvents, wellRewardFromEvents, glowForReward } from '@/lib/gameEvents';
import type { HpFxEvent } from '@/lib/resourceFx';
import { STRIKE_DUR, HOLD_DUR, RETREAT_DUR, BOUNCE_DUR } from '@/components/lobby/SwordEffect';
import { WELL_REWARD_FLIGHT_DUR, type WellRewardType } from '@/components/lobby/WellRewardEffect';

export type StrikeEvent = {
  id: string;
  fromPos: [number, number, number];
  toPos:   [number, number, number];
  targetDefended: boolean;
  targetHit: boolean;
  isIncoming: boolean;
  // 'retreat' = normal hit, 'stop' = blocked no reflect, 'bounce' = blocked + reflected
  postImpact: 'retreat' | 'stop' | 'bounce';
  // World-space position to aura-flash on strike (undefined = no flash)
  flashPosition?: [number, number, number];
  // For bounce-back strikes: where to aura-flash when the bounce lands on the attacker
  bounceFlashPos?: [number, number, number];
  // For incoming strikes: HP-card feedback to emit at the impact moment.
  incomingFx?: HpFxEvent;
};

export type HitFlashEvent = {
  id: string;
  position: [number, number, number];
};

export type WellRewardEvent = {
  id: string;
  type: WellRewardType;
  fromPos: [number, number, number];
  toPos:   [number, number, number];
  delay:   number;
};

// A fiery red glow that erupts under a character when a kill is made. Seen by the
// killer (under themselves), the witness and the victim (under the killer).
export type KillFireEvent = {
  id:  string;
  pos: [number, number, number];
};

// Text shown to the lone witness of a kill, naming the killer in a fiery style.
export type KillBanner = {
  id:     string;
  killer: string;
  pos:    [number, number, number];
};

// Splash + glow that play on the well. A win shows a splash plus the rarity
// glow (or none for common rewards); choosing the well but losing shows just a
// small red glow.
export type WellWinFx = {
  id: string;
  splash: boolean;
  glow: 'blue' | 'purple' | 'gold' | 'red' | null;
  glowRadius?: number;
  glowIntensity?: number;
  glowStartMs?: number; // performance.now() at spawn — drives the persistent light
};
// Size + brightness of the small red "you chose the well but lost" glow.
export const WELL_LOSS_GLOW_RADIUS = 0.9;
export const WELL_LOSS_GLOW_INTENSITY = 0.33;

// Where rewards spout out of the well (center of the table, just above the rim).
export const WELL_SPOUT_POSITION: [number, number, number] = [0, 2.4, 0];
// Lifetime of the splash/glow before removal (ms) — also how long incoming
// attacks wait when a win has no flying reward models (e.g. a 0-coin steal).
export const WELL_FX_DURATION = 1600;
// Stagger between successive reward instances (seconds).
export const WELL_REWARD_STAGGER = 0.18;

// A steal source: one player's seat plus how many coins were stolen from them.
export type StealSource = { pos: [number, number, number]; count: number };

export type ImpactShield = {
  id:   string;
  pos:  [number, number, number];
  rotY: number;
};

// Build the per-instance reward animations for a won well result. A result can
// contain several components (e.g. 2 gold + 2 hp), each spawning `count` models.
//  - simple rewards: models arch from the well onto the winner.
//  - 'steal': one coin flies from each player to the winner, one per coin stolen.
export function buildWellRewardEvents(
  components: WellRewardComponent[],
  winnerPos: [number, number, number],
  stealSources: StealSource[],
): WellRewardEvent[] {
  const land: [number, number, number] = [winnerPos[0], winnerPos[1], winnerPos[2]];
  const stamp = Date.now();
  const events: WellRewardEvent[] = [];
  let seq = 0; // running index so every instance staggers off the same clock

  for (const reward of components) {
    if (reward.type === 'steal') {
      // Fall back to the well only if we somehow have no player sources.
      const sources: StealSource[] = stealSources.length
        ? stealSources
        : [{ pos: WELL_SPOUT_POSITION, count: Math.max(1, reward.count) }];
      sources.forEach((src, si) => {
        const from: [number, number, number] = [src.pos[0], src.pos[1] + 0.3, src.pos[2]];
        const coins = Math.max(0, src.count); // broke players yield no coin
        for (let i = 0; i < coins; i++) {
          // Spread coins from the same player so they don't perfectly overlap.
          const jitter = coins > 1 ? (i - (coins - 1) / 2) * 0.15 : 0;
          events.push({
            id:   `well-steal-${stamp}-${si}-${i}`,
            type: 'steal',
            fromPos: [from[0] + jitter, from[1], from[2]],
            toPos:   [land[0] + jitter, land[1], land[2]],
            delay:   seq++ * WELL_REWARD_STAGGER,
          });
        }
      });
      continue;
    }

    const n = Math.max(1, reward.count);
    for (let i = 0; i < n; i++) {
      // Spread multiples slightly so they don't perfectly overlap on landing.
      const jitter = n > 1 ? (i - (n - 1) / 2) * 0.18 : 0;
      events.push({
        id:   `well-${reward.type}-${stamp}-${i}`,
        type: reward.type,
        fromPos: WELL_SPOUT_POSITION,
        toPos:   [land[0] + jitter, land[1], land[2] + jitter],
        delay:   seq++ * WELL_REWARD_STAGGER,
      });
    }
  }

  return events;
}

export type CombatAnimationAction =
  | { type: 'addStrike'; strike: StrikeEvent }
  | { type: 'addImpactShield'; shield: ImpactShield }
  | { type: 'removeImpactShield'; id: string }
  | { type: 'addKillFire'; event: KillFireEvent }
  | { type: 'markDead'; name: string }
  | { type: 'addKillBanner'; banner: KillBanner }
  | { type: 'removeKillBanner'; id: string }
  | { type: 'addWellRewardEvents'; events: WellRewardEvent[] }
  | { type: 'emitHpFx'; event: HpFxEvent }
  | { type: 'addWellWinFx'; fx: WellWinFx }
  | { type: 'removeWellWinFx'; id: string }
  | { type: 'addHitFlash'; event: HitFlashEvent }
  | { type: 'removeHitFlash'; id: string };

export interface CombatAnimationBatch {
  /** Absolute ms from "now" (the round-processing moment). 0 = apply synchronously,
   *  no setTimeout -- matches the original effect's immediate (non-deferred) sets. */
  delayMs: number;
  /** All actions in a batch fire in the same callback tick -- only used for
   *  groupings the original code bundled into one setTimeout; independently
   *  timed siblings get their own batches instead. */
  actions: CombatAnimationAction[];
}

export interface BuildCombatAnimationPlanInput {
  events: GameEvent[];
  playerName: string;
  posMap: Map<string, [number, number, number]>;
  /** The local player's current HP, post-round (used to detect if they died). */
  myNowHp: number;
  /** state.wellwinner === playerName */
  wonWell: boolean;
}

/**
 * Maps one round's GameEvent[] (already fetched) into the flat, ordered list
 * of animation batches LobbyScene.tsx should apply -- game logic, not
 * rendering. Order matters: batches that touch the same array (e.g. multiple
 * addStrike) must be applied in the order returned here.
 */
export function buildCombatAnimationPlan(input: BuildCombatAnimationPlanInput): CombatAnimationBatch[] {
  const { events, playerName, posMap, myNowHp, wonWell } = input;
  const combat = combatFromEvents(events);
  const myPos = posMap.get(playerName);
  const iDied = myNowHp <= 0;

  const batches: CombatAnimationBatch[] = [];

  // ── Kill animation helpers ───────────────────────────────────────────────
  // A fiery red glow erupts under the killer (seen by killer, witness and
  // victim); the killer additionally sees the victim's coins fly over and
  // their ATK/coin cards tick up.
  const SWORD_IMPACT_MS = (STRIKE_DUR + HOLD_DUR) * 1000;
  // Coins land ~one travel-arc after launch (WellRewardEffect TRAVEL_DUR).
  const KILL_LOOT_LAND_MS = 850;
  const killStamp = Date.now();
  let killSeq = 0;

  // `victim`, when given, holds off that player's dead pose (model tip-over +
  // gray fade, see LobbyScene's deathPending) until this same moment, so they
  // don't flop over before the sword animation lands.
  const scheduleKillFire = (pos: [number, number, number], atMs: number, victim?: string) => {
    const id = `killfire-${killStamp}-${killSeq++}`;
    const actions: CombatAnimationAction[] = [{ type: 'addKillFire', event: { id, pos } }];
    if (victim) actions.push({ type: 'markDead', name: victim });
    batches.push({ delayMs: Math.max(0, atMs), actions });
  };

  const scheduleKillBanner = (killer: string, pos: [number, number, number], atMs: number) => {
    const id = `killbanner-${killStamp}-${killSeq++}`;
    const delayMs = Math.max(0, atMs);
    batches.push({ delayMs, actions: [{ type: 'addKillBanner', banner: { id, killer, pos } }] });
    batches.push({ delayMs: delayMs + 2600, actions: [{ type: 'removeKillBanner', id }] });
  };

  // Killer only: fling the victim's coins over and tick up the ATK/coin cards.
  const scheduleKillLoot = (
    fromPos: [number, number, number],
    toPos: [number, number, number],
    coins: number,
    atMs: number,
  ) => {
    const delayMs = Math.max(0, atMs);
    if (coins > 0) {
      const from: [number, number, number] = [fromPos[0], fromPos[1] + 0.3, fromPos[2]];
      const evs: WellRewardEvent[] = [];
      for (let c = 0; c < coins; c++) {
        const jitter = coins > 1 ? (c - (coins - 1) / 2) * 0.15 : 0;
        evs.push({
          id:   `kill-coin-${killStamp}-${killSeq++}`,
          type: 'steal',
          fromPos: [from[0] + jitter, from[1], from[2]],
          toPos:   [toPos[0] + jitter, toPos[1], toPos[2]],
          delay:   c * WELL_REWARD_STAGGER,
        });
      }
      batches.push({ delayMs, actions: [{ type: 'addWellRewardEvents', events: evs }] });
    }
    // Reveal the gained coins (+ the +1 ATK) on the resource cards once the
    // coins have arrived — staged like the Well reward (see useStagedResources).
    batches.push({
      delayMs: delayMs + KILL_LOOT_LAND_MS,
      actions: [{ type: 'emitHpFx', event: { kind: 'killgain', coins, atk: 1 } }],
    });
  };

  // ── Outgoing: local player attacked someone ──────────────────────────────
  if (combat.outgoing) {
    const { target, outcome } = combat.outgoing;
    const tgtPos = posMap.get(target);
    if (myPos && tgtPos) {
      const tgtDefended = outcome === 'blocked' || outcome === 'reflected' || outcome === 'instakill_blocked';
      const tgtHit      = outcome === 'hit' || outcome === 'instakill';
      const reflected   = outcome === 'reflected';

      const fromPos: [number, number, number]    = [myPos[0],  myPos[1]  + 0.3, myPos[2]];
      const baseToPos: [number, number, number]  = [tgtPos[0], tgtPos[1] + 0.3, tgtPos[2]];

      const SHIELD_OFFSET = 0.8;
      let toPos = baseToPos;
      if (tgtDefended) {
        const dx = fromPos[0] - baseToPos[0];
        const dz = fromPos[2] - baseToPos[2];
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0) {
          toPos = [baseToPos[0] + (dx / len) * SHIELD_OFFSET, baseToPos[1], baseToPos[2] + (dz / len) * SHIELD_OFFSET];
        }
      }

      const strike: StrikeEvent = {
        id: `out-${Date.now()}`, fromPos, toPos,
        targetDefended: tgtDefended, targetHit: tgtHit, isIncoming: false,
        postImpact:     tgtDefended ? (reflected ? 'bounce' : 'stop') : 'retreat',
        flashPosition:  tgtHit    ? tgtPos : undefined,
        bounceFlashPos: reflected ? myPos  : undefined,
      };
      batches.push({ delayMs: 0, actions: [{ type: 'addStrike', strike }] });

      // Kill! At the moment the blow lands: fiery glow under me (the killer,
      // symbolising my +1 ATK) and the victim's coins arch over to me.
      if (combat.outgoing.eliminated) {
        scheduleKillFire(myPos, SWORD_IMPACT_MS, target);
        scheduleKillLoot(tgtPos, myPos, combat.outgoing.coinsReceived ?? 0, SWORD_IMPACT_MS);
      }
    }
  }

  // ── Well reward: only for the player who actually won the well ──────────
  // (steal *victims* also receive a "Steal-all!" line, so gate on wellwinner.)
  // Spawned first; incoming attacks below are delayed until it finishes so
  // the two don't play at once and confuse the player.
  let wellDelayMs = 0;
  if (myPos && wonWell) {
    const components = wellRewardFromEvents(events);
    if (components.length) {
      // Splash + rarity glow on the well itself.
      const fxId = `wellfx-${Date.now()}`;
      const fx: WellWinFx = { id: fxId, splash: true, glow: glowForReward(components), glowStartMs: performance.now() };
      batches.push({ delayMs: 0, actions: [{ type: 'addWellWinFx', fx }] });
      batches.push({ delayMs: WELL_FX_DURATION, actions: [{ type: 'removeWellWinFx', id: fxId }] });

      // For steal: one coin per stolen coin, flying from each victim's seat.
      const stealVictims = components.find((c) => c.type === 'steal')?.victims ?? [];
      const stealSources = stealVictims
        .map((v) => ({ pos: posMap.get(v.name), count: v.amount }))
        .filter((s): s is { pos: [number, number, number]; count: number } => !!s.pos);
      const rewardEvents = buildWellRewardEvents(components, myPos, stealSources);
      const rewardDurMs = rewardEvents.length
        ? (Math.max(...rewardEvents.map((e) => e.delay)) + WELL_REWARD_FLIGHT_DUR) * 1000
        : 0;
      if (rewardEvents.length) batches.push({ delayMs: 0, actions: [{ type: 'addWellRewardEvents', events: rewardEvents }] });
      // Hold incoming attacks until both the splash/glow and any reward
      // models have finished.
      wellDelayMs = Math.max(rewardDurMs, WELL_FX_DURATION);
    }
  }

  // ── Incoming: local player was attacked ──────────────────────────────────
  if (myPos && combat.incoming.length > 0) {
    const SHIELD_OFFSET = 0.8;
    const ONE_DEF_MS    = (STRIKE_DUR + HOLD_DUR + BOUNCE_DUR)  * 1000;
    const ONE_HIT_MS    = (STRIKE_DUR + HOLD_DUR + RETREAT_DUR) * 1000;
    const GAP_MS        = 200;
    // Start after the well animation so incoming swords don't overlap it.
    let staggerMs       = wellDelayMs;

    combat.incoming.forEach((inc, i) => {
      const atkPos  = inc.attacker ? posMap.get(inc.attacker) : undefined;
      const fromPos: [number, number, number] = atkPos
        ? [atkPos[0], atkPos[1] + 0.3, atkPos[2]]
        : [myPos[0] + 0.9, myPos[1] + 0.3, myPos[2] + 0.9];
      const baseToPos: [number, number, number] = [myPos[0], myPos[1] + 0.3, myPos[2]];

      const isDefended   = inc.outcome === 'blocked' || inc.outcome === 'reflected_back' || inc.outcome === 'instakill_blocked';
      const atkReflected = inc.outcome === 'reflected_back';
      const incomingFx: HpFxEvent = isDefended
        ? { kind: 'block' }
        : inc.outcome === 'instakill'
          ? { kind: 'kill' }
          : { kind: 'hit', damage: inc.damage ?? 1 };

      let toPos = baseToPos;
      if (isDefended) {
        const dx = fromPos[0] - baseToPos[0];
        const dz = fromPos[2] - baseToPos[2];
        const ld = Math.sqrt(dx * dx + dz * dz);
        if (ld > 0) {
          toPos = [baseToPos[0] + (dx / ld) * SHIELD_OFFSET, baseToPos[1], baseToPos[2] + (dz / ld) * SHIELD_OFFSET];
        }
      }

      const strike: StrikeEvent = {
        id:             `in-${inc.attacker ?? 'anon'}-${Date.now()}-${i}`,
        fromPos, toPos,
        targetDefended: isDefended,
        targetHit:      !isDefended,
        isIncoming:     true,
        postImpact:     isDefended ? (atkReflected ? 'bounce' : 'stop') : 'retreat',
        flashPosition:  !isDefended         ? myPos  : undefined,
        bounceFlashPos: atkReflected && atkPos ? atkPos : undefined,
        incomingFx,
      };

      const ONE_ANIM_MS = isDefended ? ONE_DEF_MS : ONE_HIT_MS;
      const delay       = staggerMs;
      staggerMs += ONE_ANIM_MS + GAP_MS;

      // Reflection kill: my shield bounced the attack back and finished the
      // attacker. I'm the killer — fiery glow under me + their coins fly over.
      if (atkReflected && inc.attackerDied && inc.coinsReceived != null && atkPos) {
        scheduleKillFire(myPos, delay + ONE_DEF_MS, inc.attacker ?? undefined);
        scheduleKillLoot(atkPos, myPos, inc.coinsReceived, delay + ONE_DEF_MS);
      }
      // I was killed by this blow: I see the fiery glow erupt under my killer
      // (no coins — those go to them, not me).
      if (iDied && !isDefended && atkPos && (inc.outcome === 'hit' || inc.outcome === 'instakill')) {
        scheduleKillFire(atkPos, delay + SWORD_IMPACT_MS, playerName);
      }

      const strikeActions: CombatAnimationAction[] = [{ type: 'addStrike', strike }];
      let shieldId: string | undefined;
      let shieldDur = 0;
      if (isDefended) {
        shieldId  = `def-shield-${strike.id}`;
        shieldDur = ONE_DEF_MS + 350;
        const rotY = Math.atan2(fromPos[0] - baseToPos[0], fromPos[2] - baseToPos[2]);
        strikeActions.push({ type: 'addImpactShield', shield: { id: shieldId, pos: toPos, rotY } });
      }
      batches.push({ delayMs: delay, actions: strikeActions });
      if (shieldId) {
        batches.push({ delayMs: delay + shieldDur, actions: [{ type: 'removeImpactShield', id: shieldId }] });
      }
    });
  }

  // ── Witnessed eliminations ────────────────────────────────────────────────
  // The lone witness sees a fiery glow erupt under the killer plus a banner
  // naming them, and a red flash on the victim — but no coins (those are the
  // killer's alone).
  combat.witnessedEliminations.forEach((we, i) => {
    const victimPos = posMap.get(we.victim);
    const killerPos = posMap.get(we.attacker);
    const delay = wellDelayMs + SWORD_IMPACT_MS + i * 450;
    if (victimPos) {
      const fid = `fl-${we.victim}-${Date.now()}`;
      batches.push({ delayMs: delay, actions: [{ type: 'addHitFlash', event: { id: fid, position: victimPos } }] });
      batches.push({ delayMs: delay + 650, actions: [{ type: 'removeHitFlash', id: fid }] });
    }
    if (killerPos) {
      scheduleKillFire(killerPos, delay, we.victim);
      scheduleKillBanner(we.attacker, killerPos, delay);
    }
  });

  return batches;
}
