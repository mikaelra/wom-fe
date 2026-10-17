// One UI scale for every mode and scene (Mikael, 2026-10-13): text and
// buttons grow with the viewport on an iPad or a very big screen, so they
// keep the proportions a phone and an 800x600 window have, instead of
// staying phone-sized in a sea of empty space. Phones come out at exactly 1.
//
// The DOM gets it through the root font size (globals.css), so everything
// sized in rem -- all of Tailwind's text and spacing -- grows together and
// the layout stays as it is. That CSS repeats the numbers below; a test
// keeps the two in step. The 3D labels (hud/FreshHtml.tsx) and the LD
// canvases read it from here.

/** The short side, in CSS px, at which the UI is at its designed size. */
export const UI_SCALE_BASELINE = 600;
/** The most it grows: past this a screen is far enough away to not need it. */
export const UI_SCALE_MAX = 2.5;
/** Both sides under this and the viewport is tiny (an Apple Watch-sized
 *  window, 410x502): no growing, and the compact arrangements kick in. A
 *  phone always has one side well over it. */
export const COMPACT_MAX_SIDE = 640;

/** The UI scale for a viewport of `w` x `h` CSS px: 1 up to the baseline,
 *  then growing with the short side, up to UI_SCALE_MAX. */
export function uiScale(w: number, h: number): number {
  const short = Math.min(w, h);
  if (!(short > 0)) return 1;
  return Math.min(UI_SCALE_MAX, Math.max(1, short / UI_SCALE_BASELINE));
}

/** A viewport too small for the usual layout (both sides under
 *  COMPACT_MAX_SIDE) -- told apart by size, not by device. */
export function isCompactViewport(w: number, h: number): boolean {
  return w > 0 && h > 0 && Math.max(w, h) < COMPACT_MAX_SIDE;
}

/** The scale for the window right now (1 without one, e.g. server-side). */
export function currentUiScale(): number {
  if (typeof window === 'undefined') return 1;
  return uiScale(window.innerWidth, window.innerHeight);
}

/** A design size in px as rem, so it grows with the UI scale (the root font
 *  size) -- for sizes given as numbers, e.g. a roped button's width. */
export function rem(px: number): string {
  return `${px / 16}rem`;
}

/** isCompactViewport as a media query, for matchMedia and CSS. */
export const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_SIDE - 0.02}px) and (max-height: ${COMPACT_MAX_SIDE - 0.02}px)`;
