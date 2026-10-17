// iOS (Safari and the app's WKWebView) zooms the page in when a text field
// under 16px gets focus, which helps reading what you type -- but never
// zooms back out after, leaving the whole game stuck a little zoomed in.
// Once typing is over (a field loses focus to something that isn't another
// field), clamping the viewport to maximum-scale=1 for a moment makes iOS
// snap back to 1x; then the viewport is restored so the next field can
// zoom in again.

const TEXT_FIELD = 'input, textarea, select, [contenteditable="true"]';

/** How long the clamp holds before the viewport is restored. */
export const ZOOM_RESET_MS = 300;

export function isIosDevice(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator): boolean {
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  return /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
}

function isTextField(el: EventTarget | null): boolean {
  return el instanceof Element && el.matches(TEXT_FIELD);
}

/** Resets iOS's focus zoom whenever typing ends. Returns the uninstaller. */
export function installIosZoomReset(doc: Document = document): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const onFocusOut = (e: FocusEvent) => {
    if (!isTextField(e.target) || isTextField(e.relatedTarget)) return;
    const meta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    if (timer !== null) return; // a reset is already under way
    const original = meta.content;
    meta.content = `${original}, maximum-scale=1`;
    timer = setTimeout(() => {
      meta.content = original;
      timer = null;
    }, ZOOM_RESET_MS);
  };

  doc.addEventListener('focusout', onFocusOut);
  return () => {
    doc.removeEventListener('focusout', onFocusOut);
    if (timer !== null) clearTimeout(timer);
  };
}
