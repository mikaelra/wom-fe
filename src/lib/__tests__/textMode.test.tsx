import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getTextMode, setTextMode, useTextMode } from '@/lib/textMode';

beforeEach(() => {
  localStorage.clear();
});

describe('text mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('is on in a browser until the player chooses, then follows the choice', () => {
    expect(getTextMode()).toBe(true);
    setTextMode(false);
    expect(getTextMode()).toBe(false);
    setTextMode(true);
    expect(getTextMode()).toBe(true);
    setTextMode(false);
    expect(getTextMode()).toBe(false);
  });

  it('is read after mount', () => {
    setTextMode(true);
    expect(renderHook(() => useTextMode()).result.current).toBe(true);
  });

  it('is off in the iOS and Steam apps until the player chooses', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUILD_TARGET', 'native');
    vi.resetModules();
    const native = await import('@/lib/textMode');
    expect(native.getTextMode()).toBe(false);
    native.setTextMode(true);
    expect(native.getTextMode()).toBe(true);
  });

  it('is off when storage is unavailable, so quality can still be switched', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(getTextMode()).toBe(false);
  });
});
