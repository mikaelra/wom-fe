import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  isAssetsLoading,
  isBackgroundLoading,
  isOverlaySuppressed,
  isScreenLoading,
  isUrgentScreenLoading,
  subscribeLoading,
} from '@/lib/loadingTracker';
import { LOADING_LOOP_MS, useMinimumLoading } from '@/lib/useMinimumLoading';

/** API calls shorter than this never raise the overlay, so quick calls don't
 *  flash it. Screens waiting for content and scenes loading assets show at
 *  once. */
export const BACKGROUND_LOADING_DELAY_MS = 300;

const never = () => false;

/** Whether the loading overlay is up: at once for a screen waiting on its
 *  content or a scene loading its assets, after `delayMs` for an API call --
 *  and then for at least one whole loop of the animation (`minMs`). Never
 *  while a page has switched it off (<NoLoadingOverlay>, live lobbies),
 *  unless a screen claimed it over that (<LoadingState overSuppression>). */
export function useLoadingOverlay(delayMs = BACKGROUND_LOADING_DELAY_MS, minMs = LOADING_LOOP_MS): boolean {
  const suppressed = useSyncExternalStore(subscribeLoading, isOverlaySuppressed, never);
  const screen = useSyncExternalStore(subscribeLoading, isScreenLoading, never);
  const assets = useSyncExternalStore(subscribeLoading, isAssetsLoading, never);
  const background = useSyncExternalStore(subscribeLoading, isBackgroundLoading, never);
  const urgent = useSyncExternalStore(subscribeLoading, isUrgentScreenLoading, never);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!background) {
      setLate(false);
      return;
    }
    const id = setTimeout(() => setLate(true), delayMs);
    return () => clearTimeout(id);
  }, [background, delayMs]);
  const blocked = suppressed && !urgent;
  const shown = useMinimumLoading(!blocked && (screen || assets || (background && late)), minMs);
  return shown && !blocked;
}
