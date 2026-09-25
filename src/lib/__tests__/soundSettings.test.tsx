import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  getMusicVolume,
  getSfxVolume,
  isMusicEnabled,
  isMusicInBackgroundEnabled,
  isSfxEnabled,
  setMusicEnabled,
  setMusicInBackgroundEnabled,
  setMusicVolume,
  setSfxEnabled,
  setSfxVolume,
  subscribeSoundSettings,
} from '@/lib/soundSettings';

beforeEach(() => {
  localStorage.clear();
});

describe('soundSettings defaults', () => {
  it('plays music and effects for a player who has never touched the toggles', () => {
    expect(isMusicEnabled()).toBe(true);
    expect(isSfxEnabled()).toBe(true);
  });

  it('defaults music to its long-standing fixed level', () => {
    expect(getMusicVolume()).toBe(DEFAULT_MUSIC_VOLUME);
    expect(getSfxVolume()).toBe(DEFAULT_SFX_VOLUME);
  });

  // The pause-on-hide behaviour predates the setting, so leaving it on is
  // what keeps this change invisible to everyone who does not want it.
  it('leaves background playback off by default', () => {
    expect(isMusicInBackgroundEnabled()).toBe(false);
  });
});

describe('soundSettings persistence', () => {
  it('round-trips each setting through localStorage', () => {
    setMusicEnabled(false);
    setSfxEnabled(false);
    setMusicVolume(0.25);
    setSfxVolume(0.9);
    setMusicInBackgroundEnabled(true);

    expect(isMusicEnabled()).toBe(false);
    expect(isSfxEnabled()).toBe(false);
    expect(getMusicVolume()).toBe(0.25);
    expect(getSfxVolume()).toBe(0.9);
    expect(isMusicInBackgroundEnabled()).toBe(true);
  });

  it('keeps the volume when muting, so unmuting restores the level', () => {
    setMusicVolume(0.6);
    setMusicEnabled(false);
    expect(getMusicVolume()).toBe(0.6);
    setMusicEnabled(true);
    expect(getMusicVolume()).toBe(0.6);
  });
});

// A bad value here reaches an <audio> element's .volume, which throws on
// anything outside 0..1 -- that would take down whatever is rendering.
describe('soundSettings volume clamping', () => {
  it('clamps values written above or below the range', () => {
    setMusicVolume(5);
    expect(getMusicVolume()).toBe(1);
    setMusicVolume(-3);
    expect(getMusicVolume()).toBe(0);
  });

  it('clamps a hand-edited out-of-range value on read', () => {
    localStorage.setItem('sfxVolume', '42');
    expect(getSfxVolume()).toBe(1);
    localStorage.setItem('sfxVolume', '-42');
    expect(getSfxVolume()).toBe(0);
  });

  it('falls back to the default on an unparseable stored value', () => {
    localStorage.setItem('musicVolume', 'loud');
    expect(getMusicVolume()).toBe(DEFAULT_MUSIC_VOLUME);
    localStorage.setItem('musicVolume', '');
    expect(getMusicVolume()).toBe(DEFAULT_MUSIC_VOLUME);
  });
});

describe('subscribeSoundSettings', () => {
  it('notifies on every kind of change, not just the toggles', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSoundSettings(listener);

    setMusicEnabled(false);
    setMusicVolume(0.5);
    setSfxVolume(0.5);
    setMusicInBackgroundEnabled(true);
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    setMusicEnabled(true);
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
