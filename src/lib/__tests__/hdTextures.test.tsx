import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ native: false, token: 'tok' as string | null, hd: true, calls: 0 }));

vi.mock('@/lib/buildTarget', () => ({
  get IS_NATIVE_BUILD() { return state.native; },
}));
vi.mock('@/lib/http', () => ({ getStoredAccountToken: () => state.token }));
vi.mock('@/lib/api', () => ({
  getEntitlements: () => {
    state.calls += 1;
    return state.hd === null ? Promise.reject(new Error('down')) : Promise.resolve({ hd: state.hd });
  },
}));

import {
  getHdPreference, hdPreferred, hdRequestHeaders, hdUnlocked, isHdTexturePath,
  resetHdUnlockedForTests, setHdPreference, useHdTextures,
} from '@/lib/hdTextures';

function Scene() {
  return <p>{useHdTextures() ? 'hd' : 'sd'}</p>;
}

beforeEach(() => {
  Object.assign(state, { native: false, token: 'tok', hd: true, calls: 0 });
  localStorage.clear();
  resetHdUnlockedForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('the preference', () => {
  it('is on by default in the paid apps and off on the web', () => {
    expect(getHdPreference()).toBeNull();
    expect(hdPreferred()).toBe(false);
    state.native = true;
    expect(hdPreferred()).toBe(true);
  });

  it('is the player’s own choice once they make one', () => {
    setHdPreference(true);
    expect(getHdPreference()).toBe(true);
    state.native = true;
    setHdPreference(false);
    expect(hdPreferred()).toBe(false);
  });

  it('survives storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => setHdPreference(true)).not.toThrow();
    expect(getHdPreference()).toBeNull();
  });
});

describe('hdUnlocked', () => {
  it('is always true in the paid apps, without asking', async () => {
    state.native = true;
    expect(await hdUnlocked()).toBe(true);
    expect(state.calls).toBe(0);
  });

  it('is false on the web without a login', async () => {
    state.token = null;
    expect(await hdUnlocked()).toBe(false);
    expect(state.calls).toBe(0);
  });

  it('asks the backend once per session', async () => {
    expect(await hdUnlocked()).toBe(true);
    expect(await hdUnlocked()).toBe(true);
    expect(state.calls).toBe(1);
    state.token = 'other';
    state.hd = false;
    expect(await hdUnlocked()).toBe(false);
    expect(state.calls).toBe(2);
  });

  it('is false when the backend cannot say', async () => {
    state.hd = null as unknown as boolean;
    expect(await hdUnlocked()).toBe(false);
  });
});

describe('useHdTextures', () => {
  it('is off without asking for a web player who never turned HD on', () => {
    render(<Scene />);
    expect(screen.getByText('sd')).toBeTruthy();
    expect(state.calls).toBe(0);
  });

  it('waits for the check, then loads HD for a web account that has it', async () => {
    setHdPreference(true);
    await act(async () => { render(<Suspense fallback={<p>loading</p>}><Scene /></Suspense>); });
    expect(await screen.findByText('hd')).toBeTruthy();
  });

  it('stays off for a web account without HD even if it was turned on', async () => {
    setHdPreference(true);
    state.hd = false;
    await act(async () => { render(<Suspense fallback={<p>loading</p>}><Scene /></Suspense>); });
    expect(await screen.findByText('sd')).toBeTruthy();
  });

  it('is on straight away in the paid apps', () => {
    state.native = true;
    render(<Scene />);
    expect(screen.getByText('hd')).toBeTruthy();
  });
});

describe('fetching', () => {
  it('sends the session on the web and nothing in the paid apps', () => {
    expect(hdRequestHeaders()).toEqual({ Authorization: 'Bearer tok' });
    state.token = null;
    expect(hdRequestHeaders()).toEqual({});
    state.native = true;
    state.token = 'tok';
    expect(hdRequestHeaders()).toEqual({});
  });

  it('knows the HD paths', () => {
    expect(isHdTexturePath('/hd/stars/x.ktx2')).toBe(true);
    expect(isHdTexturePath('/textures/stars/x.jpg')).toBe(false);
  });
});
