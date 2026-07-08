import { describe, expect, it } from 'vitest';
import { parseCombatMessages } from '@/lib/parseCombatMessages';

/**
 * Fixtures mirror the exact strings emitted by the backend
 * (wom-be engine/combat.py). Until the string protocol is replaced with
 * structured events, these tests double as the contract between the repos —
 * if a backend message changes wording, the matching fixture here must too.
 */

const parse = (...lines: string[]) => parseCombatMessages([lines]);

describe('outgoing attacks', () => {
  it('parses a clean hit', () => {
    const result = parse('⚔ You attacked Bob. Bob lost ❤3.');
    expect(result.outgoing).toEqual({ target: 'Bob', outcome: 'hit', attackerDied: false });
  });

  it('parses an elimination with the coins received', () => {
    const result = parse(
      '⚔ You attacked Bob. Bob lost ❤3.',
      '💀 You eliminated Bob. You receive their 💰(5) and +1 ⚔. 💀',
    );
    expect(result.outgoing).toEqual({
      target: 'Bob',
      outcome: 'hit',
      attackerDied: false,
      eliminated: true,
      coinsReceived: 5,
    });
  });

  it('parses a blocked attack', () => {
    const result = parse('⚔ You attacked Bob. Your attack was blocked. 🛡');
    expect(result.outgoing).toEqual({ target: 'Bob', outcome: 'blocked', attackerDied: false });
  });

  it('parses a reflected attack', () => {
    const result = parse(
      '⚔ You attacked Bob. Your attack was blocked. 🛡',
      '💥 AND reflected. You lose ❤3. 💥',
    );
    expect(result.outgoing).toEqual({ target: 'Bob', outcome: 'reflected', attackerDied: false });
  });

  it('parses dying to your own reflected attack', () => {
    const result = parse(
      '⚔ You attacked Bob. Your attack was blocked. 🛡',
      '💥 AND reflected. You lose ❤3. 💥',
      '💀 You died. 💀',
    );
    expect(result.outgoing).toEqual({ target: 'Bob', outcome: 'reflected', attackerDied: true });
  });

  it('parses an instakill', () => {
    const result = parse('💀 You instakilled Bob. 💀');
    expect(result.outgoing).toEqual({ target: 'Bob', outcome: 'instakill', attackerDied: false });
  });

  it('parses a blocked instakill', () => {
    const result = parse('🛡 Bob blocked your ruthless attack! 🛡');
    expect(result.outgoing).toEqual({
      target: 'Bob',
      outcome: 'instakill_blocked',
      attackerDied: false,
    });
  });
});

describe('incoming attacks', () => {
  it('parses a named hit with damage', () => {
    const result = parse('⚔ Alice attacked you. You lost ❤3.');
    expect(result.incoming).toEqual([
      { attacker: 'Alice', outcome: 'hit', attackerDied: false, damage: 3 },
    ]);
  });

  it('parses an anonymous hit', () => {
    const result = parse('⚔ Someone attacked you. You lost ❤2.');
    expect(result.incoming).toEqual([
      { attacker: null, outcome: 'hit', attackerDied: false, damage: 2 },
    ]);
  });

  it('parses a named blocked attack', () => {
    const result = parse('⚔ Alice attacked you. You blocked. 🛡');
    expect(result.incoming).toEqual([
      { attacker: 'Alice', outcome: 'blocked', attackerDied: false },
    ]);
  });

  it('parses reflecting an attack back and killing the attacker', () => {
    const result = parse(
      '⚔ Alice attacked you. You blocked. 🛡',
      '💥 AND reflected their attack. Alice lost ❤3. 💥',
      '💀 You eliminated Alice with your 🛡. You receive their 💰(4) and +1 ⚔. 💀',
    );
    expect(result.incoming).toEqual([
      { attacker: 'Alice', outcome: 'reflected_back', attackerDied: true, coinsReceived: 4 },
    ]);
  });

  it('learns the attacker name when an anonymous reflection kills', () => {
    const result = parse(
      '⚔ Someone attacked you. You blocked. 🛡',
      '💥 AND reflected their attack. Alice lost ❤3. 💥',
      '💀 You eliminated Alice with your 🛡. You receive their 💰(4) and +1 ⚔. 💀',
    );
    expect(result.incoming).toEqual([
      { attacker: 'Alice', outcome: 'reflected_back', attackerDied: true, coinsReceived: 4 },
    ]);
  });

  it('parses being instakilled', () => {
    const result = parse('💀 You were instakilled. 💀');
    expect(result.incoming).toEqual([
      { attacker: null, outcome: 'instakill', attackerDied: false },
    ]);
  });

  it('parses blocking an instakill', () => {
    const result = parse('😱 You were attacked with instakill, but 🛡blocked🛡 it! 😱');
    expect(result.incoming).toEqual([
      { attacker: null, outcome: 'instakill_blocked', attackerDied: false },
    ]);
  });

  it('KNOWN QUIRK: the backend anonymous-block message has a double space and mismatches', () => {
    // wom-be emits "⚔  Someone attacked you. You blocked. 🛡" (two spaces
    // after ⚔), so the parser's exact-match anonymous branch never fires and
    // the named-attacker regex captures " Someone" as a player name instead
    // of yielding attacker: null. Pinned here as documentation of the string
    // protocol's fragility — goes away when combat events become structured.
    const result = parse('⚔  Someone attacked you. You blocked. 🛡');
    expect(result.incoming).toEqual([
      { attacker: ' Someone', outcome: 'blocked', attackerDied: false },
    ]);
  });
});

describe('witnessed eliminations', () => {
  it('parses a witnessed elimination', () => {
    const result = parse('💀 Alice eliminated Bob. 💀');
    expect(result.witnessedEliminations).toEqual([{ attacker: 'Alice', victim: 'Bob' }]);
  });
});

describe('mixed rounds', () => {
  it('collects outgoing, incoming and witness events from one round', () => {
    const result = parseCombatMessages([
      ['You got 1 💰.'], // resource line — ignored
      ['⚔ You attacked Bob. Bob lost ❤2.'],
      ['⚔ Carol attacked you. You lost ❤1.'],
      ['💀 Dave eliminated Erin. 💀'],
      ['👑 You won The Well!'], // well line — ignored
    ]);
    expect(result.outgoing?.target).toBe('Bob');
    expect(result.incoming).toHaveLength(1);
    expect(result.incoming[0].attacker).toBe('Carol');
    expect(result.witnessedEliminations).toEqual([{ attacker: 'Dave', victim: 'Erin' }]);
  });

  it('handles multiple incoming attacks in one round', () => {
    const result = parse(
      '⚔ Alice attacked you. You lost ❤2.',
      '⚔ Someone attacked you. You lost ❤4.',
      '⚔ Carol attacked you. You blocked. 🛡',
    );
    expect(result.incoming).toHaveLength(3);
    expect(result.incoming.map((i) => i.outcome)).toEqual(['hit', 'hit', 'blocked']);
  });

  it('returns an empty result for no messages', () => {
    expect(parseCombatMessages([])).toEqual({
      incoming: [],
      witnessedEliminations: [],
    });
  });
});
