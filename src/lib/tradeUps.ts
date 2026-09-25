// The trade-up ladder client-side helpers (docs/TRADE_UP_PLAN.md §5, §8.1).
// Pure -- no React, no fetch. The ladder itself is never hardcoded here; it
// always comes from GET /tradeup/rules (getTradeUpRules() in api.ts).
import { skinLabel } from '@/lib/frogSkins';

export type TradeUpRule = {
  cost: number;
  output_kind: 'wheel' | 'skin';
  output: string;
};

export type TradeUpResult = {
  success: boolean;
  trade_up_id: number;
  output_kind: 'wheel' | 'skin';
  output: string;
  wheel_id?: number;
  remaining: number;
  equipped_skin?: string;
};

// skinLabel()'s generic fallback (used by the four rare skins -- none of
// them are in frogSkins.ts's SKIN_DISPLAY_NAMES) returns an all-lowercase
// word. That reads fine standalone with a `capitalize` CSS class (how
// WheelSpinModal shows it), but costLabel/outputLabel are plain strings
// embedded in button text and copy, where a lowercase "silver" sitting next
// to a properly-cased "Bleak Blue" reads like a typo. Capitalizing the
// first letter here is scoped to trade-up copy only -- it doesn't touch
// frogSkins.ts or any other consumer of skinLabel().
function capitalizedSkinLabel(skin: string): string {
  const label = skinLabel(skin);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function costLabel(rule: TradeUpRule, skin: string): string {
  return `${rule.cost} × ${capitalizedSkinLabel(skin)}`;
}

export function outputLabel(rule: TradeUpRule): string {
  return rule.output_kind === 'wheel' ? 'Special Wheel' : capitalizedSkinLabel(rule.output);
}

export function canAfford(owned: number, rule: TradeUpRule): boolean {
  return owned >= rule.cost;
}
