// Logging in with Steam in the Steam build (wom-be routes/steam_auth.py).
//
// The Steam client signs the player in silently: the shell (electron/) asks
// Steam for a Web API auth ticket, the backend checks it with Steam and
// answers with the account's session -- or "new" when this Steam account has
// no World of Mythos account yet. Then <SteamWelcome> offers "Play now" (a new
// account, createSteamAccount) or "I already have an account" (log in the usual
// way; the login page then calls completePendingSteamLink, which ties this
// Steam account to it).
//
// A login is stored the same way the login page stores one: the account
// session token plus localStorage playerName. A Steam account has no email,
// so playerEmail is cleared -- lobby joins prove the name with the session.

import { postSteamCreate, postSteamLink, postSteamLogin } from '@/lib/api';
import { ApiError, getStoredAccountToken, setStoredAccountToken } from '@/lib/http';
import { isSteamClient } from '@/lib/steamShell';

const LINK_PENDING_KEY = 'steamLinkPending';

type ShellWindow = Pick<Window, 'wom'>;

async function ticket(w: ShellWindow | undefined): Promise<string | null> {
  if (!isSteamClient(w)) return null;
  try {
    return (await w?.wom?.getSteamTicket?.()) ?? null;
  } catch {
    return null;
  }
}

function remember(name: string, sessionToken: string) {
  setStoredAccountToken(sessionToken);
  localStorage.setItem('playerName', name);
  localStorage.removeItem('playerEmail');
}

export type SteamSignIn =
  | { status: 'skipped' } // not the Steam client, Steam off, or already logged in
  | { status: 'signed-in'; name: string }
  | { status: 'new'; steamName: string | null };

/** Sign in with the Steam account unless someone is already logged in. */
export async function steamSignIn(w: ShellWindow | undefined = globalThis.window): Promise<SteamSignIn> {
  if (!isSteamClient(w) || getStoredAccountToken()) return { status: 'skipped' };
  const t = await ticket(w);
  if (!t) return { status: 'skipped' };
  const data = await postSteamLogin(t);
  if (data.status === 'ok' && data.name && data.session_token) {
    remember(data.name, data.session_token);
    return { status: 'signed-in', name: data.name };
  }
  const info = await w?.wom?.getSteamInfo().catch(() => null);
  return { status: 'new', steamName: info?.playerName ?? null };
}

/** "Play now": a new account named `name`, logged in with this Steam account. */
export async function createSteamAccount(name: string, w: ShellWindow | undefined = globalThis.window): Promise<void> {
  const t = await ticket(w);
  if (!t) throw new Error('Steam is not available.');
  const data = await postSteamCreate(t, name);
  if (!data.name || !data.session_token) throw new Error('Could not create the account.');
  remember(data.name, data.session_token);
}

/** "I already have an account": remember to link once they've logged in. */
export function startSteamLink(): void {
  localStorage.setItem(LINK_PENDING_KEY, '1');
}

/** After a login: tie this Steam account to it, if the player asked to.
 *  Returns an error to show, or null (linked, or nothing to do). */
export async function completePendingSteamLink(w: ShellWindow | undefined = globalThis.window): Promise<string | null> {
  if (localStorage.getItem(LINK_PENDING_KEY) !== '1') return null;
  const token = getStoredAccountToken();
  const t = await ticket(w);
  if (!token || !t) return null;
  try {
    await postSteamLink(t, token);
    localStorage.removeItem(LINK_PENDING_KEY);
    return null;
  } catch (e) {
    localStorage.removeItem(LINK_PENDING_KEY);
    if (e instanceof ApiError) return e.message;
    return 'Could not link your Steam account.';
  }
}
