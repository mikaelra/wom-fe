import { beforeEach, describe, expect, it, vi } from 'vitest';

let created: FakeAudio[] = [];

class FakeAudio {
  src = '';
  loop = false;
  volume = 1;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor() {
    created.push(this);
  }
}

/** music.ts keeps ONE <audio> at module scope for the life of the page, so a
 *  second test in the same module registry would never construct another and
 *  would silently assert against the first test's element. Reload both
 *  modules per test instead -- soundSettings first, so the music module that
 *  follows subscribes to the same instance these tests write through. */
async function load() {
  vi.resetModules();
  const settings = await import('@/lib/soundSettings');
  const music = await import('@/lib/music');
  return { ...settings, ...music };
}

/** The element music.ts built on its first play. */
const el = () => created[0];

function hide(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  localStorage.clear();
  created = [];
  vi.stubGlobal('Audio', FakeAudio);
});

describe('playMusic', () => {
  it('loops the requested track', async () => {
    const m = await load();
    m.playMusic(m.HOME_MUSIC);
    expect(el().loop).toBe(true);
    expect(decodeURI(el().src)).toBe(m.HOME_MUSIC);
    expect(el().play).toHaveBeenCalled();
  });

  // The city scene had no music call at all, which is what made its toggle
  // look broken -- it was muting silence.
  it('exposes a distinct city track', async () => {
    const m = await load();
    expect(m.CITY_MUSIC).toBe('/audio/music/Main Theme.mp3');
    m.playMusic(m.CITY_MUSIC);
    expect(decodeURI(el().src)).toBe(m.CITY_MUSIC);
  });

  it('reuses the one element across a track change', async () => {
    const m = await load();
    m.playMusic(m.HOME_MUSIC);
    m.playMusic(m.CITY_MUSIC);
    expect(created).toHaveLength(1);
    expect(decodeURI(el().src)).toBe(m.CITY_MUSIC);
  });

  it('stays silent while music is muted', async () => {
    const m = await load();
    m.setMusicEnabled(false);
    m.playMusic(m.HOME_MUSIC);
    expect(el().play).not.toHaveBeenCalled();
  });
});

describe('music volume', () => {
  it('starts at the stored level rather than a hardcoded one', async () => {
    const m = await load();
    m.setMusicVolume(0.8);
    m.playMusic(m.HOME_MUSIC);
    expect(el().volume).toBeCloseTo(0.8, 5);
  });

  it('defaults to the level music always used to be fixed at', async () => {
    const m = await load();
    m.playMusic(m.HOME_MUSIC);
    expect(el().volume).toBeCloseTo(m.DEFAULT_MUSIC_VOLUME, 5);
  });

  it('follows the slider while a track is playing', async () => {
    const m = await load();
    m.playMusic(m.HOME_MUSIC);
    m.setMusicVolume(0.15);
    expect(el().volume).toBeCloseTo(0.15, 5);
  });

  it('pauses and resumes as the mute is toggled', async () => {
    const m = await load();
    m.playMusic(m.HOME_MUSIC);
    m.setMusicEnabled(false);
    expect(el().pause).toHaveBeenCalled();
    el().play.mockClear();
    m.setMusicEnabled(true);
    expect(el().play).toHaveBeenCalled();
  });
});

describe('playing in the background', () => {
  it('pauses when the tab is hidden by default', async () => {
    const m = await load();
    m.playMusic(m.HOME_MUSIC);
    hide(true);
    expect(el().pause).toHaveBeenCalled();
  });

  it('resumes when the tab comes back', async () => {
    const m = await load();
    m.playMusic(m.HOME_MUSIC);
    hide(true);
    el().play.mockClear();
    hide(false);
    expect(el().play).toHaveBeenCalled();
  });

  it('keeps playing when the player has asked it to', async () => {
    const m = await load();
    m.setMusicInBackgroundEnabled(true);
    m.playMusic(m.HOME_MUSIC);
    el().pause.mockClear();
    hide(true);
    expect(el().pause).not.toHaveBeenCalled();
  });

  it('does not override a mute set while the tab was away', async () => {
    const m = await load();
    m.playMusic(m.HOME_MUSIC);
    hide(true);
    m.setMusicEnabled(false);
    el().play.mockClear();
    hide(false);
    expect(el().play).not.toHaveBeenCalled();
  });
});
