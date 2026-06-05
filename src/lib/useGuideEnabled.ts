'use client';

import { useCallback, useEffect, useState } from 'react';

// localStorage flag controlling the in-game welcome tour.
// Default is ON: a missing value (or anything other than the literal string
// 'false') counts as enabled, so brand-new players always get the tour.
const STORAGE_KEY = 'womGuideEnabled';
const CHANGE_EVENT = 'womGuideChanged';

function readEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEY) !== 'false';
}

/**
 * Reactive accessor for the welcome-tour enabled flag.
 *
 * `enabled` reflects the current localStorage value and updates live when the
 * flag changes — both across tabs (native `storage` event) and within the same
 * tab (custom `womGuideChanged` event, since `storage` does not fire in the tab
 * that made the change). `mounted` is false on the server / first paint to keep
 * SSR markup stable and avoid hydration mismatches.
 */
export function useGuideEnabled() {
  const [mounted, setMounted] = useState(false);
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    setMounted(true);
    setEnabledState(readEnabled());

    const sync = () => setEnabledState(readEnabled());
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    setEnabledState(value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { enabled, setEnabled, mounted };
}
