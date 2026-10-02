'use client';

import { useLoadingBackdrop, useLoadingOverlay } from '@/lib/useLoadingOverlay';
import LoadingMark from './LoadingMark';

/** The overlay's grey (CSS `grey`), as r, g, b. */
export const LOADING_OVERLAY_GREY = '128, 128, 128';

/**
 * The game's loading screen: the loading animation in the middle of the
 * screen, over a grey background, whenever anything is loading -- a screen
 * waiting on its content (<LoadingState>), an API call, or a scene's 3D
 * assets (see loadingTracker). Once up it stays for at least one whole loop
 * of the animation. The grey is opaque, except while a scene renders: then it
 * fades as more of the scene has loaded (useLoadingBackdrop), so the scene
 * comes through it. Mounted once, in the root layout.
 */
export default function LoadingOverlay() {
  const visible = useLoadingOverlay();
  const opacity = useLoadingBackdrop(visible);
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-label="Loading"
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: `rgba(${LOADING_OVERLAY_GREY}, ${opacity})`, transition: 'background-color 200ms linear' }}
    >
      <LoadingMark size={128} />
    </div>
  );
}
