/**
 * Pure helpers for the carved signpost being sculpted on /modelling
 * (components/city/CarvedSignpost.tsx). Kept out of the component for the
 * usual reason: R3F components are never unit-tested in this repo.
 */

/**
 * A tiny seeded PRNG (mulberry32). The wood grain and the wear on the
 * painted letters are drawn with it, so a Fast Refresh redraws the same
 * plank rather than a new random one every edit -- otherwise nothing could
 * be compared between iterations.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from a label, so each plank keeps its own grain. */
export function seedFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The font size (px) that fits a label inside a box, given how wide the
 * label measures at 1px. Height-bound by `heightFill` of the box, width-bound
 * by `widthFill` of it, whichever is tighter.
 */
export function fitFontSize(
  widthAtOnePx: number,
  boxWidth: number,
  boxHeight: number,
  heightFill = 0.62,
  widthFill = 0.86,
): number {
  const byHeight = boxHeight * heightFill;
  if (!(widthAtOnePx > 0)) return byHeight;
  return Math.min(byHeight, (boxWidth * widthFill) / widthAtOnePx);
}
