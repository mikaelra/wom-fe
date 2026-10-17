// Which of the account's names the top bar shows (Settings -> Connections):
// the game name ('web', the name the account was made with, which everyone
// sees in matches) or the Steam account's name ('steam'), once a Steam
// account is connected. A choice per device. Unset, the Steam build shows
// the Steam name and everything else the game name.

import { getConnections } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { isSteamClient } from '@/lib/steamShell';
import { steamPersonaName } from '@/lib/steamAccount';

export type ShownName = 'web' | 'steam';

const KEY = 'shownName';

export function getShownNamePreference(): ShownName | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'web' || v === 'steam' ? v : null;
  } catch {
    return null;
  }
}

export function setShownNamePreference(which: ShownName): void {
  try {
    localStorage.setItem(KEY, which);
  } catch {
    // private mode: the choice lasts as long as the page
  }
}

type ShellWindow = Pick<Window, 'wom'>;

/** This device's choice, or its default. */
export function shownName(w: ShellWindow | undefined = globalThis.window): ShownName {
  return getShownNamePreference() ?? (isSteamClient(w) ? 'steam' : 'web');
}

/** The Steam name to show in place of the game name, or null to show the
 *  game name: in the Steam client as the client reports it, elsewhere as
 *  the connected Steam account last reported it (wom-be /account/connections). */
export async function steamNameToShow(w: ShellWindow | undefined = globalThis.window): Promise<string | null> {
  if (shownName(w) !== 'steam') return null;
  const persona = await steamPersonaName(w);
  if (persona) return persona;
  const token = getStoredAccountToken();
  if (!token) return null;
  try {
    return (await getConnections(token)).steam?.name ?? null;
  } catch {
    return null;
  }
}
