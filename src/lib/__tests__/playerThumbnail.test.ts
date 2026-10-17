import { describe, expect, it } from 'vitest';
import { playerMark, shownPlayerName } from '@/lib/playerThumbnail';

const human = { boss: false, lost_soul: null, bot: false, bot_type: null, skin: 'cherub_v1' };

describe('playerMark', () => {
  it("is a player's 32x32 face, or the default frog's", () => {
    expect(playerMark(human)).toEqual({ url: '/pixel/cherub_v1.png' });
    expect(playerMark({ ...human, skin: null })).toEqual({ url: '/pixel/frog_green_v1.png' });
  });

  it('falls back to the rendered thumbnail for a skin with no face', () => {
    expect(playerMark({ ...human, skin: 'frog_future_v9' })).toEqual({ url: '/skins/thumbnails/frog_future_v9.png' });
  });

  it('is an emoji for every house bot, the ogre and the ghost', () => {
    expect(playerMark({ ...human, bot: true, boss: true })).toEqual({ emoji: '👹' });
    expect(playerMark({ ...human, bot: true, lost_soul: true })).toEqual({ emoji: '👻' });
    expect(playerMark({ ...human, bot: true, bot_type: 'TURTLE' })).toEqual({ emoji: '🐢' });
    expect(playerMark({ ...human, bot: true, bot_type: 'SHEEP' })).toEqual({ emoji: '🐑' });
    expect(playerMark({ ...human, bot: true, bot_type: 'WOLF' })).toEqual({ emoji: '🐺' });
    expect(playerMark({ ...human, bot: true, bot_type: 'OWL' })).toEqual({ emoji: '🦉' });
    expect(playerMark({ ...human, bot: true, bot_type: 'NEW' })).toEqual({ emoji: '🐢' });
  });

  it('is the robot frog for a My AI agent', () => {
    expect(playerMark({ ...human, bot: true })).toEqual({ url: '/pixel/frog_robot_v1.png' });
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
