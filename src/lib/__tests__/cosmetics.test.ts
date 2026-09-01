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
  it('returns null for the Parchment, which is drawn procedurally', () => {
    // ParchmentModel renders geometry directly; this returning null is what
    // tells a caller there is no .glb to load. Dropping a real asset into
    // COSMETIC_MODEL_URLS is the only change needed to switch it over.
    expect(cosmeticModelUrl(PARCHMENT)).toBeNull();
  });

  it('returns null for an unknown id rather than guessing a path', () => {
    expect(cosmeticModelUrl('nope_v1')).toBeNull();
  });
});

describe('labels', () => {
  it('names the Parchment', () => {
    expect(cosmeticLabel(PARCHMENT)).toBe('Parchment');
  });

  it('falls back to the raw id for an unknown cosmetic', () => {
    // A wom-be that has shipped a cosmetic this build does not know about
    // should render *something*, not blank.
    expect(cosmeticLabel('mystery_v1')).toBe('mystery_v1');
  });

  it('describes the Parchment as unbuyable and unrepeatable', () => {
    expect(cosmeticDescription(PARCHMENT)).toMatch(/cannot be bought/i);
  });

  it('returns an empty description rather than undefined for unknowns', () => {
    expect(cosmeticDescription('mystery_v1')).toBe('');
  });
});

describe('catalogue', () => {
  it('contains the Parchment', () => {
    expect(COSMETICS).toContain(PARCHMENT);
  });

  it('exposes colours shared by the 3D model and the inventory card', () => {
    // The card and the model must read as one object; a divergence here is
    // exactly the drift these constants exist to prevent.
    for (const value of Object.values(PARCHMENT_COLORS)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
