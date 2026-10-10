// Relics' names and pictures as the client knows them, apart from the
// components that draw them in 3D (RelicCoin, RelicSelectionPopover) so the
// text match and the merchant can use them without loading three.js -- or
// RelicCoin's model preloads.

// Falls back to the Well's gold-reward coin model (see WellRewardEffect.tsx's
// WELL_REWARD_MODELS.gold, already loaded/cached for anyone who's played a
// match with a Well) for any relic without dedicated art of its own.
export const COIN_MODEL_URL = '/models/well/rewards/gold-ld.glb';

// Name-keyed, not id-keyed: unlike COIN_RELIC_ID (types/game.ts), a new
// relic's id is whatever the seed migration's autoincrement assigns, not a
// value safe to hardcode across environments (docs/MERCHANT_PLAN.md's
// domain/merchant.py resolves Stone of Vitality's id by name for the same
// reason).
export const RELIC_MODEL_URLS: Record<string, string> = {
  'Stone of Vitality': '/models/relics/stone_of_vitality_v1.glb',
  // pergament_v1 (add-pergament-item-model), textures resized 2048 -> 1024:
  // it is drawn at relic-card size, and that took it from 6.6 MB to 0.7.
  Paper: '/models/relics/paper_v1.glb',
  // Meshy feather quill (wom-tools/model-generation), texture resized
  // 2048 -> 1024 for the same reason: 3.1 MB to 0.45.
  Pen: '/models/relics/pen_v1.glb',
};

// Exported for callers that need the raw model url without the rest of
// this component (e.g. MerchantScene.tsx, which stages the relic a
// merchant sells itself rather than in a standard relic-card box).
export function relicModelUrl(relicName?: string): string {
  return (relicName && RELIC_MODEL_URLS[relicName]) || COIN_MODEL_URL;
}

// The compact badge (selected-but-collapsed state) shows one glyph in place
// of the full 3D model -- name-keyed for the same reason as RELIC_SELECT_HELP.
export const RELIC_BADGE_EMOJI: Record<string, string> = {
  "Hades' Coin": '🪙',
  'Stone of Vitality': '🪨',
};
export const DEFAULT_RELIC_BADGE_EMOJI = '💠';

// Short version of RELIC_SELECT_HELP for the caption under the icon/count
// in the open popover -- that one's a full sentence meant for a
// hover/tooltip title, this is meant to fit under a compact card.
export const RELIC_SELECT_CAPTION: Record<string, string> = {
  "Hades' Coin": 'Start the game with 1 coin',
  'Stone of Vitality': 'Start the game with 15 HP',
};
