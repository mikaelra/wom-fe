// Hands off the "zoom to white / pan out from white" entrance animation across
// the route change from world map -> /lobby/[lobbyId]. sessionStorage is the
// only channel available since Next.js fully unmounts the outgoing page.
const KEY = 'lobbyEntranceTransition';

export function markLobbyEntranceTransition() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // sessionStorage unavailable (e.g. private mode) — entrance just skips.
  }
}

export function consumeLobbyEntranceTransition(): boolean {
  try {
    const flagged = sessionStorage.getItem(KEY) === '1';
    if (flagged) sessionStorage.removeItem(KEY);
    return flagged;
  } catch {
    return false;
  }
}
