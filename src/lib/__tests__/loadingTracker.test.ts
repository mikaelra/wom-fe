import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginRequest,
  claimLoadingScreen,
  isAssetsLoading,
  isOverlaySuppressed,
  isBackgroundLoading,
  isScreenLoading,
  requestsInFlight,
  resetLoadingTracker,
  setAssetsLoading,
  subscribeLoading,
  suppressLoadingOverlay,
} from '@/lib/loadingTracker';

afterEach(() => {
  resetLoadingTracker();
});

describe('loadingTracker', () => {
  it('counts overlapping requests until each one ends', () => {
    const a = beginRequest();
    const b = beginRequest();
    expect(requestsInFlight()).toBe(2);
    a();
    expect(isBackgroundLoading()).toBe(true);
    b();
    expect(requestsInFlight()).toBe(0);
    expect(isBackgroundLoading()).toBe(false);
  });

  it('ignores a request being ended twice', () => {
    const end = beginRequest();
    beginRequest();
    end();
    end();
    expect(requestsInFlight()).toBe(1);
  });

  it('tracks 3D asset loading apart from API calls', () => {
    setAssetsLoading(true);
    expect(isAssetsLoading()).toBe(true);
    expect(isBackgroundLoading()).toBe(false);
    setAssetsLoading(false);
    expect(isAssetsLoading()).toBe(false);
  });

  it('tracks screens waiting for content separately from background loading', () => {
    beginRequest();
    const release = claimLoadingScreen();
    expect(isScreenLoading()).toBe(true);
    expect(isBackgroundLoading()).toBe(true);
    release();
    release();
    expect(isScreenLoading()).toBe(false);
  });

  it('can be switched off by pages, until each switch-off is released', () => {
    const a = suppressLoadingOverlay();
    const b = suppressLoadingOverlay();
    a();
    a();
    expect(isOverlaySuppressed()).toBe(true);
    b();
    expect(isOverlaySuppressed()).toBe(false);
  });

  it('notifies subscribers on every change, and stops after unsubscribing', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLoading(listener);
    const end = beginRequest();
    setAssetsLoading(true);
    setAssetsLoading(true); // no change, no notification
    end();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    beginRequest();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
