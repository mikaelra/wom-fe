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
  getHdPreference, hdPreferred, hdRequestHeaders, hdSources, hdUnlocked, isHdTexturePath,
  resetHdSourcesForTests, resetHdUnlockedForTests, setHdPreference, useHdTextures,
} from '@/lib/hdTextures';

function Scene() {
  return <p>{useHdTextures() ? 'hd' : 'sd'}</p>;
}

beforeEach(() => {
  Object.assign(state, { native: false, token: 'tok', hd: true, calls: 0 });
  localStorage.clear();
  resetHdUnlockedForTests();
  resetHdSourcesForTests();
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

describe('hdSources', () => {
  // A minimal Cache Storage: one store per name, keyed by url.
  function fakeCaches(stores: Map<string, Map<string, Response>>) {
    return {
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name)!;
        return {
          match: async (url: string) => store.get(url)?.clone(),
          put: async (url: string, res: Response) => { store.set(url, res); },
        };
      },
    };
  }

  let downloads: string[];
  beforeEach(() => {
    downloads = [];
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      downloads.push(`${url} ${JSON.stringify(init.headers)}`);
      return url.includes('missing') ? new Response('', { status: 403 }) : new Response(`bytes of ${url}`);
    }));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:${++n}` }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('leaves everything as is in the paid apps and for non-HD files', async () => {
    state.native = true;
    expect(await hdSources(['/hd/a.ktx2'])).toEqual(['/hd/a.ktx2']);
    state.native = false;
    expect(await hdSources(['/textures/a.jpg'])).toEqual(['/textures/a.jpg']);
    expect(downloads).toEqual([]);
  });

  it('downloads each HD file once for the globe and the city, even while under way', async () => {
    vi.stubGlobal('caches', fakeCaches(new Map()));
    const globe = hdSources(['/hd/sky.ktx2', '/hd/earth.ktx2']);
    const city = hdSources(['/hd/sky.ktx2']);
    expect(hdSources(['/hd/sky.ktx2'])).toBe(city); // the same promise for use()
    const [g, c] = await Promise.all([globe, city]);
    expect(c[0]).toBe(g[0]);
    expect(downloads).toEqual([
      '/hd/sky.ktx2 {"Authorization":"Bearer tok"}',
      '/hd/earth.ktx2 {"Authorization":"Bearer tok"}',
    ]);
  });

  it('keeps the files for later visits, and drops an older version of them', async () => {
    const stores = new Map([['wom-hd-v0', new Map<string, Response>()]]);
    vi.stubGlobal('caches', fakeCaches(stores));
    await hdSources(['/hd/sky.ktx2']);
    expect([...stores.keys()]).toEqual(['wom-hd-v1']);
    resetHdSourcesForTests(); // a new page load
    await hdSources(['/hd/sky.ktx2']);
    expect(downloads).toHaveLength(1);
  });

  it('still works where there is no Cache Storage', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await hdSources(['/hd/sky.ktx2'])).toEqual(['blob:1']);
  });

  it('does not remember a refused download', async () => {
    vi.stubGlobal('caches', fakeCaches(new Map()));
    await expect(hdSources(['/hd/missing.ktx2'])).rejects.toThrow(/403/);
    await expect(hdSources(['/hd/missing.ktx2'])).rejects.toThrow(/403/);
    expect(downloads).toHaveLength(2);
  });
});
