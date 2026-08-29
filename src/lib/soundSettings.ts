// Persisted on/off state for background music and in-game sound effects,
// independent of each other. Both default to on for players who've never
// touched the toggles (no localStorage entry yet).
const MUSIC_KEY = 'musicEnabled';
const SFX_KEY = 'sfxEnabled';

function readEnabled(key: string): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(key);
  return stored === null ? true : stored === 'true';
}

function writeEnabled(key: string, enabled: boolean): void {
  if (typeof window !== 'undefined') localStorage.setItem(key, String(enabled));
  listeners.forEach((listener) => listener());
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribes to changes in either setting -- fired on every toggle,
 *  regardless of which of the two changed, so callers just re-read
 *  whichever value they care about. */
export function subscribeSoundSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isMusicEnabled(): boolean {
  return readEnabled(MUSIC_KEY);
}

export function setMusicEnabled(enabled: boolean): void {
  writeEnabled(MUSIC_KEY, enabled);
}

export function isSfxEnabled(): boolean {
  return readEnabled(SFX_KEY);
}

export function setSfxEnabled(enabled: boolean): void {
  writeEnabled(SFX_KEY, enabled);
}
