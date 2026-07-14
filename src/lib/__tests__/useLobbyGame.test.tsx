import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLobbyGame } from '@/lib/useLobbyGame';
import type { LobbyState, Player } from '@/types/game';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    name: 'Alice',
    hp: 5,
    coins: 0,
    attackDamage: 1,
    alive: true,
    admin: false,
    spectator: false,
    bot: false,
    boss: false,
    lost_soul: null,
    title: null,
    idle_rounds: 0,
    pending_relic_nudge: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<LobbyState> = {}): LobbyState {
  return {
    round: 1,
    players: [makePlayer()],
    winner: null,
    wellwinner: null,
    pending_deny: null,
    deny_target: null,
    readyPlayers: [],
    history: [],
    round_end_time: null,
    boss_fight: false,
    start_time: null,
    gameover: false,
    chat: [],
    ...overrides,
  };
}

describe('useLobbyGame phase', () => {
  it('is loading when state is null', () => {
    const { result } = renderHook(() => useLobbyGame(null, 'Alice'));
    expect(result.current.phase).toBe('loading');
  });

  it('is lobby when round is 0', () => {
    const { result } = renderHook(() => useLobbyGame(makeState({ round: 0 }), 'Alice'));
    expect(result.current.phase).toBe('lobby');
  });

  it('is playing when round > 0 and not over', () => {
    const { result } = renderHook(() => useLobbyGame(makeState({ round: 2 }), 'Alice'));
    expect(result.current.phase).toBe('playing');
  });

  it('is gameover when gameover is true, even mid-round', () => {
    const { result } = renderHook(() =>
      useLobbyGame(makeState({ round: 3, gameover: true }), 'Alice')
    );
    expect(result.current.phase).toBe('gameover');
  });
});

describe('useLobbyGame player lookups', () => {
  it('finds my player and admin/alive status', () => {
    const state = makeState({ players: [makePlayer({ name: 'Alice', admin: true, hp: 3 })] });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));

    expect(result.current.myPlayer?.name).toBe('Alice');
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isAlive).toBe(true);
  });

  it('myPlayer is undefined and isAlive/isAdmin are false when not in the lobby', () => {
    const state = makeState({ players: [makePlayer({ name: 'Bob' })] });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));

    expect(result.current.myPlayer).toBeUndefined();
    expect(result.current.isAlive).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });

  it('isAlive is false once hp reaches 0', () => {
    const state = makeState({ players: [makePlayer({ name: 'Alice', hp: 0 })] });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.isAlive).toBe(false);
  });

  it('finds the boss as enemy', () => {
    const state = makeState({
      players: [makePlayer({ name: 'Alice' }), makePlayer({ name: 'Hades', boss: true })],
    });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.enemy?.name).toBe('Hades');
  });

  it('enemy is undefined when there is no boss', () => {
    const { result } = renderHook(() => useLobbyGame(makeState(), 'Alice'));
    expect(result.current.enemy).toBeUndefined();
  });
});

describe('useLobbyGame readiness and winners', () => {
  it('isReady reflects readyPlayers', () => {
    const state = makeState({ readyPlayers: ['Alice'] });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.isReady).toBe(true);

    const { result: notReady } = renderHook(() => useLobbyGame(makeState(), 'Alice'));
    expect(notReady.current.isReady).toBe(false);
  });

  it('keeps winner and wellWinner distinct', () => {
    const state = makeState({ winner: 'Alice', wellwinner: 'Bob' });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.winner).toBe('Alice');
    expect(result.current.wellWinner).toBe('Bob');
  });
});

describe('useLobbyGame deny logic', () => {
  it('isDenied is true when I am the deny target', () => {
    const state = makeState({ deny_target: 'Alice' });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.isDenied).toBe(true);
  });

  it('isPendingDenyChooser is true when I hold the pending deny', () => {
    const state = makeState({ pending_deny: 'Alice' });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.pendingDenyName).toBe('Alice');
    expect(result.current.isPendingDenyChooser).toBe(true);
  });

  it('eligibleDenyTargets excludes self and the dead', () => {
    const state = makeState({
      players: [
        makePlayer({ name: 'Alice' }),
        makePlayer({ name: 'Bob', hp: 3 }),
        makePlayer({ name: 'Charlie', hp: 0 }),
      ],
    });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.eligibleDenyTargets.map((p) => p.name)).toEqual(['Bob']);
  });
});

describe('useLobbyGame canAct', () => {
  it('is true for an alive, non-spectator player mid-round with no denial and no game over', () => {
    const state = makeState({ round: 2, players: [makePlayer({ name: 'Alice', hp: 5 })] });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.canAct).toBe(true);
  });

  it('is false before the game has started (round 0)', () => {
    const state = makeState({ round: 0 });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.canAct).toBe(false);
  });

  it('is false once the game is over', () => {
    const state = makeState({ round: 3, gameover: true });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.canAct).toBe(false);
  });

  it('is false when dead', () => {
    const state = makeState({ round: 2, players: [makePlayer({ name: 'Alice', hp: 0 })] });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.canAct).toBe(false);
  });

  it('is false for a spectator', () => {
    const state = makeState({ round: 2, players: [makePlayer({ name: 'Alice', spectator: true })] });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.canAct).toBe(false);
  });

  it('is false when denied this round', () => {
    const state = makeState({ round: 2, deny_target: 'Alice' });
    const { result } = renderHook(() => useLobbyGame(state, 'Alice'));
    expect(result.current.canAct).toBe(false);
  });
});
