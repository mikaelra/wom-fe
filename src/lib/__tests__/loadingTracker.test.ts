import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginRequest,
  claimLoadingScreen,
  isBackgroundLoading,
  isScreenLoading,
  requestsInFlight,
  resetLoadingTracker,
  setAssetsLoading,
  subscribeLoading,
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

  it('counts 3D asset loading too', () => {
    setAssetsLoading(true);
    expect(isBackgroundLoading()).toBe(true);
    setAssetsLoading(false);
    expect(isBackgroundLoading()).toBe(false);
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
