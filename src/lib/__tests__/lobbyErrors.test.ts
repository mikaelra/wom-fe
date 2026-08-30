import { describe, expect, it } from 'vitest';
import { isLobbyGoneError } from '@/lib/lobbyErrors';

describe('isLobbyGoneError', () => {
  it('matches the bare message most handlers emit', () => {
    expect(isLobbyGoneError('Lobby not found')).toBe(true);
  });

  it('matches the spelling that names the lobby', () => {
    expect(isLobbyGoneError('Lobby AAAA not found')).toBe(true);
  });

  it('tolerates surrounding whitespace', () => {
    expect(isLobbyGoneError('  Lobby not found  ')).toBe(true);
  });

  it('leaves errors that are answers to something the player did', () => {
    // These look just as unrecoverable, but silently moving someone who
    // just pressed a button -- with no message -- is worse than telling
    // them why it did not work.
    expect(isLobbyGoneError('You are not in this lobby')).toBe(false);
    expect(isLobbyGoneError('Game already started')).toBe(false);
    expect(isLobbyGoneError('You are not the admin')).toBe(false);
    expect(isLobbyGoneError('Name taken')).toBe(false);
  });

  it('does not match a different missing thing', () => {
    expect(isLobbyGoneError('Player not found')).toBe(false);
    expect(isLobbyGoneError('Wheel not found or already spun.')).toBe(false);
  });

  it('does not match a message that merely mentions a missing lobby', () => {
    expect(isLobbyGoneError('The lobby you asked for was not found, sorry')).toBe(false);
  });

  it('handles an empty message', () => {
    expect(isLobbyGoneError('')).toBe(false);
  });
});
