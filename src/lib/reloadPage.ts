import { IS_NATIVE_BUILD } from '@/lib/buildTarget';

// Reloading the page where you are (Mikael, 2026-10-14): switching LD/SD/HD
// in the city took the iOS app to the Earth. A reload asks for the page's
// path, and the apps' static export has no file at /city -- the iOS app's
// asset server then hands back index.html, the Earth. So in the apps a
// reload goes to the start page, which is always there, and
// <RestoreAfterReload /> (root layout) carries on to the page you were on.
// On the web a reload just reloads.

const KEY = 'wom:reloadReturn';

type Nav = Pick<Location, 'pathname' | 'search' | 'reload' | 'replace'>;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function session(): Store | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reload the page, staying on it. */
export function reloadPage(nav: Nav = window.location, store: Store | null = session(), native = IS_NATIVE_BUILD): void {
  const here = nav.pathname + nav.search;
  if (!native || nav.pathname === '/' || !store) {
    nav.reload();
    return;
  }
  try {
    store.setItem(KEY, here);
  } catch {
    nav.reload();
    return;
  }
  nav.replace('/');
}

/** Where a reload left off, once (cleared as it is read); null if none. */
export function takeReloadReturn(store: Store | null = session()): string | null {
  if (!store) return null;
  try {
    const path = store.getItem(KEY);
    if (path !== null) store.removeItem(KEY);
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}
