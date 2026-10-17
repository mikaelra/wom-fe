// Muted players: their chat messages (lobby and market) are hidden but for
// their latest, which stays (dimmed) so it can be tapped to unmute; and a
// mute symbol shows beside them in the player lists. Kept on this device
// only, by name -- the backend never hears about it. Unmuted from that
// message, or Settings -> Muted players.

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

/** Chat messages with each muted player's reduced to their latest one --
 *  left in place (shown dimmed, with the mute symbol) so it can be tapped
 *  to unmute them. */
export function hideMuted<T extends { sender: string }>(messages: readonly T[], muted: ReadonlySet<string>): T[] {
  if (!muted.size) return [...messages];
  const latest = new Map<string, number>();
  messages.forEach((m, i) => {
    if (muted.has(m.sender)) latest.set(m.sender, i);
  });
  return messages.filter((m, i) => !muted.has(m.sender) || latest.get(m.sender) === i);
}
