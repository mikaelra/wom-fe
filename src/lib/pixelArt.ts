import type { CSSProperties } from 'react';
import { ALL_FROG_SKINS, skinThumbnailUrl } from '@/lib/frogSkins';

// The 8-bit pictures of Low Definition (text mode, lib/textMode.ts), drawn on
// a 32x32 grid by scripts/pixel-thumbnails.py into public/pixel/ (Mikael,
// 2026-10-17). LD shows these wherever SD and HD show a 3D model or a
// rendered thumbnail -- never a 3D scene. A frog is its face only.

/** The skins that have a 32x32 face: the frogs and the Cherub. */
export const PIXEL_SKINS: ReadonlySet<string> = new Set([...ALL_FROG_SKINS, 'cherub_v1']);

/** The My AI agent's robot frog. */
export const PIXEL_ROBOT_URL = '/pixel/frog_robot_v1.png';
export const PIXEL_WHEEL_URL = '/pixel/wheel.png';
export const PIXEL_SPECIAL_WHEEL_URL = '/pixel/special-wheel.png';
/** The gold coin: Hades' Coin, and what any relic without its own picture is. */
export const PIXEL_COIN_URL = '/pixel/hades_coin.png';
/** The silver My AI coin of the shop. */
export const PIXEL_MY_AI_COIN_URL = '/pixel/my_ai_coin.png';
/** The artifact is its scroll. */
export const PIXEL_ARTIFACT_URL = '/pixel/artifact.png';

/** The relics with a picture, by name. Any other relic keeps its glyph. */
const PIXEL_RELICS: Record<string, string> = {
  "Hades' Coin": PIXEL_COIN_URL,
  'Stone of Vitality': '/pixel/stone.png',
  Pen: '/pixel/pen.png',
  Paper: '/pixel/paper.png',
};

/** The merchants, by their model's skin name (lib/frogSkins.ts). */
const PIXEL_MERCHANTS: Record<string, string> = {
  merchant_v1: '/pixel/merchant_v1.png',
  lady_merchant_v1: '/pixel/lady_merchant_v1.png',
};

/** A skin's 32x32 face, or null when it has none. */
export function pixelSkinUrl(skin: string | null | undefined): string | null {
  return skin && PIXEL_SKINS.has(skin) ? `/pixel/${skin}.png` : null;
}

/** A skin's picture for this mode: in Low Definition its 32x32 face when it has
 *  one, otherwise (or in SD and HD) the usual rendered thumbnail. */
export function skinPicture(skin: string, lowDefinition: boolean): string {
  return (lowDefinition && pixelSkinUrl(skin)) || skinThumbnailUrl(skin);
}

/** A relic's 32x32 picture, or null when it has none. */
export function pixelRelicUrl(name: string | null | undefined): string | null {
  return (name && PIXEL_RELICS[name]) || null;
}

/** A merchant's 32x32 portrait, or null when it has none. */
export function pixelMerchantUrl(model: string | null | undefined): string | null {
  return (model && PIXEL_MERCHANTS[model]) || null;
}

/** So a small sprite stays a grid of square pixels at any size. */
export const pixelImageStyle: CSSProperties = { imageRendering: 'pixelated' };
