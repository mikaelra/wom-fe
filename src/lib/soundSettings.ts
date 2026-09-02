// Persisted audio preferences, all device-local (localStorage) rather than
// account-bound: which volume suits you depends on the machine and the room
// you are in, not on who you are logged in as.
//
// Mute and volume are kept as separate settings rather than folding mute
// into "volume 0". Muting is a thing you do for a moment and undo; if it
// wrote 0 over your level, unmuting would have to guess where to put the
// slider back. Holding both means the toggle never destroys the level.
const MUSIC_KEY = 'musicEnabled';
const SFX_KEY = 'sfxEnabled';
const MUSIC_VOLUME_KEY = 'musicVolume';
const SFX_VOLUME_KEY = 'sfxVolume';
const MUSIC_IN_BACKGROUND_KEY = 'musicInBackground';

/** Music's long-standing fixed level (music.ts used to hardcode 0.4), kept
 *  as the default so this change is silent for anyone who never opens the
 *  slider. */
export const DEFAULT_MUSIC_VOLUME = 0.4;
/** Sound effects are short and informational -- they sit under the music
 *  rather than over it, and the per-sound gains in sounds.ts are calibrated
 *  against this. */
export const DEFAULT_SFX_VOLUME = 0.7;

function readEnabled(key: string, fallback = true): boolean {
  if (typeof window === 'undefined') return fallback;
  const stored = localStorage.getItem(key);
  return stored === null ? fallback : stored === 'true';
}

/** A stored volume, clamped to 0..1 and falling back to `fallback` on
 *  anything unparseable -- a hand-edited or half-written localStorage value
 *  must never reach an <audio> element's .volume, which throws on out-of-
 *  range input and would take the whole scene down with it. */
function readVolume(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  const parsed = Number.parseFloat(stored);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function write(key: string, value: string): void {
  if (typeof window !== 'undefined') localStorage.setItem(key, value);
  listeners.forEach((listener) => listener());
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribes to changes in any of these settings -- fired on every write,
 *  regardless of which one changed, so callers just re-read whichever value
 *  they care about. */
export function subscribeSoundSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isMusicEnabled(): boolean {
  return readEnabled(MUSIC_KEY);
}

export function setMusicEnabled(enabled: boolean): void {
  write(MUSIC_KEY, String(enabled));
}

export function isSfxEnabled(): boolean {
  return readEnabled(SFX_KEY);
}

export function setSfxEnabled(enabled: boolean): void {
  write(SFX_KEY, String(enabled));
}

export function getMusicVolume(): number {
  return readVolume(MUSIC_VOLUME_KEY, DEFAULT_MUSIC_VOLUME);
}

export function setMusicVolume(volume: number): void {
  write(MUSIC_VOLUME_KEY, String(Math.min(1, Math.max(0, volume))));
}

export function getSfxVolume(): number {
  return readVolume(SFX_VOLUME_KEY, DEFAULT_SFX_VOLUME);
}

export function setSfxVolume(volume: number): void {
  write(SFX_VOLUME_KEY, String(Math.min(1, Math.max(0, volume))));
}

/** Whether music keeps playing once the tab is hidden -- the phone locked,
 *  the player switched apps, the tab went to the background.
 *
 *  Defaults to off, which is what music.ts has always done: mobile browsers
 *  exempt already-playing media from background-tab throttling, so without
 *  an explicit pause the loop just kept going after the screen locked,
 *  unlike everything else on the page. That surprises people, so it stays
 *  the default -- but it is a preference, not a law, and someone treating
 *  this as a music player wants the opposite. */
export function isMusicInBackgroundEnabled(): boolean {
  return readEnabled(MUSIC_IN_BACKGROUND_KEY, false);
}

export function setMusicInBackgroundEnabled(enabled: boolean): void {
  write(MUSIC_IN_BACKGROUND_KEY, String(enabled));
}
