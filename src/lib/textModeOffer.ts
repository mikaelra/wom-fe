// Offering text mode (lib/textMode.ts) to a player whose device struggles
// with the 3D game: after it crashed in a 3D scene, or after a match's
// connection kept dropping (Mikael, 2026-10-10). On iPhone the 3D scenes
// can make iOS kill the app's web view for memory; text mode loads no 3D.
//
// Crash: while a 3D scene is up and the page is visible, a marker sits in
// localStorage, its time refreshed every half minute. Leaving the scene, a
// reload, or the app going to the background clears it; a web view killed
// mid-scene does not, so the next start finds it. Read once, when this
// module first loads -- before the next 3D scene puts its own marker down.
//
// Reconnect loop: three dropped connections within a minute.
//
// Never offered to someone already in text mode, and after "Not now" not
// again for a week.

import { getTextMode } from '@/lib/textMode';

const SCENE_KEY = 'wom.scene3d';
const DISMISSED_KEY = 'wom.textModeOfferDismissedAt';
export const OFFER_EVENT = 'wom:offer-text-mode';

const HEARTBEAT_MS = 30_000;
const CRASH_RECENT_MS = 2 * 60_000;
const QUIET_MS = 7 * 24 * 60 * 60_000;
const DROPS = 3;
const DROPS_WITHIN_MS = 60_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // private mode: no offer, then
  }
}

/** Whether the last visit ended with a 3D scene up -- a crash -- read (and
 *  cleared) as of `now`. */
export function readCrashMarker(now: number = Date.now()): boolean {
  const at = Number(read(SCENE_KEY));
  write(SCENE_KEY, null);
  return at > 0 && now - at < CRASH_RECENT_MS;
}

const crashedBefore = typeof window !== 'undefined' && readCrashMarker();

/** Did the previous visit end in a crash in a 3D scene? */
export function endedInACrash(): boolean {
  return crashedBefore;
}

/** Mark a 3D scene as up while it is; the returned function un-marks it. */
export function watch3dScene(): () => void {
  const mark = () => write(SCENE_KEY, String(Date.now()));
  const clear = () => write(SCENE_KEY, null);
  const onVisibility = () => (document.visibilityState === 'hidden' ? clear() : mark());
  mark();
  const heartbeat = setInterval(() => document.visibilityState !== 'hidden' && mark(), HEARTBEAT_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', clear);
  return () => {
    clearInterval(heartbeat);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', clear);
    clear();
  };
}

let drops: number[] = [];

/** A match's connection dropped; the third within a minute asks for the
 *  offer (an OFFER_EVENT on window). */
export function noteDisconnect(now: number = Date.now()): void {
  drops = [...drops.filter((t) => now - t < DROPS_WITHIN_MS), now];
  if (drops.length >= DROPS) {
    drops = [];
    window.dispatchEvent(new Event(OFFER_EVENT));
  }
}

/** Whether to offer it now: not to someone in text mode already, nor within
 *  a week of their "Not now". */
export function shouldOffer(now: number = Date.now()): boolean {
  if (getTextMode()) return false;
  const dismissed = Number(read(DISMISSED_KEY));
  return !(dismissed > 0 && now - dismissed < QUIET_MS);
}

export function dismissOffer(now: number = Date.now()): void {
  write(DISMISSED_KEY, String(now));
}

/** Test seam. */
export function resetDropsForTests(): void {
  drops = [];
}
