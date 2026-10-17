import { useSyncExternalStore } from 'react';

// Whether the window is a PC's (a laptop or desktop): wide enough to lay a
// screen out in columns instead of one scrolling column, as the text lobby
// does (components/text/TextLobby.tsx). Tailwind's `lg` breakpoint.
export const WIDE_QUERY = '(min-width: 1024px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(WIDE_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

const isWide = () => window.matchMedia?.(WIDE_QUERY).matches ?? false;

/** True on a wide (PC) window; follows it as the window is resized. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, isWide, () => false);
}
