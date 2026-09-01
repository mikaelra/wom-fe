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
 * Where a cosmetic's model lives, or null when it has no `.glb` and is drawn
 * procedurally instead (`components/lobby/ParchmentModel.tsx`).
 *
 * This is the swap point. Drop a real `/models/cosmetics/parchment_v1.glb`
 * in here and the renderer picks it up with no other change -- the same role
 * `SKIN_MODEL_URLS` plays in `frogSkins.ts` for Cherub. Keep the Draco
 * convention (`crown_hd_v1_draco.glb`) when that happens: `next build`
 * copies all of `public/` regardless of what imports it, and the frog skins
 * are already ~1 MB each.
 */
const COSMETIC_MODEL_URLS: Record<string, string> = {};

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

/** Parchment colours, shared by the 3D model and its inventory card so the
 *  two read as the same object. */
export const PARCHMENT_COLORS = {
  paper: '#e8dcc0',
  paperShade: '#cbbb95',
  rod: '#8a6a3f',
  ribbon: '#a3242c',
} as const;
