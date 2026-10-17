import { describe, expect, it } from 'vitest';
import { roundHits } from '@/lib/roundHits';
import type { GameEvent } from '@/lib/gameEvents';

const out = (target: string, outcome: string, extra: object = {}) =>
  ({ kind: 'outgoing', target, outcome, attackerDied: false, eliminated: false, ...extra }) as unknown as GameEvent;
const inc = (attacker: string, outcome: string, extra: object = {}) =>
  ({ kind: 'incoming', attacker, outcome, attackerDied: false, ...extra }) as unknown as GameEvent;

describe('roundHits', () => {
  it('puts a red number on whoever was hit and a blue 0 on whoever blocked', () => {
    const hits = roundHits([out('Toad', 'hit', { damage: 3 }), inc('Wolf', 'blocked'), inc('Owl', 'hit', { damage: 2 })], 'Oni');
    expect(hits.get('Toad')).toEqual([{ text: '-3', color: 'red' }]);
    expect(hits.get('Oni')).toEqual([
      { text: '0', color: 'blue' },
      { text: '-2', color: 'red' },
    ]);
  });

  it('shows a reflected attack on both sides, and no number for an instakill', () => {
    const hits = roundHits([out('Toad', 'reflected', { reflectDamage: 1 }), inc('Wolf', 'instakill')], 'Oni');
    expect(hits.get('Toad')).toEqual([{ text: '0', color: 'blue' }]);
    expect(hits.get('Oni')).toEqual([{ text: '-1', color: 'red' }]);
    expect(roundHits([out('Toad', 'instakill')], 'Oni').size).toBe(0);
  });

  it('is empty without events', () => {
    expect(roundHits(null, 'Oni').size).toBe(0);
  });
});
