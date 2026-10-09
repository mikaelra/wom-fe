import { describe, expect, it } from 'vitest';
import { playerMark } from '@/lib/playerThumbnail';

const human = { boss: false, lost_soul: null, bot: false, bot_type: null, skin: 'cherub_v1' };

describe('playerMark', () => {
  it("is a player's skin thumbnail, or the default frog's", () => {
    expect(playerMark(human)).toEqual({ url: '/skins/thumbnails/cherub_v1.png' });
    expect(playerMark({ ...human, skin: null })).toEqual({ url: '/skins/thumbnails/frog_green_v1.png' });
  });

  it('is an emoji for every bot', () => {
    expect(playerMark({ ...human, bot: true, boss: true })).toEqual({ emoji: '👹' });
    expect(playerMark({ ...human, bot: true, lost_soul: true })).toEqual({ emoji: '👻' });
    expect(playerMark({ ...human, bot: true, bot_type: 'TURTLE' })).toEqual({ emoji: '🐢' });
    expect(playerMark({ ...human, bot: true, bot_type: 'SHEEP' })).toEqual({ emoji: '🐑' });
    expect(playerMark({ ...human, bot: true, bot_type: 'WOLF' })).toEqual({ emoji: '🐺' });
    expect(playerMark({ ...human, bot: true, bot_type: 'OWL' })).toEqual({ emoji: '🦉' });
    expect(playerMark({ ...human, bot: true, bot_type: 'NEW' })).toEqual({ emoji: '🐢' });
    expect(playerMark({ ...human, bot: true })).toEqual({ emoji: '🤖' });
  });
});
