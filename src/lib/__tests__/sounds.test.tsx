import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playCombatSound, playResourceSound } from '@/lib/sounds';
import { setSfxEnabled, setSfxVolume, DEFAULT_SFX_VOLUME } from '@/lib/soundSettings';

/** Every Audio the module under test constructed, in order. */
let created: { src: string; volume: number; play: ReturnType<typeof vi.fn> }[] = [];

class FakeAudio {
  src: string;
  volume = 1;
  play = vi.fn(() => Promise.resolve());
  constructor(src: string) {
    this.src = src;
    created.push(this as unknown as (typeof created)[number]);
  }
}

beforeEach(() => {
  localStorage.clear();
  created = [];
  vi.stubGlobal('Audio', FakeAudio);
});

const only = () => {
  expect(created).toHaveLength(1);
  return created[0];
};

describe('sound effect playback', () => {
  it('plays the mapped file for a combat event', () => {
    playCombatSound('attack_hit');
    expect(only().src).toBe('/sounds/resources/AttackHit.wav');
    expect(only().play).toHaveBeenCalled();
  });

  it('ignores an unknown combat event rather than throwing', () => {
    expect(() => playCombatSound('nonsense')).not.toThrow();
    expect(created).toHaveLength(0);
  });

  it('plays nothing at all while effects are muted', () => {
    setSfxEnabled(false);
    playCombatSound('attack_hit');
    playResourceSound('gain_hp');
    expect(created).toHaveLength(0);
  });
});

// The reported bug: the sword-upgrade sound was overpowering everything
// else. It is the only asset that reaches full scale (peak 1.0) and it runs
// 2.08s against its siblings' 0.12s/0.16s, so it has to come down further
// than a peak match alone would suggest.
describe('per-asset gain', () => {
  it('cuts the upgrade sound well below the other resource sounds', () => {
    setSfxVolume(1);
    playResourceSound('gain_attack');
    const atk = only().volume;

    created = [];
    playResourceSound('gain_hp');
    const hp = only().volume;

    expect(atk).toBeLessThan(hp);
    expect(atk).toBeCloseTo(0.45, 5);
  });

  it('levels the three resource sounds against each other', () => {
    setSfxVolume(1);
    playResourceSound('gain_coin');
    const coin = only().volume;
    created = [];
    playResourceSound('gain_hp');
    const hp = only().volume;

    // GetCoin peaks at 0.758 against GetHp's 0.570, so it is pulled down to
    // land on it: 0.758 * 0.75 ~= 0.57.
    expect(coin * 0.758).toBeCloseTo(hp * 0.570, 2);
  });

  it('leaves the already-quiet attack sounds untouched', () => {
    setSfxVolume(1);
    playCombatSound('attack_blocked');
    expect(only().volume).toBe(1);
  });
});

describe('sfx volume', () => {
  it('scales a sound by the player volume', () => {
    setSfxVolume(0.5);
    playCombatSound('attack_hit');
    expect(only().volume).toBeCloseTo(0.5, 5);
  });

  it('compounds the player volume with the asset gain', () => {
    setSfxVolume(0.5);
    playResourceSound('gain_attack');
    expect(only().volume).toBeCloseTo(0.45 * 0.5, 5);
  });

  it('uses the default volume when the player has never set one', () => {
    playCombatSound('attack_hit');
    expect(only().volume).toBeCloseTo(DEFAULT_SFX_VOLUME, 5);
  });

  it('never hands .volume a value outside 0..1, which would throw', () => {
    localStorage.setItem('sfxVolume', '999');
    playResourceSound('gain_hp');
    expect(only().volume).toBeLessThanOrEqual(1);
    expect(only().volume).toBeGreaterThanOrEqual(0);
  });

  it('survives a browser that refuses to play', () => {
    vi.stubGlobal('Audio', class {
      constructor() { throw new Error('blocked by autoplay policy'); }
    });
    expect(() => playCombatSound('attack_hit')).not.toThrow();
  });
});
