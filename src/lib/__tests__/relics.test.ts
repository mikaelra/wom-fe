import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RELIC_MODEL_URLS, relicModelUrl } from '@/lib/relics';

describe('relic models', () => {
  it('every url points at a model that is in public/', () => {
    for (const [name, url] of Object.entries(RELIC_MODEL_URLS)) {
      expect(existsSync(join(process.cwd(), 'public', url)), name).toBe(true);
    }
  });

  it("the Stone of Vitality is the v2 model, with its picture beside it", () => {
    expect(relicModelUrl('Stone of Vitality')).toBe('/models/relics/stone_of_vitality_v2.glb');
    expect(existsSync(join(process.cwd(), 'public/models/relics/stone_of_vitality_v2.thumbnail.png'))).toBe(true);
  });

  it('an unknown relic falls back to the coin', () => {
    expect(relicModelUrl('Nothing')).toBe(relicModelUrl(undefined));
  });
});
