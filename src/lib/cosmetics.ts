/**
 * The cosmetics catalogue -- items worn *alongside* a skin rather than
 * instead of one. Mirrors `lib/frogSkins.ts`, which is the same idea for
 * the mutually-exclusive half of the wardrobe.
 *
 * There is exactly one cosmetic, and it cannot be bought: it is granted by
 * discovering an artifact (`docs/ARTIFACT_PLAN.md`). Ownership
 * lives in the artifacts row itself, so nothing here tracks what a player
 * holds -- `/inventory` answers that.
 *
 * NOT the garment system in `docs/CLOTHING_PLAN.md`. A garment hugs the frog
 * mesh and needs the shell pipeline and the base-mesh invariant. A cosmetic
 * hangs beside the avatar and touches nothing, which is why it can ship
 * without any of that machinery.
 */
export const ARTIFACT = 'artifact_v1';

export const COSMETICS = [ARTIFACT] as const;

export type Cosmetic = (typeof COSMETICS)[number];

export function isCosmetic(id: string | null | undefined): id is Cosmetic {
  return !!id && (COSMETICS as readonly string[]).includes(id);
}

/**
 * Where a cosmetic's model lives. Same role `SKIN_MODEL_URLS` plays in
 * `frogSkins.ts` for Cherub -- one exception map rather than a filename
 * convention every call site has to know.
 *
 * The asset lives under `public/skins/items/` where it was added (PR #329),
 * under the artist's own filename (pergament_v1.glb) rather than the
 * cosmetic's id -- which is exactly what this map is for. Left
 * where the artist put it rather than moved: `next build` copies all of
 * `public/` regardless, so relocating it would churn the asset for nothing.
 *
 * Returns null for a cosmetic with no model yet, which is a real state --
 * `ArtifactModel` renders nothing rather than guessing a path.
 */
const COSMETIC_MODEL_URLS: Record<string, string> = {
  [ARTIFACT]: '/skins/items/pergament_v1.glb',
};

export function cosmeticModelUrl(id: string): string | null {
  return COSMETIC_MODEL_URLS[id] ?? null;
}

// The number here is the item's own catalogue number -- this is the first
// artifact in the game, so it is "Artifact #1" for everyone who owns one,
// whether they found it first or four hundredth. It is NOT the finder's
// discovery ordinal; that lives in the ledger, which is where being early
// actually means something. A second artifact item would be "Artifact #2"
// for all of its owners in turn.
//
const COSMETIC_LABELS: Record<string, string> = {
  [ARTIFACT]: 'Artifact #1',
};

export function cosmeticLabel(id: string): string {
  return COSMETIC_LABELS[id] ?? id;
}

const COSMETIC_DESCRIPTIONS: Record<string, string> = {
  [ARTIFACT]: 'A piece of paper found in a well one time.',
};

export function cosmeticDescription(id: string): string {
  return COSMETIC_DESCRIPTIONS[id] ?? '';
}
