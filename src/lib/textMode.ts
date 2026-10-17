// Text mode: playing without 3D -- matches as text, like Tjuvpakk's
// (components/text/). Nothing to load beyond the page itself, so it also
// plays on a phone that can't hold the 3D scenes. A choice per device
// (Settings -> Graphics). With no choice yet it is on in a browser -- the web
// opens in Low Definition -- and off in the iOS and Steam apps, which open in
// HD (Mikael, 2026-10-16).

import { useEffect, useState } from 'react';
import { IS_NATIVE_BUILD } from '@/lib/buildTarget';

const KEY = 'textMode';

export function getTextMode(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === null) return !IS_NATIVE_BUILD;
    return saved === 'on';
  } catch {
    // Private mode keeps no choice: on from default would trap the player in
    // text mode, since switching quality reloads the page.
    return false;
  }
}

export function setTextMode(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // private mode: the choice lasts as long as the page
  }
}

/** This device's choice, or null before it has been read (the server
 *  render and the first client render must agree, so it is read after
 *  mount). */
export function useTextMode(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    setOn(getTextMode());
  }, []);
  return on;
}
