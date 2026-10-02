import { useEffect, useRef, useState } from 'react';
import { LOADING_SPEC, loopDuration } from '@/lib/loadingAnimation';

/** One whole loop of the loading animation, in ms. */
export const LOADING_LOOP_MS = loopDuration(LOADING_SPEC) * 1000;

/**
 * Holds a loading state for at least `minMs` (default: one whole loop of the
 * loading animation) once it has started, so content never cuts the
 * animation off mid-turn. Pass the raw "still loading" flag; render the
 * loading animation while this returns true. After the minimum it follows
 * `loading` straight away, and a wait that never started never shows.
 */
export function useMinimumLoading(loading: boolean, minMs = LOADING_LOOP_MS): boolean {
  const startedAt = useRef<number | null>(loading ? Date.now() : null);
  const [held, setHeld] = useState(loading);

  useEffect(() => {
    if (loading) {
      if (startedAt.current === null) startedAt.current = Date.now();
      setHeld(true);
      return;
    }
    if (startedAt.current === null) {
      setHeld(false);
      return;
    }
    const release = () => {
      startedAt.current = null;
      setHeld(false);
    };
    const remaining = minMs - (Date.now() - startedAt.current);
    if (remaining <= 0) {
      release();
      return;
    }
    const id = setTimeout(release, remaining);
    return () => clearTimeout(id);
  }, [loading, minMs]);

  return loading || held;
}
