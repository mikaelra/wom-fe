import { describe, expect, it, vi } from 'vitest';
import { rankedTopSign, RETURN_TO_MATCH } from '@/lib/rankedSign';

const arm = (label: string, sublabel: string | null = null) => ({ label, sublabel, enter: vi.fn() });

describe('rankedTopSign', () => {
  it('is RANKED, opening the fork, with no match on', () => {
    const fork = vi.fn();
    const sign = rankedTopSign(arm('RANKED', 'SEARCHING...'), arm('BOTS'), fork);
    expect(sign.label).toBe('RANKED');
    expect(sign.sublabels).toEqual(['SEARCHING...']);
    sign.onActivate();
    expect(fork).toHaveBeenCalled();
  });

  it('says RETURN TO MATCH with its countdown while a bot match waits, and goes straight back to it', () => {
    const bots = arm(RETURN_TO_MATCH, 'STARTS IN 22s');
    const sign = rankedTopSign(arm('RANKED', 'SEARCHING...'), bots, vi.fn());
    expect(sign).toMatchObject({ label: RETURN_TO_MATCH, sublabels: ['STARTS IN 22s'] });
    sign.onActivate();
    expect(bots.enter).toHaveBeenCalled();
  });

  it('does the same for a players match', () => {
    const players = arm(RETURN_TO_MATCH, 'GAME STARTED!');
    const sign = rankedTopSign(players, arm('BOTS'), vi.fn());
    expect(sign.sublabels).toEqual(['GAME STARTED!']);
    sign.onActivate();
    expect(players.enter).toHaveBeenCalled();
  });
});
