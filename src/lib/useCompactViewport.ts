import { useSyncExternalStore } from 'react';
import { COMPACT_QUERY } from '@/lib/uiScale';

// Whether the window is tiny -- an Apple Watch-sized one (lib/uiScale.ts
// isCompactViewport) -- so a screen switches to its compact arrangement,
// as the text lobby does (components/text/TextLobby.tsx).

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(COMPACT_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

const isCompact = () => window.matchMedia?.(COMPACT_QUERY).matches ?? false;

/** True on a tiny window; follows it as the window is resized. */
export function useCompactViewport(): boolean {
  return useSyncExternalStore(subscribe, isCompact, () => false);
}
