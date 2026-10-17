/**
 * The lobby-wait camera spin toggle, remembered across visits so a player
 * who turned it off does not have to turn it off again every game.
 *
 * Kept in localStorage (Mikael, 2026-10-12): it used to be a cookie, which
 * the Steam app (Electron, not an http page) and the iOS app (Capacitor's
 * own scheme) don't keep, so the choice was forgotten there. An old cookie
 * is still read once, so nobody who set it on the web loses it.
 *
 * Absent or unreadable means the default (spin on).
 */

export const CAMERA_SPIN_KEY = 'wom_camera_spin';
export const CAMERA_SPIN_COOKIE = 'wom_camera_spin';

function fromCookie(cookie: string): boolean | null {
  for (const part of cookie.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === CAMERA_SPIN_COOKIE) return value !== '0';
  }
  return null;
}

/** The remembered choice: localStorage first, then an old cookie. */
export function readCameraSpin(cookie = typeof document !== 'undefined' ? document.cookie : ''): boolean {
  try {
    const stored = localStorage.getItem(CAMERA_SPIN_KEY);
    if (stored !== null) return stored !== '0';
  } catch {
    // storage blocked: fall through to the cookie / default
  }
  return fromCookie(cookie) ?? true;
}

export function saveCameraSpin(enabled: boolean): void {
  try {
    localStorage.setItem(CAMERA_SPIN_KEY, enabled ? '1' : '0');
  } catch {
    // private mode: the choice lasts as long as the page
  }
}
