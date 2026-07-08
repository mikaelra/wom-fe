import { describe, expect, it } from 'vitest';
import { glowForReward, parseWellReward } from '@/lib/parseWellReward';

/**
 * Fixtures mirror the exact reward strings emitted by the backend
 * (wom-be engine/combat.py, Well phase). The backend inserts well messages
 * as one-element arrays, hence the nested fixtures.
 */

describe('parseWellReward', () => {
  it('parses 2_gold', () => {
    expect(parseWellReward([['📦 You got 2 💰!']])).toEqual([{ type: 'gold', count: 2 }]);
  });

  it('parses 2_hp', () => {
    expect(parseWellReward([['🤕 You got 2 ❤!']])).toEqual([{ type: 'health', count: 2 }]);
  });

  it('parses 1_hp_1_gold as two components', () => {
    expect(parseWellReward([['☘ You got 1 💰 and 1 ❤!']])).toEqual([
      { type: 'gold', count: 1 },
      { type: 'health', count: 1 },
    ]);
  });

  it('parses 2_hp_2_gold as two components', () => {
    expect(parseWellReward([['♦ You got 2 💰 and 2 ❤!']])).toEqual([
      { type: 'gold', count: 2 },
      { type: 'health', count: 2 },
    ]);
  });

  it('parses 1_atkdmg', () => {
    expect(parseWellReward([['🔫 You got +1 ⚔!']])).toEqual([{ type: 'sword', count: 1 }]);
  });

  it('parses deny_choice', () => {
    expect(parseWellReward([['🚫 Deny choice! 🚫']])).toEqual([{ type: 'deny', count: 1 }]);
  });

  it('parses instakill', () => {
    expect(
      parseWellReward([
        ['🔪 You found a poisoned dagger. Your next attack can be lethal. Choose wisely... 🔪'],
      ]),
    ).toEqual([{ type: 'instakill', count: 1 }]);
  });

  it('parses reveal_info', () => {
    expect(parseWellReward([['🔍 You got info! 🔎']])).toEqual([{ type: 'info', count: 1 }]);
  });

  it('parses steal_gold with per-victim amounts', () => {
    const result = parseWellReward([
      ['🏴‍☠️Steal-all!🏴‍☠️'],
      ['💸 You stole 3 💰 from Bob.'],
      ['💸 You stole 0 💰 from Carol.'],
    ]);
    expect(result).toEqual([
      {
        type: 'steal',
        count: 1,
        victims: [
          { name: 'Bob', amount: 3 },
          { name: 'Carol', amount: 0 },
        ],
      },
    ]);
  });

  it('ignores resource-button gains that share the reward wording', () => {
    // Plain button gains carry no whimsical prefix emoji and must not animate.
    expect(parseWellReward([['You got 1 ❤.'], ['You got 1 💰.']])).toEqual([]);
  });

  it('ignores unrelated combat messages', () => {
    expect(parseWellReward([['⚔ You attacked Bob. Bob lost ❤3.']])).toEqual([]);
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
