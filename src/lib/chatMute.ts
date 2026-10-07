// Muted players: their chat messages (lobby and market) are hidden, and a
// mute symbol shows beside them in the player lists. Kept on this device
// only, by name -- the backend never hears about it. Unmuted from
// Settings -> Muted players.

import { useSyncExternalStore } from 'react';

const KEY = 'wom_muted_players';
const EMPTY: ReadonlySet<string> = new Set();

let cachedRaw: string | null = null;
let cached: ReadonlySet<string> = EMPTY;
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The muted names, the same Set object until the list changes. */
export function getMutedPlayers(): ReadonlySet<string> {
  const raw = read();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      cached = new Set(Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []);
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

export function setMuted(name: string, muted: boolean): void {
  const next = new Set(getMutedPlayers());
  if (muted) next.add(name);
  else next.delete(name);
  try {
    localStorage.setItem(KEY, JSON.stringify([...next].sort()));
  } catch {
    return;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** The muted names, re-rendering when they change (here or in another tab). */
export function useMutedPlayers(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getMutedPlayers, () => EMPTY);
}

/** Chat messages without the muted players' ones. */
export function withoutMuted<T extends { sender: string }>(messages: readonly T[], muted: ReadonlySet<string>): T[] {
  return muted.size ? messages.filter((m) => !muted.has(m.sender)) : [...messages];
}
