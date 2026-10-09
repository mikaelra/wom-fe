import { describe, expect, it } from 'vitest';
import { playerThumbnailKey, playerThumbnailUrl } from '@/lib/playerThumbnail';

const human = { boss: false, lost_soul: null, bot: false, bot_type: null, skin: 'cherub_v1' };

describe('playerThumbnailKey', () => {
  it('is the skin worn, or the default frog', () => {
    expect(playerThumbnailKey(human)).toBe('cherub_v1');
    expect(playerThumbnailKey({ ...human, skin: null })).toBe('frog_green_v1');
  });

  it('is the boss, a Lost Soul, a house bot or a My AI agent like the 3D scene', () => {
    expect(playerThumbnailKey({ ...human, bot: true, boss: true })).toBe('hades_v4');
    expect(playerThumbnailKey({ ...human, bot: true, lost_soul: true })).toBe('lost_soul_v2');
    expect(playerThumbnailKey({ ...human, bot: true, bot_type: 'WOLF' })).toBe('wolfv01');
    expect(playerThumbnailKey({ ...human, bot: true, bot_type: 'NEW' })).toBe('turtlev01');
    expect(playerThumbnailKey({ ...human, bot: true })).toBe('frog_robot_v1');
  });

  it('points at the thumbnails folder', () => {
    expect(playerThumbnailUrl(human)).toBe('/skins/thumbnails/cherub_v1.png');
  });
});
