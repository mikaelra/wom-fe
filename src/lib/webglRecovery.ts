import { reloadPage } from '@/lib/reloadPage';

// iOS takes a page's WebGL context away under memory pressure, or while the
// app is in the background, and gives it back later. three.js then uploads
// every texture again, from sources that may be gone -- seen as every model
// drawn in scraps of other images (Mikael, 2026-10-14). On a restored context
// the page loads again (reloadPage keeps you on it; a match rejoins), so
// everything is uploaded fresh.

/** Watch `canvas` for a lost WebGL context. Returns the unwatcher. */
export function watchContextLoss(canvas: EventTarget, onRestored: () => void = () => reloadPage()): () => void {
  // Without preventDefault on "lost" the browser never restores it.
  const lost = (e: Event) => e.preventDefault();
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}
