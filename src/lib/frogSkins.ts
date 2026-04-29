import type { Player } from '@/types/game';

// Common skins — multiple players may share the same common skin
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

// Determine which rare tier a player "rolled" on join, deterministically from their name.
// Returns -1 for common, 0 = silver, 1 = gold, 2 = rainbow, 3 = bling.
//
// Roll sequence (mirrors the spec):
//   1-in-5  → if true, proceed; else common
//   1-in-2  → if false, silver; if true, proceed
//   1-in-5  → if false, gold; if true, proceed
//   1-in-2  → if false, rainbow; if true, bling
function rareTierFor(name: string): number {
  if (hash(name + ':r1') >= 0.2) return -1; // 4/5 chance → common
  if (hash(name + ':r2') < 0.5) return 0;   // 1/2 chance → silver
  if (hash(name + ':r3') >= 0.2) return 1;  // 4/5 chance → gold
  if (hash(name + ':r4') < 0.5) return 2;   // 1/2 chance → rainbow
  return 3;                                   // bling
}

// Assign a skin URL to every player in order.
// Rare skins are unique per lobby — if the rolled skin is taken the player
// falls back to the next less rare skin that is still available.
// Only frog players (not boss / turtle / gremlin) should be passed in.
export function assignSkins(players: Pick<Player, 'name'>[]): Map<string, string> {
  const takenRareTiers = new Set<number>();
  const result = new Map<string, string>();

  for (const { name } of players) {
    const tier = rareTierFor(name);

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

    // Common skin (rolled common, or all rare fallbacks were taken)
    const idx = Math.floor(hash(name + ':common') * COMMON_SKINS.length);
    result.set(name, skinUrl(COMMON_SKINS[idx]));
  }

  return result;
}
