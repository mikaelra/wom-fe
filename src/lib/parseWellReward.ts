import type { WellRewardType } from '@/components/lobby/WellRewardEffect';

export interface WellRewardComponent {
  /** Which reward model to animate. */
  type: WellRewardType;
  /** How many model instances to spawn (e.g. +2 HP → 2 hearts). */
  count: number;
}

/**
 * Parse the well-winner's personal messages and return the reward(s) to
 * animate. The well only animates for the player who won it, so this is run on
 * that player's own `get_player_messages` payload.
 *
 * A single well result can grant several things at once (e.g. "2 💰 and 2 ❤"),
 * so this returns a list of components — one per model type to spawn.
 *
 * Backend message reference (winner's messages, see tjuvpakk-backend):
 *   2_gold        "📦 You got 2 💰!"
 *   2_hp          "🤕 You got 2 ❤!"
 *   1_hp_1_gold   "☘ You got 1 💰 and 1 ❤!"
 *   1_atkdmg      "🔫 You got +1 ⚔!"
 *   deny_choice   "🚫 Deny choice! 🚫"
 *   2_hp_2_gold   "♦ You got 2 💰 and 2 ❤!"
 *   steal_gold    "🏴‍☠️Steal-all!🏴‍☠️"  (+ per-victim "💸 You stole N 💰 from X.")
 *   instakill     "🔪 You found a poisoned dagger. ... 🔪"
 *   reveal_info   "🔍 You got info! 🔎"
 */
export function parseWellReward(messages: (string | string[])[]): WellRewardComponent[] {
  const lines = messages.flat();
  const out: WellRewardComponent[] = [];

  for (const line of lines) {
    // ── Special / single-instance rewards ──────────────────────────────────
    if (/Steal-all!/i.test(line)) {
      out.push({ type: 'steal', count: 1 });
      continue;
    }
    if (/poisoned dagger/i.test(line)) {
      out.push({ type: 'instakill', count: 1 });
      continue;
    }
    if (/Deny choice/i.test(line)) {
      out.push({ type: 'deny', count: 1 });
      continue;
    }
    if (/You got info/i.test(line)) {
      out.push({ type: 'info', count: 1 });
      continue;
    }

    // ── Resource rewards: "You got [+]N 💰 / N ❤ / +N ⚔" (possibly combined) ──
    if (/You got/i.test(line)) {
      const sword  = line.match(/\+?(\d+)\s*⚔/);
      const gold   = line.match(/(\d+)\s*💰/);
      const health = line.match(/(\d+)\s*❤/);
      if (sword)  out.push({ type: 'sword',  count: Math.max(1, parseInt(sword[1],  10)) });
      if (gold)   out.push({ type: 'gold',   count: Math.max(1, parseInt(gold[1],   10)) });
      if (health) out.push({ type: 'health', count: Math.max(1, parseInt(health[1], 10)) });
    }
  }

  return out;
}
