import { useEffect, useState, useSyncExternalStore } from 'react';
import { isBackgroundLoading, subscribeLoading } from '@/lib/loadingTracker';

/** Waits shorter than this never show the corner mark, so quick calls
 *  don't flash it. */
export const BACKGROUND_LOADING_DELAY_MS = 300;

/** True once background loading (see loadingTracker) has lasted
 *  `delayMs`; false again as soon as it stops. */
export function useBackgroundLoading(delayMs = BACKGROUND_LOADING_DELAY_MS): boolean {
  const loading = useSyncExternalStore(subscribeLoading, isBackgroundLoading, () => false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!loading) {
      setShown(false);
      return;
    }
    const id = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(id);
  }, [loading, delayMs]);
  return loading && shown;
}
