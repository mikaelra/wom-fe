/**
 * Socket errors that mean the lobby the player is sitting in is gone.
 *
 * The backend emits two spellings of it -- a bare "Lobby not found" from
 * most handlers, and "Lobby <id> not found" from one -- so this matches the
 * shape rather than a literal, and a new handler picking either spelling is
 * covered without anyone remembering to come back here.
 *
 * Deliberately narrow. "You are not in this lobby" and "Game already
 * started" are also unrecoverable-looking, but they are answers to
 * something the player just did, and a player who is told nothing and
 * silently moved would have no idea why. This is only for the case where
 * the room itself has ceased to exist -- after a backend restart drops its
 * in-memory lobbies, most often -- which is nothing the player did and
 * nothing they can act on.
 */
const LOBBY_GONE = /^Lobby(?: .+)? not found$/i;

export function isLobbyGoneError(message: string): boolean {
  return LOBBY_GONE.test(message.trim());
}
