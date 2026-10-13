import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPACT_QUERY,
  currentUiScale,
  rem,
  isCompactViewport,
  uiScale,
  UI_SCALE_BASELINE,
  UI_SCALE_MAX,
} from '@/lib/uiScale';

describe('uiScale', () => {
  it.each([
    // [w, h, scale] -- the viewports Mikael checks (CSS px)
    [956, 440, 1], // iPhone landscape
    [440, 956, 1], // iPhone portrait
    [410, 502, 1], // Apple Watch Ultra-sized window
    [800, 600, 1], // the reference look
    [1366, 1024, 1024 / 600], // iPad 13" landscape
    [1024, 1366, 1024 / 600], // iPad 13" portrait
    [2007, 2853, UI_SCALE_MAX], // the big portrait shots
  ])('%i x %i -> %f', (w, h, expected) => {
    expect(uiScale(w, h)).toBeCloseTo(expected, 5);
  });

  it('never goes under 1, and is 1 for a missing size', () => {
    expect(uiScale(100, 100)).toBe(1);
    expect(uiScale(0, 0)).toBe(1);
    expect(uiScale(NaN, 500)).toBe(1);
  });

  it('is 1 without a window (server-side)', () => {
    expect(currentUiScale()).toBe(1);
  });

  it('matches the root font size rule in globals.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toContain(`calc(min(100vw, 100vh) * 16 / ${UI_SCALE_BASELINE})`);
    expect(css).toContain(`${16 * UI_SCALE_MAX}px)`);
    expect(css).toContain(`@custom-variant compact (@media ${COMPACT_QUERY});`);
  });
});

describe('isCompactViewport', () => {
  it('is the watch-sized window, never a phone', () => {
    expect(isCompactViewport(410, 502)).toBe(true);
    expect(isCompactViewport(956, 440)).toBe(false);
    expect(isCompactViewport(440, 956)).toBe(false);
    expect(isCompactViewport(375, 667)).toBe(false); // the smallest iPhone
    expect(isCompactViewport(0, 0)).toBe(false);
  });
});

describe('rem', () => {
  it('turns a design px size into rem', () => {
    expect(rem(16)).toBe('1rem');
    expect(rem(170)).toBe('10.625rem');
  });
});
