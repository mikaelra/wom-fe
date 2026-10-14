import { useSyncExternalStore } from 'react';

// A landscape screen with room for columns, though not a PC's width
// (lib/useWideScreen.ts): a Steam window on a scaled display, an iPad held
// sideways (Mikael, 2026-10-14). The LD battle lays itself out in columns
// there too (components/text/TextLobby.tsx). A phone on its side is under
// 500px tall, so it keeps its one column.
export const LANDSCAPE_QUERY = '(orientation: landscape) and (min-width: 768px) and (min-height: 500px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(LANDSCAPE_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

const isLandscape = () => window.matchMedia?.(LANDSCAPE_QUERY).matches ?? false;

/** True on a roomy landscape window; follows it as the window changes. */
export function useLandscapeLayout(): boolean {
  return useSyncExternalStore(subscribe, isLandscape, () => false);
}
