import { describe, expect, it } from 'vitest';
import {
  combatFromEvents,
  glowForReward,
  wellRewardFromEvents,
  type GameEvent,
} from '@/lib/gameEvents';

/**
 * Fixtures mirror the event dicts wom-be emits (see its
 * tests/test_game_events.py) — the two suites pin the same contract from
 * either side.
 */

describe('combatFromEvents', () => {
  it('maps an outgoing hit', () => {
    const events: GameEvent[] = [
      { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false, damage: 3 },
    ];
    expect(combatFromEvents(events).outgoing).toEqual({
      target: 'Bob',
      outcome: 'hit',
      attackerDied: false,
      damage: 3,
    });
  });

  it('keeps elimination loot on the outgoing view', () => {
    const events: GameEvent[] = [
      {
        kind: 'outgoing',
        target: 'Bob',
        outcome: 'hit',
        attackerDied: false,
        eliminated: true,
        coinsReceived: 6,
      },
    ];
    const combat = combatFromEvents(events);
    expect(combat.outgoing?.eliminated).toBe(true);
    expect(combat.outgoing?.coinsReceived).toBe(6);
  });

  it('collects incoming attacks in order, named and anonymous', () => {
    const events: GameEvent[] = [
      { kind: 'incoming', attacker: 'Alice', outcome: 'hit', attackerDied: false, damage: 3 },
      { kind: 'incoming', attacker: null, outcome: 'blocked', attackerDied: false },
    ];
    expect(combatFromEvents(events).incoming).toEqual([
      { attacker: 'Alice', outcome: 'hit', attackerDied: false, damage: 3 },
      { attacker: null, outcome: 'blocked', attackerDied: false },
    ]);
  });

  it('maps a reflection kill with the revealed attacker and loot', () => {
    const events: GameEvent[] = [
      {
        kind: 'incoming',
        attacker: 'Alice',
        outcome: 'reflected_back',
        attackerDied: true,
        coinsReceived: 5,
      },
    ];
    const [inc] = combatFromEvents(events).incoming;
    expect(inc.attackerDied).toBe(true);
    expect(inc.attacker).toBe('Alice');
    expect(inc.coinsReceived).toBe(5);
  });

  it('carries reflectDamage through on both the outgoing and incoming views of a reflection', () => {
    const events: GameEvent[] = [
      { kind: 'outgoing', target: 'Bob', outcome: 'reflected', attackerDied: false, reflectDamage: 3 },
      { kind: 'incoming', attacker: 'Carol', outcome: 'reflected_back', attackerDied: false, reflectDamage: 2 },
    ];
    const combat = combatFromEvents(events);
    expect(combat.outgoing?.reflectDamage).toBe(3);
    expect(combat.incoming[0].reflectDamage).toBe(2);
  });

  it('maps witnessed eliminations', () => {
    const events: GameEvent[] = [{ kind: 'witness', attacker: 'Alice', victim: 'Bob' }];
    expect(combatFromEvents(events).witnessedEliminations).toEqual([
      { attacker: 'Alice', victim: 'Bob' },
    ]);
  });

  it('ignores well rewards and handles missing events', () => {
    const events: GameEvent[] = [
      { kind: 'well_reward', components: [{ type: 'gold', count: 2 }] },
    ];
    expect(combatFromEvents(events)).toEqual({ incoming: [], witnessedEliminations: [] });
    expect(combatFromEvents(undefined)).toEqual({ incoming: [], witnessedEliminations: [] });
    expect(combatFromEvents(null)).toEqual({ incoming: [], witnessedEliminations: [] });
  });
});

describe('wellRewardFromEvents', () => {
  it('returns the granted components', () => {
    const events: GameEvent[] = [
      { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false },
      {
        kind: 'well_reward',
        components: [
          { type: 'gold', count: 2 },
          { type: 'health', count: 2 },
        ],
      },
    ];
    expect(wellRewardFromEvents(events)).toEqual([
      { type: 'gold', count: 2 },
      { type: 'health', count: 2 },
    ]);
  });

  it('carries steal victims with per-player amounts', () => {
    const events: GameEvent[] = [
      {
        kind: 'well_reward',
        components: [
          {
            type: 'steal',
            count: 1,
            victims: [
              { name: 'Bob', amount: 3 },
              { name: 'Carol', amount: 0 },
            ],
          },
        ],
      },
    ];
    expect(wellRewardFromEvents(events)[0].victims).toEqual([
      { name: 'Bob', amount: 3 },
      { name: 'Carol', amount: 0 },
    ]);
  });

  it('is empty when the player did not win the well', () => {
    expect(wellRewardFromEvents([])).toEqual([]);
    expect(wellRewardFromEvents(undefined)).toEqual([]);
  });
});

describe('glowForReward', () => {
  it('common rewards get no glow', () => {
    expect(glowForReward([{ type: 'gold', count: 2 }])).toBeNull();
    expect(glowForReward([{ type: 'health', count: 2 }])).toBeNull();
    expect(
      glowForReward([
        { type: 'gold', count: 1 },
        { type: 'health', count: 1 },
      ]),
    ).toBeNull();
    expect(glowForReward([{ type: 'info', count: 1 }])).toBeNull();
  });

  it('rarity-3 rewards glow blue', () => {
    expect(glowForReward([{ type: 'sword', count: 1 }])).toBe('blue');
    expect(glowForReward([{ type: 'deny', count: 1 }])).toBe('blue');
    expect(
      glowForReward([
        { type: 'gold', count: 2 },
        { type: 'health', count: 2 },
      ]),
    ).toBe('blue');
  });

  it('steal glows purple and instakill glows gold', () => {
    expect(glowForReward([{ type: 'steal', count: 1, victims: [] }])).toBe('purple');
    expect(glowForReward([{ type: 'instakill', count: 1 }])).toBe('gold');
  });
});
