import type { GameEvent, WellRewardComponent } from '@/lib/gameEvents';
import { combatFromEvents, wellRewardFromEvents, glowForReward } from '@/lib/gameEvents';
import type { HpFxEvent } from '@/lib/resourceFx';
import { STRIKE_DUR, HOLD_DUR, RETREAT_DUR, BOUNCE_DUR } from '@/components/lobby/SwordEffect';
import { WELL_REWARD_FLIGHT_DUR, WELL_REWARD_SCALE, type WellRewardType } from '@/components/lobby/WellRewardEffect';
import { INSTAKILL_BURST_DURATION } from '@/components/lobby/InstakillBurstEffect';

export type StrikeEvent = {
  id: string;
  fromPos: [number, number, number];
  toPos:   [number, number, number];
  targetDefended: boolean;
  targetHit: boolean;
  isIncoming: boolean;
  // For incoming strikes with a known (non-anonymised) attacker: their name,
  // so the scene can glow their seat while this strike is live.
  attackerName?: string;
  // 'retreat' = normal hit, 'stop' = blocked no reflect, 'bounce' = blocked + reflected
  postImpact: 'retreat' | 'stop' | 'bounce';
  // World-space position to aura-flash on strike (undefined = no flash)
  flashPosition?: [number, number, number];
  // For bounce-back strikes: where to aura-flash when the bounce lands on the attacker
  bounceFlashPos?: [number, number, number];
  // For incoming strikes: HP-card feedback to emit at the impact moment.
  incomingFx?: HpFxEvent;
  // True when this strike's outcome was 'instakill'/'instakill_blocked' — adds
  // the instakill reward's green (kill) or blue (blocked) burst on top of the
  // normal hit/shield effects.
  instakill?: boolean;
};

export type HitFlashEvent = {
  id: string;
  position: [number, number, number];
  instakill?: boolean;
};

export type WellRewardEvent = {
  id: string;
  type: WellRewardType;
  fromPos: [number, number, number];
  toPos:   [number, number, number];
  delay:   number;
  /** Optional scale override (e.g. Hades' coin renders 3x the normal gold coin). */
  scale?: number;
  /** True for player-to-player flights (steal victim -> well winner, or kill
   *  loot victim -> killer). Both players sit on the seating circle around
   *  The Well at the table's center, so a straight line between two seats on
   *  opposite sides passes right by the well -- reading as "coins spouting
   *  out of the well" instead of coming from the actual player. Orbiting
   *  around the table (interpolating seat angle, not raw XZ) keeps the path
   *  out by the rim instead. Not used for the well's own rewards (gold,
   *  health, etc., or steal's well-fallback). those genuinely start at the
   *  well, so a straight line is correct for them. */
  orbit?: boolean;
};

// A fiery red glow that erupts under a character when a kill is made. Seen by the
// killer (under themselves), the witness and the victim (under the killer).
export type KillFireEvent = {
  id:  string;
  pos: [number, number, number];
};

// A single blue blink at the moment a block lands -- under whoever actually
// held the shield: the local player's own seat when they blocked an
// incoming attack, or the target's seat when the local player's own attack
// got blocked.
export type BlockGlowEvent = {
  id: string;
  pos: [number, number, number];
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
// Scaled to 0.8x for a modest speedup.
export const WELL_FX_DURATION = 1939;
// Stagger between successive reward instances (seconds). Scaled to 0.8x.
export const WELL_REWARD_STAGGER = 0.22;

// A steal source: one player's seat plus how many coins were stolen from them.
export type StealSource = { pos: [number, number, number]; count: number };

export type ImpactShield = {
  id:   string;
  pos:  [number, number, number];
  rotY: number;
  // True when the blocked attack was an instakill — adds the reward's blue
  // burst in front of the shield.
  instakill?: boolean;
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
      // Fall back to the well only if we somehow have no player sources --
      // that fallback genuinely starts at the well, so it's the one 'steal'
      // case that should NOT orbit (a straight line from the well is correct
      // there, same as every other well reward).
      const fromRealSources = stealSources.length > 0;
      const sources: StealSource[] = fromRealSources
        ? stealSources
        : [{ pos: WELL_SPOUT_POSITION, count: Math.max(1, reward.count) }];
      sources.forEach((src, si) => {
        const from: [number, number, number] = [src.pos[0], src.pos[1] + 0.3, src.pos[2]];
        const coins = Math.max(0, src.count); // broke players yield no coin
        for (let i = 0; i < coins; i++) {
          // Spread coins at their launch point so they don't perfectly
          // overlap leaving the source -- but converge on the same landing
          // spot, or a big steal reads as a scattered line beside the
          // winner instead of a pile landing on them.
          const jitter = coins > 1 ? (i - (coins - 1) / 2) * 0.15 : 0;
          events.push({
            id:   `well-steal-${stamp}-${si}-${i}`,
            type: 'steal',
            fromPos: [from[0] + jitter, from[1], from[2]],
            toPos:   land,
            delay:   seq++ * WELL_REWARD_STAGGER,
            orbit:   fromRealSources,
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

// Hades' coin: a giant golden coin (3x the well's normal gold coin) flies out
// of the boss and lands on every player who helped defeat him — "the award of
// Hades' coin". Mirrors the relic-award loop in engine/boss_ai.py's
// boss_defeated (surviving, non-bot players), triggered from LobbyScene's
// round-transition effect on the boss_fight -> gameover/winner="Players" edge.
export const HADES_COIN_SCALE = WELL_REWARD_SCALE.gold * 3;
// Slower than the normal well stagger — this is a one-off grand reward, not a
// flurry of small coins, so each landing should read individually. Scaled to
// 0.8x for a modest speedup.
const HADES_COIN_STAGGER = 0.36;
// Held back so it doesn't play on top of the killing blow's own kill-loot
// coins (see scheduleKillLoot above), which land around the same moment the
// boss's death triggers this. Scaled to 0.8x.
const HADES_COIN_START_DELAY = 1.82;

export function buildHadesCoinEvents(
  bossPos: [number, number, number],
  winnerPositions: [number, number, number][],
): WellRewardEvent[] {
  const stamp = Date.now();
  const from: [number, number, number] = [bossPos[0], bossPos[1] + 0.5, bossPos[2]];
  return winnerPositions.map((pos, i) => ({
    id:      `hades-coin-${stamp}-${i}`,
    type:    'gold',
    fromPos: from,
    toPos:   pos,
    delay:   HADES_COIN_START_DELAY + i * HADES_COIN_STAGGER,
    scale:   HADES_COIN_SCALE,
  }));
}

export type CombatAnimationAction =
  | { type: 'addStrike'; strike: StrikeEvent }
  | { type: 'addImpactShield'; shield: ImpactShield }
  | { type: 'removeImpactShield'; id: string }
  | { type: 'addKillFire'; event: KillFireEvent }
  | { type: 'markDead'; name: string }
  | { type: 'addWellRewardEvents'; events: WellRewardEvent[] }
  | { type: 'emitHpFx'; event: HpFxEvent }
  | { type: 'addWellWinFx'; fx: WellWinFx }
  | { type: 'removeWellWinFx'; id: string }
  | { type: 'addHitFlash'; event: HitFlashEvent }
  | { type: 'removeHitFlash'; id: string }
  | { type: 'addBlockGlow'; event: BlockGlowEvent }
  | { type: 'removeBlockGlow'; id: string }
  | { type: 'clearDefendShield' };

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
  /** True when the local player has a defend-preview shield up this round
   *  (LobbyScene's defendShieldActive) -- gates the clearDefendShield batch
   *  below, so rounds where they didn't choose defend get no extra batch at
   *  all rather than an always-present no-op entry. */
  iChoseDefend?: boolean;
}

/**
 * Maps one round's GameEvent[] (already fetched) into the flat, ordered list
 * of animation batches LobbyScene.tsx should apply -- game logic, not
 * rendering. Order matters: batches that touch the same array (e.g. multiple
 * addStrike) must be applied in the order returned here.
 */
export function buildCombatAnimationPlan(input: BuildCombatAnimationPlanInput): CombatAnimationBatch[] {
  const { events, playerName, posMap, myNowHp, wonWell, iChoseDefend } = input;
  const combat = combatFromEvents(events);
  const myPos = posMap.get(playerName);
  const iDied = myNowHp <= 0;

  const batches: CombatAnimationBatch[] = [];

  // ── Kill animation helpers ───────────────────────────────────────────────
  // A fiery red glow erupts under the killer (seen by killer, witness and
  // victim); the killer additionally sees the victim's coins fly over and
  // their ATK/coin cards tick up.
  const SWORD_IMPACT_MS = (STRIKE_DUR + HOLD_DUR) * 1000;
  // Block glow: peaks exactly on the hit, not a flat-on blink. Switched on
  // BLOCK_GLOW_LEAD_MS before impact and straight back off at impact --
  // SelectionGlow's own envelope (FADE_RATE) does the actual rise/fall, so
  // "on" for LEAD_MS before the hit means brightness is still climbing
  // toward the hit and starts decaying the instant it lands, landing the
  // visual peak on the hit itself rather than sometime after it.
  const BLOCK_GLOW_LEAD_MS = 150;
  // Tuned by eye against the live sword-swing animation -- the shield visibly
  // meets the blade a smidge before SWORD_IMPACT_MS itself.
  const BLOCK_GLOW_EARLY_MS = 100;
  // Full duration of one strike's animation, hit vs. defended (includes the
  // retreat/bounce tail) -- used both for the local player's outgoing strike
  // and for each incoming strike's stagger below.
  const ONE_HIT_MS = (STRIKE_DUR + HOLD_DUR + RETREAT_DUR) * 1000;
  const ONE_DEF_MS = (STRIKE_DUR + HOLD_DUR + BOUNCE_DUR)  * 1000;
  // Instakills layer a burst effect (see InstakillBurstEffect) on top of the
  // strike, kicked off at the same moment as the sword's onStrike (~STRIKE_DUR
  // in). Wait for it to finish before revealing the dead pose, so the model
  // doesn't tip over mid-burst.
  const INSTAKILL_DEATH_MS = STRIKE_DUR * 1000 + INSTAKILL_BURST_DURATION * 1000;
  const killDelayMs = (instakill: boolean) => (instakill ? Math.max(SWORD_IMPACT_MS, INSTAKILL_DEATH_MS) : SWORD_IMPACT_MS);
  // Coins land ~one travel-arc after launch (WellRewardEffect TRAVEL_DUR).
  // Scaled to 0.8x for a modest speedup.
  const KILL_LOOT_LAND_MS = 1030;
  const killStamp = Date.now();
  let killSeq = 0;

  // `victim`, when given, holds off that player's dead pose (model tip-over +
  // gray fade, see LobbyScene's deathPending) until this same moment, so they
  // don't flop over before the sword animation lands. `pos` is only used for
  // the kill-fire glow — when it's unknown (e.g. an anonymised attacker) the
  // dead pose still needs to be revealed, so that must not be gated on it.
  const scheduleKillFire = (pos: [number, number, number] | undefined, atMs: number, victim?: string) => {
    const actions: CombatAnimationAction[] = [];
    if (pos) {
      const id = `killfire-${killStamp}-${killSeq++}`;
      actions.push({ type: 'addKillFire', event: { id, pos } });
    }
    if (victim) actions.push({ type: 'markDead', name: victim });
    if (actions.length) batches.push({ delayMs: Math.max(0, atMs), actions });
  };

  // Blue block glow -- fired for either side of a block: under the
  // shield-holder's own seat when they blocked an incoming attack, or under
  // the target's seat when the local player's own attack got blocked.
  // `atMs` is the strike's start; impact (and so the glow's peak) lands
  // BLOCK_GLOW_EARLY_MS before SWORD_IMPACT_MS after that.
  const scheduleBlockGlow = (pos: [number, number, number], atMs: number) => {
    const id = `blockglow-${killStamp}-${killSeq++}`;
    const impactMs = atMs + SWORD_IMPACT_MS - BLOCK_GLOW_EARLY_MS;
    const onMs  = Math.max(0, impactMs - BLOCK_GLOW_LEAD_MS);
    const offMs = Math.max(0, impactMs);
    batches.push({ delayMs: onMs,  actions: [{ type: 'addBlockGlow', event: { id, pos } }] });
    batches.push({ delayMs: offMs, actions: [{ type: 'removeBlockGlow', id }] });
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
        // Spread coins at the victim's seat so they don't perfectly overlap
        // leaving, but converge on the killer's actual position -- else a
        // big kill (e.g. looting a coin-heavy Owl) reads as a scattered
        // line beside the killer instead of a pile landing on them.
        const jitter = coins > 1 ? (c - (coins - 1) / 2) * 0.15 : 0;
        evs.push({
          id:   `kill-coin-${killStamp}-${killSeq++}`,
          type: 'steal',
          fromPos: [from[0] + jitter, from[1], from[2]],
          toPos,
          orbit: true,
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

  // ── Well reward: only for the player who actually won the well ──────────
  // (steal *victims* also receive a "Steal-all!" line, so gate on wellwinner.)
  // Spawned first; the combat strikes below are delayed until it finishes so
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
      // Hold combat strikes until both the splash/glow and any reward
      // models have finished.
      wellDelayMs = Math.max(rewardDurMs, WELL_FX_DURATION);
    }
  }

  // ── Combat strikes: my own attack (outgoing) and attacks landing on me
  // (incoming), played in the order `events` lists them -- which mirrors the
  // round's message log -- rather than always playing my own attack first.
  // The backend appends outgoing/incoming events to each player's list as
  // it processes attackers in turn (engine/phases/attacks.py), so an attack
  // landing on me can genuinely be recorded before my own strike in the same
  // round; forcing "mine first" made that play back out of order.
  if (myPos) {
    const SHIELD_OFFSET = 0.8;
    const GAP_MS        = 242; // scaled to 0.8x for a modest speedup
    let staggerMs       = wellDelayMs;
    // ms into combat when my own first successful block starts, if any -- see
    // the clearDefendShield batch pushed after this loop.
    let firstBlockAtMs: number | null = null;

    // When several attackers land hits on me in the same round, only the last
    // one to visually connect should trigger my dead pose — otherwise it flops
    // over as soon as the first (possibly non-fatal-looking) blow's own timer
    // fires, before the later strikes in the stagger have even played.
    const isFatalHit = (inc: (typeof combat.incoming)[number]) =>
      (inc.outcome === 'hit' || inc.outcome === 'instakill');
    let lastFatalIdx = -1;
    if (iDied) {
      combat.incoming.forEach((inc, idx) => { if (isFatalHit(inc)) lastFatalIdx = idx; });
    }

    let incomingIdx = 0;
    for (const e of events) {
      if (e.kind === 'outgoing') {
        const tgtPos = posMap.get(e.target);
        if (!tgtPos) continue;

        const tgtDefended = e.outcome === 'blocked' || e.outcome === 'reflected' || e.outcome === 'instakill_blocked';
        const tgtHit      = e.outcome === 'hit' || e.outcome === 'instakill';
        const reflected   = e.outcome === 'reflected';
        const isInstakill = e.outcome === 'instakill' || e.outcome === 'instakill_blocked';

        const fromPos: [number, number, number]   = [myPos[0],  myPos[1]  + 0.3, myPos[2]];
        const baseToPos: [number, number, number] = [tgtPos[0], tgtPos[1] + 0.3, tgtPos[2]];

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
          instakill:      isInstakill,
        };
        const delay = staggerMs;
        batches.push({ delayMs: delay, actions: [{ type: 'addStrike', strike }] });
        staggerMs += tgtDefended ? ONE_DEF_MS : ONE_HIT_MS;

        // My attack got blocked -- blue blink under the target, who actually
        // held the shield.
        if (tgtDefended) scheduleBlockGlow(tgtPos, delay);

        // Kill! At the moment the blow lands: fiery glow under me (the killer,
        // symbolising my +1 ATK) and the victim's coins arch over to me.
        if (e.eliminated) {
          const atMs = delay + killDelayMs(isInstakill);
          scheduleKillFire(myPos, atMs, e.target);
          scheduleKillLoot(tgtPos, myPos, e.coinsReceived ?? 0, atMs);
        }
      } else if (e.kind === 'incoming') {
        const inc = combat.incoming[incomingIdx];
        const i = incomingIdx;
        incomingIdx += 1;

        const atkPos  = inc.attacker ? posMap.get(inc.attacker) : undefined;
        const fromPos: [number, number, number] = atkPos
          ? [atkPos[0], atkPos[1] + 0.3, atkPos[2]]
          : [myPos[0] + 0.9, myPos[1] + 0.3, myPos[2] + 0.9];
        const baseToPos: [number, number, number] = [myPos[0], myPos[1] + 0.3, myPos[2]];

        const isDefended   = inc.outcome === 'blocked' || inc.outcome === 'reflected_back' || inc.outcome === 'instakill_blocked';
        const atkReflected = inc.outcome === 'reflected_back';
        const isInstakill  = inc.outcome === 'instakill' || inc.outcome === 'instakill_blocked';
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
          attackerName:   atkPos ? (inc.attacker ?? undefined) : undefined,
          postImpact:     isDefended ? (atkReflected ? 'bounce' : 'stop') : 'retreat',
          flashPosition:  !isDefended         ? myPos  : undefined,
          bounceFlashPos: atkReflected && atkPos ? atkPos : undefined,
          incomingFx,
          instakill:      isInstakill,
        };

        const ONE_ANIM_MS = isDefended ? ONE_DEF_MS : ONE_HIT_MS;
        const delay        = staggerMs;
        staggerMs += ONE_ANIM_MS + GAP_MS;

        // Reflection kill: my shield bounced the attack back and finished the
        // attacker. I'm the killer — fiery glow under me + their coins fly over.
        if (atkReflected && inc.attackerDied && inc.coinsReceived != null && atkPos) {
          scheduleKillFire(myPos, delay + ONE_DEF_MS, inc.attacker ?? undefined);
          scheduleKillLoot(atkPos, myPos, inc.coinsReceived, delay + ONE_DEF_MS);
        }
        // I was killed this round: I see the fiery glow erupt under my killer
        // (no coins — those go to them, not me). Only the last fatal-looking
        // blow reveals my dead pose (see lastFatalIdx above); earlier attacks
        // in the same round still play out their own strike/flash normally,
        // they just don't flip me into the dead pose themselves.
        if (iDied && i === lastFatalIdx) {
          scheduleKillFire(atkPos, delay + killDelayMs(isInstakill), playerName);
        }

        const strikeActions: CombatAnimationAction[] = [{ type: 'addStrike', strike }];
        let shieldId: string | undefined;
        let shieldDur = 0;
        if (isDefended) {
          shieldId  = `def-shield-${strike.id}`;
          shieldDur = ONE_DEF_MS + 424; // scaled to 0.8x for a modest speedup
          const rotY = Math.atan2(fromPos[0] - baseToPos[0], fromPos[2] - baseToPos[2]);
          strikeActions.push({ type: 'addImpactShield', shield: { id: shieldId, pos: toPos, rotY, instakill: isInstakill } });
          if (firstBlockAtMs === null) firstBlockAtMs = delay;
        }
        batches.push({ delayMs: delay, actions: strikeActions });
        if (shieldId) {
          batches.push({ delayMs: delay + shieldDur, actions: [{ type: 'removeImpactShield', id: shieldId }] });
          // I blocked -- blue blink under my own seat. Scheduled after the
          // strike/shield/removal batches above (not merged into
          // strikeActions) so it doesn't shift their positions in the
          // returned plan. myPos is guaranteed here -- this whole `for`
          // loop only runs inside `if (myPos)` above.
          scheduleBlockGlow(myPos, delay);
        }
      }
    }

    // Successfully-blocked shields stay up for the rest of the round's
    // combat, not just their own strike's brief aftermath -- staggerMs has
    // now accumulated through every strike this player is involved in this
    // round (outgoing and incoming, in order), so by this point it holds
    // exactly "when the round's combat is fully done playing" from this
    // player's perspective. Only pushes shields *later*, never earlier --
    // a shield whose own strike is the last one in the round already has a
    // later or equal removal time and is left alone. Doesn't wait on
    // anything scheduled outside this loop (other players' well-reward
    // flights, etc.) -- just this player's own combat exchanges, which is
    // what "the shield stays up while the fight plays out" actually refers to.
    for (const batch of batches) {
      if (batch.actions.length === 1 && batch.actions[0].type === 'removeImpactShield') {
        batch.delayMs = Math.max(batch.delayMs, staggerMs);
      }
    }

    // Tell the scene when the local player's own defend-preview shield (see
    // PlayerAvatars' showShield / LobbyScene's defendShieldActive) should stop
    // showing. Gated on iChoseDefend so rounds where they weren't defending
    // get no extra batch at all. Immediately (0) if nothing attacked them
    // this round (nothing to hold it up for); right when their own first
    // successful block's world-space shield flourish takes over if they
    // blocked (so the preview and the block shield don't double up);
    // otherwise once their round's combat is fully done playing (staggerMs,
    // the same "fight's over" value the shield-persistence loop above uses)
    // -- covers "attacked but the block failed", where the shield should
    // keep standing through the rest of the round rather than vanish on a
    // failed block.
    if (iChoseDefend) {
      const anyIncoming = events.some((e) => e.kind === 'incoming');
      const defendShieldClearMs = !anyIncoming ? 0 : (firstBlockAtMs ?? staggerMs);
      batches.push({ delayMs: defendShieldClearMs, actions: [{ type: 'clearDefendShield' }] });
    }
  }

  // ── Witnessed eliminations ────────────────────────────────────────────────
  // The lone witness sees a fiery glow erupt under the killer and a red flash
  // on the victim — but no coins (those are the killer's alone).
  combat.witnessedEliminations.forEach((we, i) => {
    const victimPos = posMap.get(we.victim);
    const killerPos = posMap.get(we.attacker);
    const delay = wellDelayMs + SWORD_IMPACT_MS + i * 546; // stagger scaled to 0.8x
    if (victimPos) {
      const fid = `fl-${we.victim}-${Date.now()}`;
      batches.push({ delayMs: delay, actions: [{ type: 'addHitFlash', event: { id: fid, position: victimPos } }] });
      batches.push({ delayMs: delay + 788, actions: [{ type: 'removeHitFlash', id: fid }] }); // scaled to 0.8x
    }
    // markDead must fire even if the killer's own position is unknown — only
    // the glow itself needs killerPos, gated inside scheduleKillFire.
    scheduleKillFire(killerPos, delay, we.victim);
  });

  return batches;
}
