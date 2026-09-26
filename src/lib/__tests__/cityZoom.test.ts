import { describe, expect, it } from 'vitest';
import {
  CITY_MIN_FOV, clampCityFov, fovAfterPinch, fovAfterWheel, rotateSpeedForFov,
} from '@/lib/cityZoom';

const MAX = 70;

describe('clampCityFov', () => {
  it('keeps the FOV between the zoom limit and the base FOV', () => {
    expect(clampCityFov(10, MAX)).toBe(CITY_MIN_FOV);
    expect(clampCityFov(90, MAX)).toBe(MAX);
    expect(clampCityFov(40, MAX)).toBe(40);
  });
});

describe('fovAfterWheel', () => {
  it('scrolling up zooms in, scrolling down zooms back out', () => {
    expect(fovAfterWheel(MAX, -100, MAX)).toBeLessThan(MAX);
    expect(fovAfterWheel(40, 100, MAX)).toBeGreaterThan(40);
  });

  it('never zooms out past the base FOV or in past the limit', () => {
    expect(fovAfterWheel(MAX, 5000, MAX)).toBe(MAX);
    expect(fovAfterWheel(CITY_MIN_FOV, -5000, MAX)).toBe(CITY_MIN_FOV);
  });
});

describe('fovAfterPinch', () => {
  it('spreading the fingers to twice the distance halves the FOV', () => {
    expect(fovAfterPinch(60, 100, 200, MAX)).toBeCloseTo(30);
  });

  it('pinching together zooms out, clamped at the base', () => {
    expect(fovAfterPinch(40, 200, 100, MAX)).toBe(MAX);
  });

  it('ignores a degenerate zero distance', () => {
    expect(fovAfterPinch(40, 0, 100, MAX)).toBe(40);
  });
});

describe('rotateSpeedForFov', () => {
  it('slows the drag in proportion to the zoom', () => {
    expect(rotateSpeedForFov(-0.35, MAX, MAX)).toBeCloseTo(-0.35);
    expect(rotateSpeedForFov(-0.35, 35, MAX)).toBeCloseTo(-0.175);
  });
});
