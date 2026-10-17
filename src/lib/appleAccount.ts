// Logging in with the Apple account in the iOS app (wom-be
// routes/apple_auth.py) -- what src/lib/steamAccount.ts does for Steam.
//
// The app asks StoreKit for its AppTransaction, Apple's signed record of
// this Apple account getting the app, and the backend answers with the
// account's session -- or "new" when this Apple account has no World of
// Mythos account yet. Then <AppleWelcome> offers "Play now" (a new account,
// createAppleAccount) or "I already have an account" (log in with email; the
// login page then calls completePendingAppleLink). No sign-in sheet. Before
// iOS 16 there is no AppTransaction, and the app logs in with email only.

import { postAppleCreate, postAppleLink, postAppleLogin } from '@/lib/api';
import { isIosApp, WomStoreKit, type WomStoreKitPlugin } from '@/lib/appleShop';
import { ApiError, getStoredAccountToken, setStoredAccountToken } from '@/lib/http';

const LINK_PENDING_KEY = 'appleLinkPending';

type Store = Pick<WomStoreKitPlugin, 'appTransaction'>;

async function appTransaction(store: Store, ios: boolean): Promise<string | null> {
  if (!ios) return null;
  try {
    return (await store.appTransaction()).jws || null;
  } catch {
    return null;
  }
}

function remember(name: string, sessionToken: string) {
  setStoredAccountToken(sessionToken);
  localStorage.setItem('playerName', name);
  localStorage.removeItem('playerEmail');
}

export type AppleSignIn =
  | { status: 'skipped' } // not the iOS app, before iOS 16, or already logged in
  | { status: 'signed-in'; name: string }
  | { status: 'new' };

/** Sign in with the Apple account unless someone is already logged in. */
export async function appleSignIn(store: Store = WomStoreKit, ios: boolean = isIosApp()): Promise<AppleSignIn> {
  const jws = await appTransaction(store, ios);
  if (!jws) return { status: 'skipped' };
  const token = getStoredAccountToken();
  if (token) {
    // Already logged in: check in with this Apple account, which links it
    // to the account if it isn't yet and keeps its HD on the web. Nothing
    // to show if it can't (linked to another Apple account, offline).
    await postAppleLink(jws, token).catch(() => undefined);
    return { status: 'skipped' };
  }
  const data = await postAppleLogin(jws);
  if (data.status === 'ok' && data.name && data.session_token) {
    remember(data.name, data.session_token);
    return { status: 'signed-in', name: data.name };
  }
  return { status: 'new' };
}

/** "Play now": a new account named `name`, logged in with this Apple account. */
export async function createAppleAccount(
  name: string,
  store: Store = WomStoreKit,
  ios: boolean = isIosApp()
): Promise<void> {
  const jws = await appTransaction(store, ios);
  if (!jws) throw new Error('Apple is not available.');
  const data = await postAppleCreate(jws, name);
  if (!data.name || !data.session_token) throw new Error('Could not create the account.');
  remember(data.name, data.session_token);
}

/** "I already have an account": remember to link once they've logged in. */
export function startAppleLink(): void {
  localStorage.setItem(LINK_PENDING_KEY, '1');
}

/** After a login: tie this Apple account to it, if the player asked to.
 *  Returns an error to show, or null (linked, or nothing to do). */
export async function completePendingAppleLink(
  store: Store = WomStoreKit,
  ios: boolean = isIosApp()
): Promise<string | null> {
  if (localStorage.getItem(LINK_PENDING_KEY) !== '1') return null;
  const token = getStoredAccountToken();
  const jws = await appTransaction(store, ios);
  if (!token || !jws) return null;
  localStorage.removeItem(LINK_PENDING_KEY);
  try {
    await postAppleLink(jws, token);
    return null;
  } catch (e) {
    if (e instanceof ApiError) return e.message;
    return 'Could not link your Apple account.';
  }
}
