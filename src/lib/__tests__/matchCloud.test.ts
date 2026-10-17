import { describe, expect, it } from 'vitest';
import {
  QUEUE_STALE_MS,
  RENEW_EVERY_MS,
  SEAT_MAX_AGE_MS,
  STILL_QUEUING_AFTER_MS,
  BOT_QUEUE_MAX_AGE_MS,
  askDue,
  clearQueue,
  questionLapsed,
  forgetBotQueue,
  readBotQueue,
  rememberBotQueue,
  countLine,
  forgetSeat,
  lobbyStartedCloud,
  onLobbyPage,
  rankedCloud,
  rankedSignSublabel,
  readDontAsk,
  readQueue,
  readSeat,
  rememberSeat,
  renewDue,
  resumable,
  shownCount,
  writeDontAsk,
  writeQueue,
  type RankedMatch,
} from '@/lib/matchCloud';

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

const match: RankedMatch = {
  lobbyId: 'R1',
  players: ['Oni', 'Skoober'],
  playerCount: 3,
  maxPlayers: 6,
  deadline: '2026-10-17T12:00:00Z',
  started: false,
};

describe('matchCloud', () => {
  describe('the headcount', () => {
    it('never shows fewer than 2', () => {
      expect(shownCount(0)).toBe(2);
      expect(shownCount(1)).toBe(2);
      expect(shownCount(4)).toBe(4);
      expect(countLine({ playerCount: 1, maxPlayers: 6 })).toBe('2/6');
      expect(countLine(match)).toBe('3/6');
    });
  });

  describe('the ranked cloud', () => {
    it('says you are in a lobby and who you are up against', () => {
      expect(rankedCloud(match, 20, false)).toEqual({
        header: 'Game found!',
        lines: ['You are currently in a lobby.', 'Against: Oni, Skoober'],
        action: 'Join Lobby',
      });
    });

    it('leaves out the opponents line before the roster has arrived', () => {
      expect(rankedCloud({ ...match, players: [] }, null, false).lines).toEqual(['You are currently in a lobby.']);
    });

    it('tapped, shows only the countdown and X/6, still with Join Lobby', () => {
      expect(rankedCloud(match, 12, true)).toEqual({ lines: ['Starts in 12s', '3/6'], action: 'Join Lobby' });
      expect(rankedCloud(match, null, true).lines[0]).toBe('Starting soon');
    });

    it('once started, says so with Join Game, tapped or not', () => {
      const started = { ...match, started: true };
      expect(rankedCloud(started, null, false)).toEqual({ lines: ['Game started.'], action: 'Join Game' });
      expect(rankedCloud(started, null, true)).toEqual({ lines: ['Game started.'], action: 'Join Game' });
    });
  });

  describe('the ranked signpost', () => {
    it('puts the countdown over the headcount', () => {
      expect(rankedSignSublabel(match, 9)).toBe('STARTS IN 9s\n3/6');
      expect(rankedSignSublabel({ ...match, playerCount: 1 }, null)).toBe('STARTING SOON\n2/6');
    });

    it('says GAME STARTED! once it has', () => {
      expect(rankedSignSublabel({ ...match, started: true }, null)).toBe('GAME STARTED!');
    });
  });

  it('gives bossfight and bot ranked a Join Lobby cloud', () => {
    expect(lobbyStartedCloud('bossfight')).toEqual({ lines: ['Bossfight started.'], action: 'Join Lobby' });
    expect(lobbyStartedCloud('bot_ranked')).toEqual({ lines: ['Bot ranked game started.'], action: 'Join Lobby' });
  });

  it('knows when the page shown is that lobby', () => {
    expect(onLobbyPage('/lobby', '?id=R1', 'R1')).toBe(true);
    expect(onLobbyPage('/lobby', '?id=R2', 'R1')).toBe(false);
    expect(onLobbyPage('/city', '?id=R1', 'R1')).toBe(false);
    expect(onLobbyPage(null, '', 'R1')).toBe(false);
  });

  describe('the stored queue', () => {
    it('round-trips and clears', () => {
      const s = memory();
      expect(readQueue(s)).toBeNull();
      writeQueue({ name: 'Oni', queuedAt: 1, heardAt: 2 }, s);
      expect(readQueue(s)).toEqual({ name: 'Oni', queuedAt: 1, heardAt: 2 });
      clearQueue(s);
      expect(readQueue(s)).toBeNull();
    });

    it('ignores junk', () => {
      const s = memory();
      s.setItem('wom.rankedQueue', '{not json');
      expect(readQueue(s)).toBeNull();
      s.setItem('wom.rankedQueue', JSON.stringify({ name: 'Oni' }));
      expect(readQueue(s)).toBeNull();
    });

    it('survives storage that throws', () => {
      const broken = {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {
          throw new Error('denied');
        },
      };
      expect(readQueue(broken)).toBeNull();
      expect(() => writeQueue({ name: 'Oni', queuedAt: 1, heardAt: 1 }, broken)).not.toThrow();
      expect(() => clearQueue(broken)).not.toThrow();
    });

    it('resumes only while the server still holds it', () => {
      const q = { name: 'Oni', queuedAt: 0, heardAt: 1000 };
      expect(resumable(q, 1000 + QUEUE_STALE_MS - 1)).toBe(true);
      expect(resumable(q, 1000 + QUEUE_STALE_MS)).toBe(false);
      expect(resumable(null, 0)).toBe(false);
    });

    it('asks after 30 minutes, once, unless told not to', () => {
      const q = { name: 'Oni', queuedAt: 0, heardAt: 0 };
      expect(askDue(q, STILL_QUEUING_AFTER_MS - 1, false)).toBe(false);
      expect(askDue(q, STILL_QUEUING_AFTER_MS, false)).toBe(true);
      expect(askDue({ ...q, askedAt: STILL_QUEUING_AFTER_MS }, STILL_QUEUING_AFTER_MS + 5, false)).toBe(false);
      expect(askDue(q, STILL_QUEUING_AFTER_MS, true)).toBe(false);
    });

    it('renews every 30 seconds, for 30 more minutes while the question is open', () => {
      const q = { name: 'Oni', queuedAt: 0, heardAt: 0 };
      expect(RENEW_EVERY_MS).toBe(30_000);
      expect(renewDue(q, RENEW_EVERY_MS - 1)).toBe(false);
      expect(renewDue(q, RENEW_EVERY_MS)).toBe(true);
      expect(renewDue({ ...q, askedAt: 0 }, STILL_QUEUING_AFTER_MS - 1)).toBe(true);
      expect(renewDue({ ...q, askedAt: 0 }, STILL_QUEUING_AFTER_MS)).toBe(false);
    });

    it('counts an unanswered question as lapsed once the server has dropped it', () => {
      const q = { name: 'Oni', queuedAt: 0, heardAt: 0, askedAt: 0 };
      expect(questionLapsed(q, STILL_QUEUING_AFTER_MS + QUEUE_STALE_MS - 1)).toBe(false);
      expect(questionLapsed(q, STILL_QUEUING_AFTER_MS + QUEUE_STALE_MS)).toBe(true);
      expect(questionLapsed({ name: 'Oni', queuedAt: 0, heardAt: 0 }, 10 ** 9)).toBe(false);
    });

    it('lets go of the queue two minutes after the app went away', () => {
      expect(QUEUE_STALE_MS).toBe(120_000);
    });

    it('remembers "do not ask me again"', () => {
      const s = memory();
      expect(readDontAsk(s)).toBe(false);
      writeDontAsk(s);
      expect(readDontAsk(s)).toBe(true);
    });
  });

  describe('the bot-ranked queue', () => {
    it('is remembered until its stale time, and forgotten', () => {
      const s = memory();
      expect(readBotQueue(0, s)).toBe(false);
      rememberBotQueue(0, s);
      expect(readBotQueue(BOT_QUEUE_MAX_AGE_MS, s)).toBe(true);
      expect(readBotQueue(BOT_QUEUE_MAX_AGE_MS + 1, s)).toBe(false);
      forgetBotQueue(s);
      expect(readBotQueue(1, s)).toBe(false);
    });
  });

  describe('the seat', () => {
    it('is remembered and read back', () => {
      const s = memory();
      rememberSeat('bossfight', 'B1', 100, s);
      expect(readSeat(200, s)).toEqual({ kind: 'bossfight', lobbyId: 'B1', at: 100 });
    });

    it('goes stale after a couple of hours', () => {
      const s = memory();
      rememberSeat('bot_ranked', 'A1', 0, s);
      expect(readSeat(SEAT_MAX_AGE_MS, s)).not.toBeNull();
      expect(readSeat(SEAT_MAX_AGE_MS + 1, s)).toBeNull();
    });

    it('is forgotten only for its own lobby', () => {
      const s = memory();
      rememberSeat('bossfight', 'B2', 0, s);
      forgetSeat('B1', s);
      expect(readSeat(1, s)?.lobbyId).toBe('B2');
      forgetSeat('B2', s);
      expect(readSeat(1, s)).toBeNull();
    });

    it('ignores junk', () => {
      const s = memory();
      s.setItem('wom.seatedLobby', JSON.stringify({ kind: 'ranked', lobbyId: 'X', at: 0 }));
      expect(readSeat(1, s)).toBeNull();
    });
  });
});
