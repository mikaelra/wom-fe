import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  assetLoadProgress,
  isAssetsGradual,
  isAssetsLoading,
  isBackgroundLoading,
  isOverlaySuppressed,
  isScreenLoading,
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
 *  while a page has switched it off (<NoLoadingOverlay>, live lobbies). */
export function useLoadingOverlay(delayMs = BACKGROUND_LOADING_DELAY_MS, minMs = LOADING_LOOP_MS): boolean {
  const suppressed = useSyncExternalStore(subscribeLoading, isOverlaySuppressed, never);
  const screen = useSyncExternalStore(subscribeLoading, isScreenLoading, never);
  const assets = useSyncExternalStore(subscribeLoading, isAssetsLoading, never);
  const background = useSyncExternalStore(subscribeLoading, isBackgroundLoading, never);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!background) {
      setLate(false);
      return;
    }
    const id = setTimeout(() => setLate(true), delayMs);
    return () => clearTimeout(id);
  }, [background, delayMs]);
  const shown = useMinimumLoading(!suppressed && (screen || assets || (background && late)), minMs);
  return shown && !suppressed;
}

/** Where the grey starts for everything but the earth scene. */
export const BACKDROP_START_OPACITY = 0.5;
/** How long it takes that grey to climb to fully opaque while things are
 *  still loading in. */
export const BACKDROP_RISE_MS = LOADING_LOOP_MS;
/** How often the climbing grey is updated. */
export const BACKDROP_TICK_MS = 50;

/**
 * Opacity of the overlay's grey, 0..1.
 *  - The earth scene (`gradualScene`, while no screen is waiting on content)
 *    fades as it renders: 1 minus the most of it `loaded` so far, so the
 *    globe comes through the grey and it is clear once all is in.
 *  - Everything else starts half grey and climbs to opaque over
 *    BACKDROP_RISE_MS of `loadingFor` (time spent with things still loading).
 */
export function backdropOpacity(gradualScene: boolean, screen: boolean, loaded: number, loadingFor: number): number {
  if (gradualScene && !screen) return 1 - Math.min(1, Math.max(0, loaded));
  const rise = Math.min(1, Math.max(0, loadingFor / BACKDROP_RISE_MS));
  return BACKDROP_START_OPACITY + (1 - BACKDROP_START_OPACITY) * rise;
}

/** backdropOpacity for the overlay currently `visible`. */
export function useLoadingBackdrop(visible: boolean): number {
  const screen = useSyncExternalStore(subscribeLoading, isScreenLoading, never);
  const assets = useSyncExternalStore(subscribeLoading, isAssetsLoading, never);
  const gradual = useSyncExternalStore(subscribeLoading, isAssetsGradual, never);
  const requests = useSyncExternalStore(subscribeLoading, isBackgroundLoading, never);
  const progress = useSyncExternalStore(subscribeLoading, assetLoadProgress, () => 1);
  const active = screen || assets || requests;
  const [gradualScene, setGradualScene] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [loadingFor, setLoadingFor] = useState(0);

  useEffect(() => {
    if (!visible) {
      setGradualScene(false);
      setLoaded(0);
      setLoadingFor(0);
    } else if (assets && gradual) {
      setGradualScene(true);
    }
  }, [visible, assets, gradual]);

  // Monotonic: three's total grows as new loads queue, so the raw fraction
  // can dip -- the earth's grey only ever thins.
  useEffect(() => {
    if (visible && gradualScene) setLoaded((l) => Math.max(l, progress));
  }, [visible, gradualScene, progress]);

  // The others' grey climbs only while something is still loading in.
  useEffect(() => {
    if (!visible || !active) return;
    const id = setInterval(() => setLoadingFor((t) => t + BACKDROP_TICK_MS), BACKDROP_TICK_MS);
    return () => clearInterval(id);
  }, [visible, active]);

  return backdropOpacity(gradualScene, screen, loaded, loadingFor);
}
