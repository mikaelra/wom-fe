import { describe, expect, it } from 'vitest';
import { lobbyTitle, PRIVATE_LOBBY_COLOR } from '@/lib/lobbyTitle';
import { BOSSFIGHT_COLOR, RANKED_COLOR } from '@/components/city/signpostColors';

describe('lobbyTitle', () => {
  it('names the kind of match, in its colour', () => {
    expect(lobbyTitle({ boss_fight: true })).toEqual({ text: 'Bossfight', color: BOSSFIGHT_COLOR });
    expect(lobbyTitle({ ranked: true })).toEqual({ text: 'Ranked', color: RANKED_COLOR });
    expect(lobbyTitle({ ai_ranked: true })).toEqual({ text: 'Bot Ranked', color: RANKED_COLOR });
    expect(lobbyTitle({})).toEqual({ text: 'Private lobby', color: PRIVATE_LOBBY_COLOR });
  });

  it('has none before the lobby is known', () => {
    expect(lobbyTitle(null)).toBeNull();
  });
});
