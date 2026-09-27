import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimewarpFx, type TimewarpRun } from '@/lib/useTimewarpFx';
import { _resetSkyCache, getSky, setSkyRevertOverride } from '@/lib/astrology';
import { skyDrift, skyStep, BASE_SKY_STEP } from '@/lib/skyDrift';
import { TIMEWARP_DURATION_MS, timewarpFxState, SPIN_UP_MS, SCRUB_END_MS } from '@/lib/timewarpFx';

const TO = new Date('2028-10-03T12:00:00Z');
const run = (over: Partial<TimewarpRun> = {}): TimewarpRun => ({
  spec: { colors: ['#a855f7'], to: TO, events: [{ kind: 'full_moon', key: '', bodies: ['Moon'] }] },
  from: 'now',
  hold: false,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
  _resetSkyCache();
});

afterEach(() => {
  vi.useRealTimers();
  _resetSkyCache();
  skyDrift.boost = 0;
});

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('useTimewarpFx', () => {
  it('does nothing without a run', () => {
    const { result } = renderHook(() => useTimewarpFx(null, 0));
    expect(result.current.playing).toBe(false);
    expect(skyDrift.boost).toBe(0);
  });

  it('spins the sky up, runs it through time to `to`, and lets go at the end', () => {
    const start = Date.now();
    const r = run();
    const { result } = renderHook(() => useTimewarpFx(r, 0));
    expect(result.current.playing).toBe(true);

    advance(SPIN_UP_MS);
    expect(skyDrift.boost).toBeGreaterThan(50);
    expect(skyStep()).toBeLessThan(BASE_SKY_STEP * 50);
    expect(timewarpFxState.glow).toBeGreaterThan(0.9);
    expect(timewarpFxState.colors).toEqual(['#a855f7']);

    advance((SCRUB_END_MS - SPIN_UP_MS) / 2);
    const midway = getSky().date.getTime();
    expect(midway).toBeGreaterThan(start + 1000);
    expect(midway).toBeLessThan(TO.getTime());

    // The pins are gone through the spin, and so are their labels.
    expect(timewarpFxState.markers).toBe(0);
    expect(document.documentElement.style.getPropertyValue('--timewarp-markers')).toBe('0');

    const stepBefore = result.current.step;
    advance(TIMEWARP_DURATION_MS);
    expect(result.current.step).toBeGreaterThan(stepBefore);
    expect(result.current.playing).toBe(false);
    expect(skyDrift.boost).toBe(0);
    expect(timewarpFxState.glow).toBe(0);
    expect(timewarpFxState.markers).toBe(1);
    expect(document.documentElement.style.getPropertyValue('--timewarp-markers')).toBe('');
    // Let go: the sky is the live one again (no revert override here).
    expect(Math.abs(getSky().date.getTime() - Date.now())).toBeLessThan(2000);
  });

  it('ends on whatever the revert override says -- a real timewarp arrives there', () => {
    setSkyRevertOverride(TO);
    const r = run({ from: 'sky' });
    renderHook(() => useTimewarpFx(r, 0));

    advance(TIMEWARP_DURATION_MS + 100);
    expect(getSky().date).toEqual(TO);
  });

  it('holds at `to` when done, for a preview, until let go', () => {
    const r = run({ hold: true });
    const { unmount } = renderHook(() => useTimewarpFx(r, 0));

    advance(TIMEWARP_DURATION_MS + 100);
    expect(getSky().date).toEqual(TO);

    unmount();
    expect(getSky().date).not.toEqual(TO);
  });

  it('lets go of the sky if it is left mid-run', () => {
    const r = run();
    const { unmount } = renderHook(() => useTimewarpFx(r, 0));
    advance(SPIN_UP_MS + 500);
    expect(skyDrift.boost).toBeGreaterThan(0);

    unmount();
    expect(skyDrift.boost).toBe(0);
    expect(Math.abs(getSky().date.getTime() - Date.now())).toBeLessThan(2000);
  });

  it('plays again from the start when the run id changes', () => {
    const r = run({ hold: true });
    const { result, rerender } = renderHook(({ id }) => useTimewarpFx(r, id), { initialProps: { id: 0 } });
    advance(TIMEWARP_DURATION_MS + 100);
    expect(result.current.playing).toBe(false);

    rerender({ id: 1 });
    expect(result.current.playing).toBe(true);
  });
});

describe('the sky override order', () => {
  it('a running timewarp owns the sky ahead of a revert', () => {
    const r = run();
    renderHook(() => useTimewarpFx(r, 0));
    advance(SPIN_UP_MS + 10);
    const during = getSky().date.getTime();

    setSkyRevertOverride(new Date('2020-01-01T00:00:00Z'));
    expect(getSky().date.getTime()).toBe(during);
  });
});
