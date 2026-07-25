// Common skins.
export const COMMON_SKINS = [
  'frog_green_v1',
  'frog_blue_v1',
  'frog_orange_cursed_v1',
  'frog_pink_v1',
  'frog_purple_v1',
  'frog_red_v1',
  'frog_yellow_v1',
] as const;

// Rare skins ordered from least rare (index 0) to most rare (index 3).
export const RARE_SKINS = [
  'frog_silver_v1',
  'frog_gold_v1',
  'frog_rainbow_v2',
  'frog_bling_v1',
] as const;

export const ALL_FROG_SKINS = [...COMMON_SKINS, ...RARE_SKINS] as const;

// The 6 non-green common skins a Normal Wheel spin can land on (uniform
// odds) -- mirrors wom-be's routes/wheel.py NORMAL_WHEEL_SKINS exactly.
export const NORMAL_WHEEL_SKINS = COMMON_SKINS.filter((s) => s !== 'frog_green_v1');

export function skinUrl(skinName: string): string {
  return `/models/frogs/${skinName}.glb`;
}

// No pre-rendered 2D thumbnails exist for these models yet (only .glb) --
// a flat color swatch stands in for a skin's thumbnail on the inventory
// grid and the spin-reveal modal until real artwork/renders exist.
const SKIN_COLORS: Record<string, string> = {
  frog_green_v1: '#22c55e',
  frog_blue_v1: '#3b82f6',
  frog_orange_cursed_v1: '#f97316',
  frog_pink_v1: '#ec4899',
  frog_purple_v1: '#a855f7',
  frog_red_v1: '#ef4444',
  frog_yellow_v1: '#eab308',
  frog_silver_v1: '#d9dde3',
  frog_gold_v1: '#f5c542',
  // Flat fallback only (inventory grid, canvas-unsupported reveal) -- a
  // single hex can't actually look like a rainbow. WheelCanvas renders a
  // real multi-hue horizontal gradient for this skin instead of calling
  // skinColor() for its slice fill.
  frog_rainbow_v2: '#e879f9',
  // Light green base -- WheelCanvas layers many silver sparkle glints on
  // top of this for this skin's wheel slices.
  frog_bling_v1: '#86efac',
};

export function skinColor(skinName: string): string {
  return SKIN_COLORS[skinName] ?? '#6b7280';
}

// Fun display names for the common skins. Rare skins (and anything not
// listed here) fall back to a generic derived label.
const SKIN_DISPLAY_NAMES: Record<string, string> = {
  frog_green_v1: 'OG Green',
  frog_blue_v1: 'Bleak Blue',
  frog_orange_cursed_v1: 'Cursed Orange',
  frog_pink_v1: 'Pretty Pink',
  frog_purple_v1: 'Ponder Purple',
  frog_red_v1: 'Zonked Red',
  frog_yellow_v1: 'Yucky Yellow',
};

export function skinLabel(skinName: string): string {
  return (
    SKIN_DISPLAY_NAMES[skinName] ??
    skinName.replace(/^frog_/, '').replace(/_v\d+$/, '').replace(/_/g, ' ')
  );
}
