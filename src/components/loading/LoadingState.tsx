'use client';

import { useEffect } from 'react';
import { claimLoadingScreen } from '@/lib/loadingTracker';
import LoadingMark from './LoadingMark';

/**
 * A "this is loading" state: the loading mark, centered in a status region.
 * Use it wherever a screen, scene or panel waits for its content. While it is
 * mounted the small corner indicator (<GlobalLoadingIndicator>) stays hidden,
 * so the two never show at once.
 */
export default function LoadingState({
  label = 'Loading',
  size = 96,
  className = 'py-12',
}: {
  /** What is loading, for screen readers (e.g. "Loading lobby…"). */
  label?: string;
  size?: number;
  /** Classes for the centering wrapper (padding, height, background). */
  className?: string;
}) {
  useEffect(() => claimLoadingScreen(), []);
  return (
    <div role="status" aria-label={label} className={`flex items-center justify-center ${className}`}>
      <LoadingMark size={size} label={label} />
    </div>
  );
}
