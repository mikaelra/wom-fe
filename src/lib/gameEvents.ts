import { z } from 'zod';
import type { WellRewardType } from '@/components/lobby/WellRewardEffect';

/**
 * Structured game events from the backend, delivered per player by
 * GET /get_player_messages (emitted in wom-be engine/phases/attacks.py and
 * engine/phases/well.py). These replace the old regex-parsing of the
 * human-readable message strings — the messages are display-only now.
 *
 * `attacker: null` means the backend anonymised the attack (deception
 * mechanic) — the client genuinely doesn't know who it was.
 */

export const OutgoingOutcomeSchema = z.enum(['hit', 'blocked', 'reflected', 'instakill', 'instakill_blocked']);
export type OutgoingOutcome = z.infer<typeof OutgoingOutcomeSchema>;

export const IncomingOutcomeSchema = z.enum(['hit', 'blocked', 'reflected_back', 'instakill', 'instakill_blocked']);
export type IncomingOutcome = z.infer<typeof IncomingOutcomeSchema>;

export const OutgoingEventSchema = z.object({
  kind: z.literal('outgoing'),
  target: z.string(),
  outcome: OutgoingOutcomeSchema,
  attackerDied: z.boolean(),
  /** True when this attack eliminated the target and granted +1 ⚔ + their coins. */
  eliminated: z.boolean().optional(),
  /** Coins received from the kill (the eliminated player's purse). */
  coinsReceived: z.number().optional(),
  /** HP taken from the target (only set for 'hit' -- mirrors IncomingEvent's
   *  own damage field, which is what the target itself sees). Drives the
   *  floating "-X" damage number over the target, so the attacker sees the
   *  same number their target does. */
  damage: z.number().optional(),
});
export type OutgoingEvent = z.infer<typeof OutgoingEventSchema>;

export const IncomingEventSchema = z.object({
  kind: z.literal('incoming'),
  attacker: z.string().nullable(), // null = anonymous
  outcome: IncomingOutcomeSchema,
  attackerDied: z.boolean(),
  damage: z.number().optional(), // HP lost (only set for 'hit')
  /** Coins received when a reflected attack eliminated the attacker (kill by me). */
  coinsReceived: z.number().optional(),
});
export type IncomingEvent = z.infer<typeof IncomingEventSchema>;

export const WitnessEventSchema = z.object({
  kind: z.literal('witness'),
  attacker: z.string(),
  victim: z.string(),
});
export type WitnessEvent = z.infer<typeof WitnessEventSchema>;

/** For 'steal': how many coins were taken from a given player. */
export const WellStealVictimSchema = z.object({
  name: z.string(),
  amount: z.number(),
});
export type WellStealVictim = z.infer<typeof WellStealVictimSchema>;

// Must stay in sync with WellRewardType (components/lobby/WellRewardEffect.tsx)
// -- the `satisfies` check below fails to compile if the two ever drift.
const WELL_REWARD_TYPES = ['gold', 'health', 'sword', 'instakill', 'deny', 'info', 'steal'] as const satisfies readonly WellRewardType[];

export const WellRewardComponentSchema = z.object({
  /** Which reward model to animate. */
  type: z.enum(WELL_REWARD_TYPES),
  /** How many model instances to spawn (e.g. +2 HP → 2 hearts). */
  count: z.number(),
  /** For 'steal' only: per-player coin counts, so one coin flies from each
   *  player for every coin stolen from them. */
  victims: z.array(WellStealVictimSchema).optional(),
});
export type WellRewardComponent = z.infer<typeof WellRewardComponentSchema>;

export const WellRewardGrantEventSchema = z.object({
  kind: z.literal('well_reward'),
  components: z.array(WellRewardComponentSchema),
});
export type WellRewardGrantEvent = z.infer<typeof WellRewardGrantEventSchema>;

export const GameEventSchema = z.union([
  OutgoingEventSchema,
  IncomingEventSchema,
  WitnessEventSchema,
  WellRewardGrantEventSchema,
]);
export type GameEvent = z.infer<typeof GameEventSchema>;

// ── Views over one round's events ───────────────────────────────────────────

export type OutgoingCombat = Omit<OutgoingEvent, 'kind'>;
export type IncomingCombat = Omit<IncomingEvent, 'kind'>;

export interface ParsedCombat {
  outgoing?: OutgoingCombat;
  incoming: IncomingCombat[];
  witnessedEliminations: Array<{ attacker: string; victim: string }>;
}

/** Group a round's events into the combat view the animations consume. */
export function combatFromEvents(events: GameEvent[] | null | undefined): ParsedCombat {
  const result: ParsedCombat = { incoming: [], witnessedEliminations: [] };
  for (const e of events ?? []) {
    if (e.kind === 'outgoing') {
      result.outgoing = {
        target: e.target,
        outcome: e.outcome,
        attackerDied: e.attackerDied,
        eliminated: e.eliminated,
        coinsReceived: e.coinsReceived,
        damage: e.damage,
      };
    } else if (e.kind === 'incoming') {
      result.incoming.push({
        attacker: e.attacker,
        outcome: e.outcome,
        attackerDied: e.attackerDied,
        damage: e.damage,
        coinsReceived: e.coinsReceived,
      });
    } else if (e.kind === 'witness') {
      result.witnessedEliminations.push({ attacker: e.attacker, victim: e.victim });
    }
  }
  return result;
}

/** The Well reward granted this round (empty when the player didn't win it). */
export function wellRewardFromEvents(events: GameEvent[] | null | undefined): WellRewardComponent[] {
  for (const e of events ?? []) {
    if (e.kind === 'well_reward') return e.components;
  }
  return [];
}

// ── Rarity glow ──────────────────────────────────────────────────────────────

/** Rarity glow colour under the well. null = common (no glow). */
export type WellGlow = 'blue' | 'purple' | 'gold';

/**
 * Rarity glow for a well result, from the deck odds:
 *   rarity 5 → no glow   2_gold · 2_hp · 1_hp_1_gold · reveal_info
 *   rarity 3 → blue      1_atkdmg · deny_choice · 2_hp_2_gold
 *   rarity 2 → purple    steal_gold
 *   rarity 1 → gold      instakill
 * The 1_hp_1_gold (rarity 5) vs 2_hp_2_gold (rarity 3) pair share component
 * types, so they're told apart by their counts (1+1 vs 2+2).
 */
export function glowForReward(components: WellRewardComponent[]): WellGlow | null {
  const has = (t: WellRewardType) => components.some((c) => c.type === t);
  if (has('steal'))     return 'purple';
  if (has('instakill')) return 'gold';
  if (has('deny'))      return 'blue';   // deny_choice
  if (has('sword'))     return 'blue';   // 1_atkdmg
  const gold   = components.find((c) => c.type === 'gold');
  const health = components.find((c) => c.type === 'health');
  if (gold && health && gold.count >= 2 && health.count >= 2) return 'blue'; // 2_hp_2_gold
  return null; // 2_gold · 2_hp · 1_hp_1_gold · reveal_info
}
