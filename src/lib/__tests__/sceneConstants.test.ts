import { describe, expect, it } from 'vitest';
import {
  getBossPlayerPositions,
  getBossPosition,
  getCameraTargetPosition,
  getPlayerFrontPositions,
  getPlayerPositions,
  getResponsiveFov,
  radiusGrowthFactor,
  PLAYER_Y,
  SCENE_CENTER,
} from '@/lib/sceneConstants';
import { guideGlowClass } from '@/lib/guideHighlights';

const distanceFromCenter = ([x, , z]: [number, number, number]) => Math.hypot(x, z);

describe('getPlayerPositions', () => {
  it('seats everyone evenly on the base radius for up to 6 players', () => {
    const seats = getPlayerPositions(4);
    expect(seats).toHaveLength(4);
    for (const seat of seats) {
      expect(distanceFromCenter(seat.position)).toBeCloseTo(2.1, 5);
      expect(seat.position[1]).toBe(PLAYER_Y);
    }
    // Slot 0 faces the camera (z+)
    expect(seats[0].position[0]).toBeCloseTo(0, 5);
    expect(seats[0].position[2]).toBeCloseTo(2.1, 5);
  });

  it('widens the circle by 15% for every 6 players', () => {
    expect(distanceFromCenter(getPlayerPositions(7)[0].position)).toBeCloseTo(2.1 * 1.15, 5);
    expect(distanceFromCenter(getPlayerPositions(13)[0].position)).toBeCloseTo(2.1 * 1.3, 5);
  });
});

describe('boss layout', () => {
  it('puts the boss elevated on the far side', () => {
    const boss = getBossPosition();
    expect(boss.position[2]).toBeCloseTo(-2.1, 5);
    expect(boss.position[1]).toBeCloseTo(PLAYER_Y + 0.65, 5);
  });

  it('centers a single player opposite the boss', () => {
    const [seat] = getBossPlayerPositions(1);
    expect(seat.position[0]).toBeCloseTo(0, 5);
    expect(seat.position[2]).toBeCloseTo(2.1, 5);
  });

  it('spreads players symmetrically across the near half', () => {
    const [left, right] = getBossPlayerPositions(2);
    expect(left.position[0]).toBeCloseTo(-right.position[0], 5);
    expect(left.position[2]).toBeCloseTo(right.position[2], 5);
    expect(left.position[2]).toBeGreaterThan(0);
  });
});

describe('getPlayerFrontPositions', () => {
  it('pushes labels 0.6 units further out than the seats', () => {
    const [front] = getPlayerFrontPositions(4);
    expect(distanceFromCenter(front)).toBeCloseTo(2.7, 5);
  });
});

describe('responsive camera', () => {
  it('picks the fov by aspect ratio', () => {
    expect(getResponsiveFov(1600, 900)).toBe(82); // wide
    expect(getResponsiveFov(1200, 1000)).toBe(78); // landscape
    expect(getResponsiveFov(800, 1000)).toBe(75); // portrait
  });

  it('moves the camera closer on wide screens', () => {
    const wide = getCameraTargetPosition(1600, 900);
    const portrait = getCameraTargetPosition(800, 1000);
    expect(wide[2]).toBeLessThan(portrait[2]);
    expect(wide[1]).toBeGreaterThan(SCENE_CENTER[1]);
  });

  it('defaults to a radiusFactor of 1, unchanged from before the param existed', () => {
    expect(getCameraTargetPosition(1600, 900, 1)).toEqual(getCameraTargetPosition(1600, 900));
  });

  it('backs the camera off (and raises it) proportionally to radiusFactor', () => {
    const base = getCameraTargetPosition(1600, 900);
    const widened = getCameraTargetPosition(1600, 900, 1.3);
    expect(widened[2]).toBeCloseTo(base[2] * 1.3, 5);
    expect(widened[1] - SCENE_CENTER[1]).toBeCloseTo((base[1] - SCENE_CENTER[1]) * 1.3, 5);
  });
});

describe('radiusGrowthFactor', () => {
  it('stays at 1 for up to 6 players, then grows 15% for every 6 more', () => {
    expect(radiusGrowthFactor(1)).toBe(1);
    expect(radiusGrowthFactor(6)).toBe(1);
    expect(radiusGrowthFactor(7)).toBeCloseTo(1.15, 5);
    expect(radiusGrowthFactor(12)).toBeCloseTo(1.15, 5);
    expect(radiusGrowthFactor(13)).toBeCloseTo(1.3, 5);
  });
});

describe('guideGlowClass', () => {
  it('maps glow colours to css classes', () => {
    expect(guideGlowClass('blue')).toBe('guide-glow-blue');
    expect(guideGlowClass('gold')).toBe('guide-glow-gold');
    expect(guideGlowClass(undefined)).toBe('');
  });
});
