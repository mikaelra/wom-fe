import { describe, expect, it } from 'vitest';
import { COMMON_SKINS, NORMAL_WHEEL_SKINS, skinColor, skinLabel, skinUrl } from '@/lib/frogSkins';

describe('skinUrl', () => {
  it('builds the model path', () => {
    expect(skinUrl('frog_green_v1')).toBe('/models/frogs/frog_green_v1.glb');
  });

  it('routes Cherub to its own asset instead of the frogs/ pattern (§3.4/§8.3)', () => {
    expect(skinUrl('cherub_v1')).toBe('/models/cherub-v01.glb');
  });
});

describe('NORMAL_WHEEL_SKINS', () => {
  it('excludes green (everyone already owns it) and includes every other common skin', () => {
    expect(NORMAL_WHEEL_SKINS).not.toContain('frog_green_v1');
    expect(NORMAL_WHEEL_SKINS).toHaveLength(COMMON_SKINS.length - 1);
  });
});

describe('skinColor', () => {
  it('returns a distinct color for a known skin', () => {
    expect(skinColor('frog_green_v1')).toBe('#22c55e');
  });

  it('falls back to a default color for an unknown skin', () => {
    expect(skinColor('frog_mystery_v99')).toBe('#6b7280');
  });

  it('has a color for Cherub', () => {
    expect(skinColor('cherub_v1')).toBe('#fef08a');
  });
});

describe('skinLabel', () => {
  it.each([
    ['frog_green_v1', 'OG Green'],
    ['frog_blue_v1', 'Bleak Blue'],
    ['frog_orange_cursed_v1', 'Cursed Orange'],
    ['frog_pink_v1', 'Pretty Pink'],
    ['frog_purple_v1', 'Ponder Purple'],
    ['frog_red_v1', 'Zonked Red'],
    ['frog_yellow_v1', 'Yucky Yellow'],
  ])('gives %s the fun display name "%s"', (skin, name) => {
    expect(skinLabel(skin)).toBe(name);
  });

  it('falls back to a derived label (frog_ prefix/_vN suffix stripped) for a skin with no custom name', () => {
    expect(skinLabel('frog_gold_v1')).toBe('gold');
  });

  it('gives Cherub its own display name, not a derived one', () => {
    expect(skinLabel('cherub_v1')).toBe('Cherub');
  });
});
