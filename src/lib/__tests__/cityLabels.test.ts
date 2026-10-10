import { describe, expect, it } from 'vitest';
import { inMarketLabel, playingLabel } from '@/lib/cityLabels';

describe('city labels', () => {
  it('counts players, and says nothing for nobody', () => {
    expect(playingLabel(3)).toBe('3 playing');
    expect(playingLabel(0)).toBeNull();
    expect(inMarketLabel(1)).toBe('1 in market');
    expect(inMarketLabel(0)).toBeNull();
  });
});
