'use client';

import { useLoadingOverlay } from '@/lib/useLoadingOverlay';
import LoadingMark from './LoadingMark';

/**
 * The game's loading screen: the loading animation in the middle of the
 * screen, whenever anything is loading -- a screen waiting on its content
 * (<LoadingState>), an API call, or a scene's 3D assets (see loadingTracker).
 * Once up it stays for at least one whole loop of the animation. No
 * background: whatever is on screen stays in view behind it. Mounted once,
 * in the root layout.
 */
export default function LoadingOverlay() {
  const visible = useLoadingOverlay();
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-label="Loading"
      className="fixed inset-0 z-[1000] flex items-center justify-center"
    >
      <LoadingMark size={128} />
    </div>
  );
}
