import type { Player } from '@/types/game';

// Common skins — each is claimed exclusively by one player per lobby
export const COMMON_SKINS = [
  'frog_green_v1',
  'frog_blue_v1',
  'frog_orange_cursed_v1',
  'frog_pink_v1',
  'frog_purple_v1',
  'frog_red_v1',
  'frog_yellow_v1',
] as const;

// Rare skins ordered from least rare (index 0) to most rare (index 3)
// Each can only be held by one player in a lobby at a time
export const RARE_SKINS = [
  'frog_silver_v1',
  'frog_gold_v1',
  'frog_rainbow_v2',
  'frog_bling_v1',
] as const;

export const ALL_FROG_SKINS = [...COMMON_SKINS, ...RARE_SKINS] as const;

export function skinUrl(skinName: string): string {
  return `/models/frogs/${skinName}.glb`;
}

// FNV-1a 32-bit hash → float [0, 1)
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h / 0x100000000;
}

// Determine which rare tier a player "rolled" on join.
// Seeded from playerName + lobbyId so the result varies per lobby.
// Returns -1 for common, 0 = silver, 1 = gold, 2 = rainbow, 3 = bling.
//
// Drop rates (single roll, mutually exclusive):
//   1/100 → bling
//   1/20  → rainbow
//   1/10  → gold
//   1/5   → silver
//   rest  → common (64%)
function rareTierFor(seed: string): number {
  const r = hash(seed + ':rare');
  if (r < 0.01) return 3;  // 1/100 → bling
  if (r < 0.06) return 2;  // 1/20  → rainbow (0.05 width)
  if (r < 0.16) return 1;  // 1/10  → gold    (0.10 width)
  if (r < 0.36) return 0;  // 1/5   → silver  (0.20 width)
  return -1;                // common
}

// Assign a skin URL to every player in order.
// Both rare and common skins are claimed exclusively — a player who doesn't
// land on an available rare skin falls through to an unclaimed common skin.
// lobbyId is mixed into the seed so results vary across different lobbies.
// Only frog players (not boss / turtle) should be passed in.
export function assignSkins(players: Pick<Player, 'name'>[], lobbyId = ''): Map<string, string> {
  const takenRareTiers = new Set<number>();
  const takenCommonIndices = new Set<number>();
  const result = new Map<string, string>();

  for (const { name } of players) {
    const seed = name + '\0' + lobbyId;
    const tier = rareTierFor(seed);

    if (tier >= 0) {
      // Walk down from rolled tier to find an unclaimed rare skin
      let assigned = -1;
      for (let t = tier; t >= 0; t--) {
        if (!takenRareTiers.has(t)) {
          takenRareTiers.add(t);
          assigned = t;
          break;
        }
      }
      if (assigned >= 0) {
        result.set(name, skinUrl(RARE_SKINS[assigned]));
        continue;
      }
    }

    // Common skin: pick from hash-derived starting index, skip already claimed ones
    const startIdx = Math.floor(hash(seed + ':common') * COMMON_SKINS.length);
    let commonAssigned = -1;
    for (let offset = 0; offset < COMMON_SKINS.length; offset++) {
      const idx = (startIdx + offset) % COMMON_SKINS.length;
      if (!takenCommonIndices.has(idx)) {
        takenCommonIndices.add(idx);
        commonAssigned = idx;
        break;
      }
    }
    // Fallback if all 7 common skins are taken (more than 7 non-rare players)
    result.set(name, skinUrl(COMMON_SKINS[commonAssigned >= 0 ? commonAssigned : startIdx]));
  }

  return result;
}
