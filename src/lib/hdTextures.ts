import { use, useState } from 'react';
import { getEntitlements } from '@/lib/api';
import { IS_NATIVE_BUILD } from '@/lib/buildTarget';
import { getStoredAccountToken } from '@/lib/http';

// HD textures: the 4k Earth and the 8k Milky Way (lib/ktx2Textures.ts,
// lib/milkyWay.ts), kept in hd/ rather than public/.
//
// They come with the paid apps. The Steam and iOS builds bundle them
// (scripts/copy-hd-assets.mjs) and use them unless the player turns HD off
// in Settings. On the web they are served only to an account that has paid
// -- today, one connected to a Steam account that owns the game (wom-be
// services/entitlements.py) -- by src/app/hd/[...file]/route.web.ts, and
// there HD is off until the player turns it on.
//
// A scene picks its tier once, when it mounts (useHdTextures), so turning
// HD on or off takes effect the next time the globe or the city loads.

const PREFERENCE_KEY = 'hdTextures';

/** The player's own choice on this device, or null if they never made one. */
export function getHdPreference(): boolean | null {
  try {
    const v = localStorage.getItem(PREFERENCE_KEY);
    return v === 'on' ? true : v === 'off' ? false : null;
  } catch {
    return null;
  }
}

export function setHdPreference(on: boolean): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, on ? 'on' : 'off');
  } catch {
    // private mode: the choice lasts as long as the page
  }
}

/** Whether HD is on for this device, if it is allowed at all: on by
 *  default in the paid apps, off by default on the web. */
export function hdPreferred(): boolean {
  return getHdPreference() ?? IS_NATIVE_BUILD;
}

// use() needs the same promise on every render, and suspends once on a
// promise it has not seen settle -- these two are marked settled up front,
// the way React marks the ones it has, so a known answer never suspends.
function settled(value: boolean): Promise<boolean> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
}
const ON = settled(true);
const OFF = settled(false);

// One check per session token per page load: every scene that mounts asks,
// and a logout or a different login asks again.
let checked: { token: string; result: Promise<boolean> } | null = null;

/** Whether this device may load HD textures: always in the paid apps; on
 *  the web, while the logged-in account has HD. */
export function hdUnlocked(): Promise<boolean> {
  if (IS_NATIVE_BUILD) return ON;
  const token = getStoredAccountToken();
  if (!token) return OFF;
  if (checked?.token !== token) {
    checked = {
      token,
      result: getEntitlements(token).then((e) => e.hd, () => false),
    };
  }
  return checked.result;
}

/** Test seam: forget the cached check. */
export function resetHdUnlockedForTests(): void {
  checked = null;
}

/**
 * True when this scene should load the HD textures. Suspends (like the
 * texture loaders it feeds) while a web account's HD is being checked --
 * only for a player who turned HD on, so nobody else waits for it.
 */
export function useHdTextures(): boolean {
  // Pinned for the life of the scene: a login or logout while it is up must
  // not swap its textures (and the loader hooks behind them) mid-mount.
  const [answer] = useState(() => (hdPreferred() ? hdUnlocked() : OFF));
  return use(answer);
}

/** Headers for fetching an HD texture: on the web the server needs to know
 *  whose account is asking. */
export function hdRequestHeaders(): Record<string, string> {
  if (IS_NATIVE_BUILD) return {};
  const token = getStoredAccountToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** True for a path served from hd/. */
export function isHdTexturePath(url: string): boolean {
  return url.startsWith('/hd/');
}
