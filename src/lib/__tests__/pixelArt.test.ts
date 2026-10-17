import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_FROG_SKINS } from '@/lib/frogSkins';
import {
  PIXEL_ARTIFACT_URL,
  PIXEL_COIN_URL,
  PIXEL_MY_AI_COIN_URL,
  PIXEL_ROBOT_URL,
  PIXEL_SPECIAL_WHEEL_URL,
  PIXEL_WHEEL_URL,
  pixelImageStyle,
  pixelMerchantUrl,
  pixelRelicUrl,
  pixelSkinUrl,
  skinPicture,
} from '@/lib/pixelArt';

const inPublic = (url: string) => existsSync(join(process.cwd(), 'public', url));

describe('pixel art (Low Definition)', () => {
  it('gives every frog skin and the Cherub a 32x32 face that exists', () => {
    for (const skin of [...ALL_FROG_SKINS, 'cherub_v1']) {
      const url = pixelSkinUrl(skin);
      expect(url, skin).toBe(`/pixel/${skin}.png`);
      expect(inPublic(url!), skin).toBe(true);
    }
  });

  it('has no face for a skin that was not drawn', () => {
    expect(pixelSkinUrl('merchant_v1')).toBeNull();
    expect(pixelSkinUrl('nope')).toBeNull();
    expect(pixelSkinUrl(null)).toBeNull();
  });

  it('picks the face in Low Definition and the usual thumbnail otherwise', () => {
    expect(skinPicture('frog_blue_v1', true)).toBe('/pixel/frog_blue_v1.png');
    expect(skinPicture('frog_blue_v1', false)).toBe('/skins/thumbnails/frog_blue_v1.png');
    expect(skinPicture('merchant_v1', true)).toBe('/skins/thumbnails/merchant_v1.png');
  });

  it("draws Hades' Coin, the Stone, the Pen and the Paper, and leaves other relics to their glyph", () => {
    for (const name of ["Hades' Coin", 'Stone of Vitality', 'Pen', 'Paper']) expect(inPublic(pixelRelicUrl(name)!), name).toBe(true);
    expect(pixelRelicUrl("Hades' Coin")).toBe(PIXEL_COIN_URL); // the gold coin
    expect(pixelRelicUrl('Spirit of Nobody')).toBeNull(); // RelicCoin shows the coin for it
    expect(pixelRelicUrl(undefined)).toBeNull();
  });

  it('draws both merchants', () => {
    expect(inPublic(pixelMerchantUrl('merchant_v1')!)).toBe(true);
    expect(inPublic(pixelMerchantUrl('lady_merchant_v1')!)).toBe(true);
    expect(pixelMerchantUrl('frog_green_v1')).toBeNull();
  });

  it('has the wheels, the artifact, the robot frog and the My AI coin on disk', () => {
    for (const url of [PIXEL_WHEEL_URL, PIXEL_SPECIAL_WHEEL_URL, PIXEL_ARTIFACT_URL, PIXEL_ROBOT_URL, PIXEL_MY_AI_COIN_URL]) {
      expect(inPublic(url), url).toBe(true);
    }
  });

  it('keeps sprites as square pixels', () => {
    expect(pixelImageStyle.imageRendering).toBe('pixelated');
  });
});
