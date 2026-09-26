/**
 * The lobby-wait camera spin toggle, remembered across visits in a cookie so
 * a player who turned it off does not have to turn it off again every game.
 *
 * Absent or unreadable means the default (spin on). Takes the cookie string
 * as an argument rather than reading document.cookie itself, so the parsing
 * is testable without a DOM.
 */

export const CAMERA_SPIN_COOKIE = 'wom_camera_spin';

const ONE_YEAR_S = 60 * 60 * 24 * 365;

export function readCameraSpin(cookie: string): boolean {
  for (const part of cookie.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === CAMERA_SPIN_COOKIE) return value !== '0';
  }
  return true;
}

export function cameraSpinCookie(enabled: boolean): string {
  return `${CAMERA_SPIN_COOKIE}=${enabled ? '1' : '0'}; path=/; max-age=${ONE_YEAR_S}; SameSite=Lax`;
}
