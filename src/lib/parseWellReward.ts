import type { WellRewardType } from '@/components/lobby/WellRewardEffect';

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

/** Rarity glow colour under the well. null = common (no glow). */
export type WellGlow = 'blue' | 'purple' | 'gold';

/**
 * Rarity glow for a parsed well result, from the deck odds:
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
  const stealVictims: WellStealVictim[] = [];
  let steal = false;

  for (const line of lines) {
    // ── Steal-all! ─────────────────────────────────────────────────────────
    // Headline "🏴‍☠️Steal-all!🏴‍☠️" marks the reward; the winner also gets one
    // "💸 You stole N 💰 from <name>." line per victim — that's where the
    // per-player coin counts come from (victims see different lines, so only the
    // winner produces these).
    if (/Steal-all!/i.test(line)) {
      steal = true;
      continue;
    }
    const v = line.match(/You stole (\d+)\s*💰 from (.+)\.\s*$/);
    if (v) {
      steal = true;
      // A broke player yields 0 — no coin should fly from them.
      const amount = parseInt(v[1], 10);
      stealVictims.push({ name: v[2].trim(), amount: Number.isFinite(amount) ? amount : 0 });
      continue;
    }

    // ── Special / single-instance rewards ──────────────────────────────────
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

    // ── Resource rewards from the well ─────────────────────────────────────
    // The SAME resources (hp/gold/atk) can be gained from the resource buttons,
    // which must NOT trigger this animation. Well grants are distinguished by a
    // whimsical prefix emoji that the button gains don't use, so we anchor on
    // those prefixes rather than the generic "You got … 💰/❤/⚔" text:
    //   📦 2_gold · 🤕 2_hp · ☘ 1_hp_1_gold · 🔫 1_atkdmg · ♦ 2_hp_2_gold
    if (/[📦🤕☘🔫♦]/u.test(line)) {
      const sword  = line.match(/\+?(\d+)\s*⚔/);
      const gold   = line.match(/(\d+)\s*💰/);
      const health = line.match(/(\d+)\s*❤/);
      if (sword)  out.push({ type: 'sword',  count: Math.max(1, parseInt(sword[1],  10)) });
      if (gold)   out.push({ type: 'gold',   count: Math.max(1, parseInt(gold[1],   10)) });
      if (health) out.push({ type: 'health', count: Math.max(1, parseInt(health[1], 10)) });
    }
  }

  if (steal) out.unshift({ type: 'steal', count: 1, victims: stealVictims });

  return out;
}
