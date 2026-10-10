'use client';

import { useEffect } from 'react';
import { claimLoadingScreen } from '@/lib/loadingTracker';

/**
 * "This is still loading": render it in place of content that isn't there
 * yet (a page, scene or panel). It draws nothing itself -- while it is
 * mounted the loading overlay (<LoadingOverlay>) covers the screen with the
 * loading animation -- and leaves a status for screen readers.
 */
export default function LoadingState({ label = 'Loading' }: { label?: string }) {
  useEffect(() => claimLoadingScreen(), []);
  return <div role="status" aria-label={label} className="sr-only" />;
}
