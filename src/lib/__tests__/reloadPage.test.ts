import { describe, expect, it, vi } from 'vitest';
import { reloadPage, takeReloadReturn } from '@/lib/reloadPage';

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
const nav = (pathname: string, search = '') => ({ pathname, search, reload: vi.fn(), replace: vi.fn() });

describe('reloadPage', () => {
  it('just reloads on the web', () => {
    const n = nav('/city');
    reloadPage(n, memory(), false);
    expect(n.reload).toHaveBeenCalled();
    expect(n.replace).not.toHaveBeenCalled();
  });

  it('in the apps goes through the start page and comes back to the same page', () => {
    const store = memory();
    const n = nav('/lobby', '?id=ABCD');
    reloadPage(n, store, true);
    expect(n.replace).toHaveBeenCalledWith('/');
    expect(n.reload).not.toHaveBeenCalled();
    expect(takeReloadReturn(store)).toBe('/lobby?id=ABCD');
    expect(takeReloadReturn(store)).toBeNull(); // once
  });

  it('just reloads on the start page itself, or without storage', () => {
    const home = nav('/');
    reloadPage(home, memory(), true);
    expect(home.reload).toHaveBeenCalled();
    const city = nav('/city');
    reloadPage(city, null, true);
    expect(city.reload).toHaveBeenCalled();
  });

  it('reloads if the storage throws', () => {
    const n = nav('/city');
    reloadPage(n, { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} }, true);
    expect(n.reload).toHaveBeenCalled();
  });
});

describe('takeReloadReturn', () => {
  it('only gives back a path on this site', () => {
    const store = memory();
    store.setItem('wom:reloadReturn', '//evil.example');
    expect(takeReloadReturn(store)).toBeNull();
    store.setItem('wom:reloadReturn', 'https://evil.example');
    expect(takeReloadReturn(store)).toBeNull();
    expect(takeReloadReturn(null)).toBeNull();
    expect(takeReloadReturn({ getItem: () => { throw new Error('x'); }, setItem: () => {}, removeItem: () => {} })).toBeNull();
  });
});
