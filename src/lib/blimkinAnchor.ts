// Where Blimkin comes out when the player is typing: just over the field
// they're typing in, so his cloud is seen above the keyboard instead of
// hidden under it in his corner (Mikael, 2026-10-17).

/** The text field being typed in, if focus is on one. */
export function typingField(el: Element | null): HTMLElement | null {
  if (!el || !(el instanceof HTMLElement)) return null;
  if (el.isContentEditable) return el;
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'number', 'tel', 'url', 'password'].includes(type) ? el : null;
  }
  return null;
}

/** Room kept clear around him, in px. */
const GAP = 8;
const EDGE = 12;
/** Roughly how wide he and his cloud stand, so he isn't pushed off the right. */
const FOOTPRINT = 280;

/** His position (left, and bottom from the window's foot) standing on top of
 *  the field's top edge, kept inside the window. */
export function anchorOverField(
  field: Pick<DOMRect, 'left' | 'top'>,
  windowWidth: number,
  windowHeight: number,
): { left: number; bottom: number } {
  const left = Math.max(EDGE, Math.min(field.left, windowWidth - FOOTPRINT - EDGE));
  const bottom = Math.max(EDGE, windowHeight - field.top + GAP);
  return { left: Math.round(left), bottom: Math.round(bottom) };
}
