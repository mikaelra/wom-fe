import { describe, expect, it } from 'vitest';

import {
  COSMETICS,
  PARCHMENT,
  PARCHMENT_COLORS,
  cosmeticDescription,
  cosmeticLabel,
  cosmeticModelUrl,
  isCosmetic,
} from '@/lib/cosmetics';

describe('isCosmetic', () => {
  it('recognises the Parchment', () => {
    expect(isCosmetic(PARCHMENT)).toBe(true);
  });

  it('rejects anything else, including skins', () => {
    expect(isCosmetic('frog_gold_v1')).toBe(false);
    expect(isCosmetic('crown_of_nonsense')).toBe(false);
  });

  it('treats null and undefined as "wearing nothing", not as an error', () => {
    // The wire field is null for nearly every player, so this is the
    // common path rather than an edge case.
    expect(isCosmetic(null)).toBe(false);
    expect(isCosmetic(undefined)).toBe(false);
    expect(isCosmetic('')).toBe(false);
  });
});

describe('cosmeticModelUrl', () => {
  it('points at the pergament asset', () => {
    // Lives under public/skins/items/ where it was added (wom-fe PR #329),
    // not under public/models/ with everything else -- which is exactly why
    // this map exists instead of a filename convention.
    expect(cosmeticModelUrl(PARCHMENT)).toBe('/skins/items/pergament_v1.glb');
  });

  it('returns null for an unknown id rather than guessing a path', () => {
    // A null here is a real state, not a failure: it means "no model yet",
    // and ParchmentModel renders nothing rather than requesting a 404.
    expect(cosmeticModelUrl('nope_v1')).toBeNull();
  });
});

describe('labels', () => {
  it('names the item "Artifact #1" for every owner, not just the first finder', () => {
    // The number is the item's catalogue number, not the finder's discovery
    // ordinal -- the four hundredth finder owns "Artifact #1" too. Being
    // early is recorded in the ledger, not in the item's name.
    expect(cosmeticLabel(PARCHMENT)).toBe('Artifact #1');
  });

  it('falls back to the raw id for an unknown cosmetic', () => {
    // A wom-be that has shipped a cosmetic this build does not know about
    // should render *something*, not blank.
    expect(cosmeticLabel('mystery_v1')).toBe('mystery_v1');
  });

  it('describes the Parchment', () => {
    expect(cosmeticDescription(PARCHMENT)).toBe('A piece of paper found in a well one time.');
  });

  it('returns an empty description rather than undefined for unknowns', () => {
    expect(cosmeticDescription('mystery_v1')).toBe('');
  });
});

describe('catalogue', () => {
  it('contains the Parchment', () => {
    expect(COSMETICS).toContain(PARCHMENT);
  });

  it('exposes parchment colours for 2D chrome sitting beside the model', () => {
    // The model brings its own textures; these are for anything 2D that has
    // to sit next to it without clashing.
    for (const value of Object.values(PARCHMENT_COLORS)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
