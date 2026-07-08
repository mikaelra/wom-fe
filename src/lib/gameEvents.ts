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

export type OutgoingOutcome = 'hit' | 'blocked' | 'reflected' | 'instakill' | 'instakill_blocked';
export type IncomingOutcome = 'hit' | 'blocked' | 'reflected_back' | 'instakill' | 'instakill_blocked';

export interface OutgoingEvent {
  kind: 'outgoing';
  target: string;
  outcome: OutgoingOutcome;
  attackerDied: boolean;
  /** True when this attack eliminated the target and granted +1 ⚔ + their coins. */
  eliminated?: boolean;
  /** Coins received from the kill (the eliminated player's purse). */
  coinsReceived?: number;
}

export interface IncomingEvent {
  kind: 'incoming';
  attacker: string | null; // null = anonymous
  outcome: IncomingOutcome;
  attackerDied: boolean;
  damage?: number; // HP lost (only set for 'hit')
  /** Coins received when a reflected attack eliminated the attacker (kill by me). */
  coinsReceived?: number;
}

export interface WitnessEvent {
  kind: 'witness';
  attacker: string;
  victim: string;
}

/** For 'steal': how many coins were taken from a given player. */
export interface WellStealVictim {
  name: string;
  amount: number;
}

export interface WellRewardComponent {
  /** Which reward model to animate. */
  type: WellRewardType;
  /** How many model instances to spawn (e.g. +2 HP → 2 hearts). */
  count: number;
  /** For 'steal' only: per-player coin counts, so one coin flies from each
   *  player for every coin stolen from them. */
  victims?: WellStealVictim[];
}

export interface WellRewardGrantEvent {
  kind: 'well_reward';
  components: WellRewardComponent[];
}

export type GameEvent = OutgoingEvent | IncomingEvent | WitnessEvent | WellRewardGrantEvent;

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
