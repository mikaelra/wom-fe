// The battle camera's zoom: an arm-length multiplier (usePanOffset), 1 the
// usual framing. Mikael, 2026-10-12: twice as far out as before is allowed
// (6, was 3), and on a phone -- a touch screen or a narrow window, the iOS
// app included -- the camera starts and settles at the old furthest (3),
// where the whole table fits a small screen.

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 6;
export const PHONE_ZOOM = 3;

/** Whether this is a phone-sized or touch-first screen. */
export function isPhoneView(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse || window.innerWidth < 768;
}

/** Where the camera starts and settles on this screen. */
export function defaultLobbyZoom(): number {
  return isPhoneView() ? PHONE_ZOOM : 1;
}
