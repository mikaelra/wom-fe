import { describe, expect, it } from 'vitest';
import { bossfightSignSublabel } from '@/lib/bossfightSign';
import type { BossfightRoster, BossfightRosterPlayer } from '@/lib/api';

const occupant = (name: string, over: Partial<BossfightRosterPlayer> = {}): BossfightRosterPlayer => ({
  name, skin: null, alive: true, spectator: false, bot: false, ...over,
});

const roster = (over: Partial<BossfightRoster> = {}): BossfightRoster => ({
  lobby_id: 'bf1', round: 0, start_time: null, players: [], ...over,
});

describe('bossfightSignSublabel', () => {
  describe('an empty temple', () => {
    it('shows the countdown while one is running', () => {
      expect(bossfightSignSublabel(roster({ lobby_id: null }), 2, 5)).toBe('BOSSFIGHT IN 2:05');
    });

    it('says nothing once the countdown has run out', () => {
      // The old behaviour was IN PROGRESS, which claimed a fight was under
      // way in a building with nobody in it.
      expect(bossfightSignSublabel(roster({ lobby_id: null }), 0, 0)).toBeNull();
    });

    it('says nothing when there is no countdown to show either', () => {
      expect(bossfightSignSublabel(roster({ lobby_id: null }), null, null)).toBeNull();
    });

    it('still says nothing when a lobby exists but holds only Hades', () => {
      const onlyBoss = roster({ players: [occupant('Hades', { bot: true })] });
      expect(bossfightSignSublabel(onlyBoss, 0, 0)).toBeNull();
    });
  });

  describe('people waiting', () => {
    it('uses the singular for one', () => {
      expect(bossfightSignSublabel(roster({ players: [occupant('Ada')] }), null, null))
        .toBe('1 PLAYER WAITING');
    });

    it('uses the plural for more', () => {
      const three = roster({ players: [occupant('Ada'), occupant('Bo'), occupant('Cy')] });
      expect(bossfightSignSublabel(three, null, null)).toBe('3 PLAYERS WAITING');
    });

    it('beats a running countdown', () => {
      // A headcount tells a passer-by whether it is worth walking over;
      // the clock does not.
      expect(bossfightSignSublabel(roster({ players: [occupant('Ada')] }), 2, 5))
        .toBe('1 PLAYER WAITING');
    });
  });

  describe('a fight under way', () => {
    it('reports the headcount as playing once round 1 is dealt', () => {
      const started = roster({ round: 1, players: [occupant('Ada'), occupant('Bo')] });
      expect(bossfightSignSublabel(started, null, null)).toBe('2 PLAYERS PLAYING');
    });

    it('uses the singular for a lone fighter', () => {
      const started = roster({ round: 4, players: [occupant('Ada')] });
      expect(bossfightSignSublabel(started, null, null)).toBe('1 PLAYER PLAYING');
    });

    it('keeps counting the dead -- they are in the fight, not watching it', () => {
      const started = roster({
        round: 3, players: [occupant('Ada', { alive: false }), occupant('Bo')],
      });
      expect(bossfightSignSublabel(started, null, null)).toBe('2 PLAYERS PLAYING');
    });
  });

  describe('who counts', () => {
    it('never counts Hades, who is in the roster as a bot', () => {
      const withBoss = roster({ players: [occupant('Hades', { bot: true }), occupant('Ada')] });
      expect(bossfightSignSublabel(withBoss, null, null)).toBe('1 PLAYER WAITING');
    });

    it('never counts spectators -- waiting and playing are both about fighting', () => {
      const watched = roster({
        players: [occupant('Ada'), occupant('Zed', { spectator: true })],
      });
      expect(bossfightSignSublabel(watched, null, null)).toBe('1 PLAYER WAITING');
    });

    it('treats a temple of nothing but watchers as empty', () => {
      const watchersOnly = roster({ players: [occupant('Zed', { spectator: true })] });
      expect(bossfightSignSublabel(watchersOnly, 1, 30)).toBe('BOSSFIGHT IN 1:30');
    });
  });

  it('pads the seconds so the clock never reads 2:5', () => {
    expect(bossfightSignSublabel(roster({ lobby_id: null }), 10, 9)).toBe('BOSSFIGHT IN 10:09');
  });
});
