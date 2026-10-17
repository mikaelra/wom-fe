import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PIXEL_GROUPS, pixel2Url, pixelUrl } from '@/components/modelling/pixelThumbnails';

const pub = (url: string) => join(process.cwd(), 'public', url);

describe('the 8-bit thumbnails', () => {
  const items = PIXEL_GROUPS.flatMap((g) => g.items);

  it('are all drawn: a 256x256 PNG each', () => {
    for (const it of items) {
      const file = pub(pixelUrl(it.id));
      expect(existsSync(file), it.id).toBe(true);
      const png = readFileSync(file);
      expect(png.subarray(1, 4).toString(), it.id).toBe('PNG');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], it.id).toEqual([256, 256]);
    }
  });

  it('also have a v2 on a faint aura: a 240x240 PNG each, drawn with some see-through pixels', () => {
    for (const it of items) {
      const file = pub(pixel2Url(it.id));
      expect(existsSync(file), it.id).toBe(true);
      const png = readFileSync(file);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], it.id).toEqual([240, 240]);
      expect(png[25], `${it.id} is RGBA`).toBe(6); // colour type 6: with alpha, so the aura can be faint
    }
  });

  it('name pictures that exist today', () => {
    for (const it of items) if (it.was) expect(existsSync(pub(it.was)), it.id).toBe(true);
  });

  it('cover every skin the game has', async () => {
    const { ALL_FROG_SKINS } = await import('@/lib/frogSkins');
    const ids = new Set(items.map((i) => i.id));
    for (const s of ALL_FROG_SKINS) expect(ids.has(s), s).toBe(true);
  });
});
