'use client';

import { useBackgroundLoading } from '@/lib/useBackgroundLoading';
import LoadingMark from './LoadingMark';

/**
 * The small loading mark in the bottom-right corner, shown while an API call
 * or a scene's 3D assets are loading in the background (see loadingTracker)
 * for longer than a moment. Hidden whenever a full <LoadingState> is already
 * on screen. Mounted once, in the root layout.
 */
export default function GlobalLoadingIndicator() {
  const loading = useBackgroundLoading();
  if (!loading) return null;
  return (
    <div role="status" aria-label="Loading" className="fixed bottom-4 right-4 z-[100] pointer-events-none">
      <LoadingMark size={48} />
    </div>
  );
}
