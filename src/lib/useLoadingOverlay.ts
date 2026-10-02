import { useEffect, useState, useSyncExternalStore } from 'react';
import { isBackgroundLoading, isScreenLoading, subscribeLoading } from '@/lib/loadingTracker';
import { LOADING_LOOP_MS, useMinimumLoading } from '@/lib/useMinimumLoading';

/** API calls / asset loads shorter than this never raise the overlay, so
 *  quick calls don't flash it. Screens waiting for content show at once. */
export const BACKGROUND_LOADING_DELAY_MS = 300;

/** Whether the loading overlay is up: at once for a screen waiting on its
 *  content, after `delayMs` for background loading -- and then for at least
 *  one whole loop of the animation (`minMs`). */
export function useLoadingOverlay(delayMs = BACKGROUND_LOADING_DELAY_MS, minMs = LOADING_LOOP_MS): boolean {
  const screen = useSyncExternalStore(subscribeLoading, isScreenLoading, () => false);
  const background = useSyncExternalStore(subscribeLoading, isBackgroundLoading, () => false);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!background) {
      setLate(false);
      return;
    }
    const id = setTimeout(() => setLate(true), delayMs);
    return () => clearTimeout(id);
  }, [background, delayMs]);
  return useMinimumLoading(screen || (background && late), minMs);
}
