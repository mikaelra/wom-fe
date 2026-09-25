import { describe, expect, it } from 'vitest';
import { canAfford, costLabel, outputLabel, type TradeUpRule } from '@/lib/tradeUps';

const wheelRule: TradeUpRule = { cost: 5, output_kind: 'wheel', output: 'special' };
const skinRule: TradeUpRule = { cost: 5, output_kind: 'skin', output: 'frog_gold_v1' };

describe('costLabel', () => {
  it('uses the common skin display name', () => {
    expect(costLabel(wheelRule, 'frog_blue_v1')).toBe('5 × Bleak Blue');
  });

  it('capitalizes a rare skin, which has no display-name override', () => {
    expect(costLabel(skinRule, 'frog_silver_v1')).toBe('5 × Silver');
  });

  it('reflects the rarer, 20-copy rung', () => {
    const rule: TradeUpRule = { cost: 20, output_kind: 'skin', output: 'frog_bling_v1' };
    expect(costLabel(rule, 'frog_rainbow_v2')).toBe('20 × Rainbow');
  });
});

describe('outputLabel', () => {
  it('names a wheel output "Special Wheel"', () => {
    expect(outputLabel(wheelRule)).toBe('Special Wheel');
  });

  it('capitalizes a skin output', () => {
    expect(outputLabel(skinRule)).toBe('Gold');
  });
});

describe('canAfford', () => {
  it('is true when owned meets the cost exactly', () => {
    expect(canAfford(5, wheelRule)).toBe(true);
  });

  it('is true when owned exceeds the cost', () => {
    expect(canAfford(9, wheelRule)).toBe(true);
  });

  it('is false when owned falls short', () => {
    expect(canAfford(4, wheelRule)).toBe(false);
  });

  it('is false at zero copies', () => {
    expect(canAfford(0, wheelRule)).toBe(false);
  });
});
