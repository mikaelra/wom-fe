import { describe, expect, it } from 'vitest';
import { COMMON_SKINS, NORMAL_WHEEL_SKINS, skinColor, skinLabel, skinUrl } from '@/lib/frogSkins';

describe('skinUrl', () => {
  it('builds the model path', () => {
    expect(skinUrl('frog_green_v1')).toBe('/models/frogs/frog_green_v1.glb');
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
});

describe('skinLabel', () => {
  it('strips the frog_ prefix and _vN suffix, replacing underscores with spaces', () => {
    expect(skinLabel('frog_orange_cursed_v1')).toBe('orange cursed');
  });
});
