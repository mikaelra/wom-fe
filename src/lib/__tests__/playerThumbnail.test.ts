import { describe, expect, it } from 'vitest';
import { playerMark, shownPlayerName } from '@/lib/playerThumbnail';

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

describe('shownPlayerName', () => {
  it("drops the emoji at the end of Hades' and the Lost Soul's names", () => {
    expect(shownPlayerName({ name: 'Hades 👹', boss: true, lost_soul: null })).toBe('Hades');
    expect(shownPlayerName({ name: 'Lost Soul 👻', boss: false, lost_soul: true })).toBe('Lost Soul');
  });

  it("leaves everyone else's name as it is", () => {
    expect(shownPlayerName({ name: 'Frog 🐸', boss: false, lost_soul: null })).toBe('Frog 🐸');
  });
});
