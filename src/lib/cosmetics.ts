/**
 * The cosmetics catalogue -- items worn *alongside* a skin rather than
 * instead of one. Mirrors `lib/frogSkins.ts`, which is the same idea for
 * the mutually-exclusive half of the wardrobe.
 *
 * There is exactly one cosmetic, and it cannot be bought: the Parchment is
 * granted by discovering an artifact (`docs/ARTIFACT_PLAN.md`). Ownership
 * lives in the artifacts row itself, so nothing here tracks what a player
 * holds -- `/inventory` answers that.
 *
 * NOT the garment system in `docs/CLOTHING_PLAN.md`. A garment hugs the frog
 * mesh and needs the shell pipeline and the base-mesh invariant. A cosmetic
 * hangs beside the avatar and touches nothing, which is why it can ship
 * without any of that machinery.
 */
export const PARCHMENT = 'parchment_v1';

export const COSMETICS = [PARCHMENT] as const;

export type Cosmetic = (typeof COSMETICS)[number];

export function isCosmetic(id: string | null | undefined): id is Cosmetic {
  return !!id && (COSMETICS as readonly string[]).includes(id);
}

/**
 * Where a cosmetic's model lives. Same role `SKIN_MODEL_URLS` plays in
 * `frogSkins.ts` for Cherub -- one exception map rather than a filename
 * convention every call site has to know.
 *
 * The Parchment's asset lives under `public/skins/items/`, where it was
 * added (PR #329), not under `public/models/` with everything else. Left
 * where the artist put it rather than moved: `next build` copies all of
 * `public/` regardless, so relocating it would churn the asset for nothing.
 *
 * Returns null for a cosmetic with no model yet, which is a real state --
 * `ParchmentModel` renders nothing rather than guessing a path.
 */
const COSMETIC_MODEL_URLS: Record<string, string> = {
  [PARCHMENT]: '/skins/items/pergament_v1.glb',
};

export function cosmeticModelUrl(id: string): string | null {
  return COSMETIC_MODEL_URLS[id] ?? null;
}

const COSMETIC_LABELS: Record<string, string> = {
  [PARCHMENT]: 'Parchment',
};

export function cosmeticLabel(id: string): string {
  return COSMETIC_LABELS[id] ?? id;
}

const COSMETIC_DESCRIPTIONS: Record<string, string> = {
  [PARCHMENT]: 'Proof that you found an artifact. It cannot be bought, traded, or found twice.',
};

export function cosmeticDescription(id: string): string {
  return COSMETIC_DESCRIPTIONS[id] ?? '';
}

/** Parchment colours. The 3D model brings its own textures; these are for
 *  2D chrome that has to sit beside it without clashing. */
export const PARCHMENT_COLORS = {
  paper: '#e8dcc0',
  paperShade: '#cbbb95',
  rod: '#8a6a3f',
  ribbon: '#a3242c',
} as const;
