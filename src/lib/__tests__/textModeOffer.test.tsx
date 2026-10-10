import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTextMode } from '@/lib/textMode';
import {
  OFFER_EVENT,
  dismissOffer,
  noteDisconnect,
  readCrashMarker,
  resetDropsForTests,
  shouldOffer,
  watch3dScene,
} from '@/lib/textModeOffer';

beforeEach(() => {
  localStorage.clear();
  resetDropsForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('crash marker', () => {
  it('finds a 3D scene that never ended -- a crash -- once', () => {
    watch3dScene(); // and never cleaned up: the web view died
    expect(readCrashMarker()).toBe(true);
    expect(readCrashMarker()).toBe(false); // read, then gone
  });

  it('is cleared when the scene ends, or the app goes to the background', () => {
    const stop = watch3dScene();
    stop();
    expect(readCrashMarker()).toBe(false);
    watch3dScene();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(readCrashMarker()).toBe(false);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('is cleared on a page reload or leaving', () => {
    watch3dScene();
    window.dispatchEvent(new Event('pagehide'));
    expect(readCrashMarker()).toBe(false);
  });

  it('ignores an old marker', () => {
    localStorage.setItem('wom.scene3d', String(Date.now() - 10 * 60_000));
    expect(readCrashMarker()).toBe(false);
  });
});

describe('reconnect loop', () => {
  it('asks for the offer on the third drop within a minute', () => {
    const asked = vi.fn();
    window.addEventListener(OFFER_EVENT, asked);
    noteDisconnect(0);
    noteDisconnect(20_000);
    expect(asked).not.toHaveBeenCalled();
    noteDisconnect(40_000);
    expect(asked).toHaveBeenCalledTimes(1);
    window.removeEventListener(OFFER_EVENT, asked);
  });

  it('does not count drops more than a minute apart', () => {
    const asked = vi.fn();
    window.addEventListener(OFFER_EVENT, asked);
    noteDisconnect(0);
    noteDisconnect(50_000);
    noteDisconnect(120_000);
    expect(asked).not.toHaveBeenCalled();
    window.removeEventListener(OFFER_EVENT, asked);
  });
});

describe('shouldOffer', () => {
  it('offers to a 3D player, not to one in text mode already', () => {
    expect(shouldOffer()).toBe(true);
    setTextMode(true);
    expect(shouldOffer()).toBe(false);
  });

  it('keeps quiet for a week after "Not now"', () => {
    const day = 24 * 60 * 60_000;
    const t0 = Date.UTC(2026, 9, 10);
    dismissOffer(t0);
    expect(shouldOffer(t0 + 6 * day)).toBe(false);
    expect(shouldOffer(t0 + 8 * day)).toBe(true);
  });
});
