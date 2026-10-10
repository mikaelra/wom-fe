// Text mode: playing without 3D -- matches as text, like Tjuvpakk's
// (components/text/). Nothing to load beyond the page itself, so it also
// plays on a phone that can't hold the 3D scenes. A choice per device
// (Settings -> Graphics), off until the player turns it on.

import { useEffect, useState } from 'react';

const KEY = 'textMode';

export function getTextMode(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
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
