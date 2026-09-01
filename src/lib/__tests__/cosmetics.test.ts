import { describe, expect, it } from 'vitest';

import {
  COSMETICS,
  ARTIFACT,
  cosmeticDescription,
  cosmeticLabel,
  cosmeticModelUrl,
  isCosmetic,
} from '@/lib/cosmetics';

describe('isCosmetic', () => {
  it('recognises the artifact cosmetic', () => {
    expect(isCosmetic(ARTIFACT)).toBe(true);
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
    expect(cosmeticModelUrl(ARTIFACT)).toBe('/skins/items/pergament_v1.glb');
  });

  it('returns null for an unknown id rather than guessing a path', () => {
    // A null here is a real state, not a failure: it means "no model yet",
    // and ArtifactModel renders nothing rather than requesting a 404.
    expect(cosmeticModelUrl('nope_v1')).toBeNull();
  });
});

describe('labels', () => {
  it('names the item "Artifact #1" for every owner, not just the first finder', () => {
    // The number is the item's catalogue number, not the finder's discovery
    // ordinal -- the four hundredth finder owns "Artifact #1" too. Being
    // early is recorded in the ledger, not in the item's name.
    expect(cosmeticLabel(ARTIFACT)).toBe('Artifact #1');
  });

  it('falls back to the raw id for an unknown cosmetic', () => {
    // A wom-be that has shipped a cosmetic this build does not know about
    // should render *something*, not blank.
    expect(cosmeticLabel('mystery_v1')).toBe('mystery_v1');
  });

  it('describes the artifact cosmetic', () => {
    expect(cosmeticDescription(ARTIFACT)).toBe('A piece of paper found in a well one time.');
  });

  it('returns an empty description rather than undefined for unknowns', () => {
    expect(cosmeticDescription('mystery_v1')).toBe('');
  });
});

describe('catalogue', () => {
  it('contains the artifact cosmetic', () => {
    expect(COSMETICS).toContain(ARTIFACT);
  });
});
