'use client';

import { useLoadingOverlay } from '@/lib/useLoadingOverlay';
import LoadingMark from './LoadingMark';

/** The overlay's background: plain grey, opaque, so nothing shows behind the
 *  animation until it has played its turn. */
export const LOADING_OVERLAY_BACKGROUND = 'grey';

/**
 * The game's loading screen: the loading animation in the middle of the
 * screen, over a grey background, whenever anything is loading -- a screen
 * waiting on its content (<LoadingState>), an API call, or a scene's 3D
 * assets (see loadingTracker). Once up it stays for at least one whole loop
 * of the animation. Mounted once, in the root layout.
 */
export default function LoadingOverlay() {
  const visible = useLoadingOverlay();
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-label="Loading"
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: LOADING_OVERLAY_BACKGROUND }}
    >
      <LoadingMark size={128} />
    </div>
  );
}
