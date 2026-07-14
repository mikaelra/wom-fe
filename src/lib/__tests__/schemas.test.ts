import { describe, expect, it } from 'vitest';
import { PlayerSchema, LobbyStateSchema, ChatMessageSchema, RelicSchema } from '@/types/game';
import { GameEventSchema } from '@/lib/gameEvents';
import {
  CreateLobbyResponseSchema,
  GetBossfightLobbyResponseSchema,
  GetNextBossfightTimeResponseSchema,
  GetPlayerRelicsResponseSchema,
  GetPlayerMessagesResponseSchema,
  CheckNameResponseSchema,
  LogInResponseSchema,
  VerifyLoginCodeResponseSchema,
  GetAlwaysVerifyEmailFlagResponseSchema,
  RequestToggleVerifyEmailResponseSchema,
  ConfirmToggleVerifyEmailResponseSchema,
  ClaimPendingRelicResponseSchema,
  JoinedLobbyPayloadSchema,
  JoinedPayloadSchema,
  LeftPayloadSchema,
  ErrorPayloadSchema,
} from '@/lib/schemas';

// Fixtures mirror the exact shapes documented in wom-be's docs/PROTOCOL.md
// (golden-tested on that side too) -- same contract, pinned from both
// repos, so drift is caught on either side.

const playerFixture = {
  name: 'Alice',
  hp: 8,
  coins: 3,
  attackDamage: 2,
  alive: true,
  admin: true,
  spectator: false,
  bot: false,
  boss: false,
  lost_soul: null,
  title: null,
  idle_rounds: 0,
  pending_relic_nudge: null,
};

const lobbyStateFixture = {
  round: 2,
  players: [playerFixture],
  winner: null,
  wellwinner: null,
  pending_deny: null,
  deny_target: null,
  readyPlayers: ['Alice'],
  history: ['Alice created a lobby.'],
  round_end_time: '2026-01-01T12:00:40+00:00',
  boss_fight: false,
  start_time: '2026-01-01T12:00:00+00:00',
  gameover: false,
  chat: [{ sender: 'Alice', message: 'hi', timestamp: '2026-01-01T12:00:01+00:00' }],
};

describe('Player/LobbyState/ChatMessage/Relic schemas', () => {
  it('parses a real state_update player object', () => {
    expect(PlayerSchema.safeParse(playerFixture).success).toBe(true);
  });

  it('accepts non-null lost_soul/title/pending_relic_nudge', () => {
    const withValues = { ...playerFixture, lost_soul: true, title: 'The Boss', pending_relic_nudge: true };
    expect(PlayerSchema.safeParse(withValues).success).toBe(true);
  });

  it('rejects a player missing bot (a real drift bug this schema exists to catch)', () => {
    const missingBot: Partial<typeof playerFixture> = { ...playerFixture };
    delete missingBot.bot;
    expect(PlayerSchema.safeParse(missingBot).success).toBe(false);
  });

  it('parses a full state_update payload', () => {
    expect(LobbyStateSchema.safeParse(lobbyStateFixture).success).toBe(true);
  });

  it('rejects start_time as a number (the old, wrong type)', () => {
    const wrongType = { ...lobbyStateFixture, start_time: 1735732800000 };
    expect(LobbyStateSchema.safeParse(wrongType).success).toBe(false);
  });

  it('parses a chat message', () => {
    expect(ChatMessageSchema.safeParse(lobbyStateFixture.chat[0]).success).toBe(true);
  });

  it('parses a relic with every backend field', () => {
    const relic = {
      id: 3,
      boss_id: 7,
      created_at: '2026-01-01T00:00:00+00:00',
      name: 'Shiny Relic',
      power_category: 'fire',
      flavour_text: 'A shiny relic.',
      count: 1,
    };
    expect(RelicSchema.safeParse(relic).success).toBe(true);
  });

  it('parses a relic missing the optional flavour_text', () => {
    const relic = { id: 3, boss_id: 7, created_at: '2026-01-01T00:00:00+00:00', name: 'Shiny Relic', power_category: 'fire', count: 1 };
    expect(RelicSchema.safeParse(relic).success).toBe(true);
  });
});

describe('GameEvent schema', () => {
  it('parses an outgoing combat event', () => {
    const event = { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false };
    expect(GameEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses an incoming event with a null (anonymised) attacker', () => {
    const event = { kind: 'incoming', attacker: null, outcome: 'hit', attackerDied: false, damage: 2 };
    expect(GameEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a witness event', () => {
    const event = { kind: 'witness', attacker: 'Alice', victim: 'Bob' };
    expect(GameEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a well_reward event with steal victims', () => {
    const event = {
      kind: 'well_reward',
      components: [{ type: 'steal', count: 2, victims: [{ name: 'Bob', amount: 1 }] }],
    };
    expect(GameEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects an unknown reward type', () => {
    const event = { kind: 'well_reward', components: [{ type: 'not-a-real-reward', count: 1 }] };
    expect(GameEventSchema.safeParse(event).success).toBe(false);
  });

  it('rejects an event with an unknown kind', () => {
    expect(GameEventSchema.safeParse({ kind: 'not-a-real-kind' }).success).toBe(false);
  });
});

describe('HTTP response schemas', () => {
  it('parses create_lobby', () => {
    expect(CreateLobbyResponseSchema.safeParse({ lobby_id: 'AB12', token: 'tok' }).success).toBe(true);
  });

  it('parses get_bossfight_lobby with a token', () => {
    const body = { lobby_id: 'AB12', start_time: '2026-01-01T12:00:00+00:00', token: 'tok' };
    expect(GetBossfightLobbyResponseSchema.safeParse(body).success).toBe(true);
  });

  it('parses get_bossfight_lobby with token entirely absent (the "already in" branch)', () => {
    const body = { lobby_id: 'AB12', start_time: '2026-01-01T12:00:00+00:00' };
    expect(GetBossfightLobbyResponseSchema.safeParse(body).success).toBe(true);
  });

  it('rejects get_bossfight_lobby with token: null (the backend omits the key, never sends null)', () => {
    const body = { lobby_id: 'AB12', start_time: '2026-01-01T12:00:00+00:00', token: null };
    expect(GetBossfightLobbyResponseSchema.safeParse(body).success).toBe(false);
  });

  it('parses get_next_bossfight_time', () => {
    expect(GetNextBossfightTimeResponseSchema.safeParse({ start_time: '2026-01-01T12:00:00+00:00' }).success).toBe(true);
  });

  it('parses get_player_relics', () => {
    const body = {
      relics: [{ id: 1, boss_id: 7, created_at: '2026-01-01T00:00:00+00:00', name: 'Relic', power_category: 'fire', count: 1 }],
    };
    expect(GetPlayerRelicsResponseSchema.safeParse(body).success).toBe(true);
  });

  it('parses get_player_messages with a mix of plain strings and one-element arrays', () => {
    const body = {
      player: 'Alice',
      messages: ['You got 1 coin.', ['You got 2 coins!'], 'You attacked Bob.'],
      events: [],
    };
    expect(GetPlayerMessagesResponseSchema.safeParse(body).success).toBe(true);
  });

  it('parses check_name/log_in/verify_code/settings/claim responses', () => {
    expect(CheckNameResponseSchema.safeParse({ claimed: true }).success).toBe(true);
    expect(LogInResponseSchema.safeParse({ success: true, always_verify_email: false }).success).toBe(true);
    expect(LogInResponseSchema.safeParse({ success: false, requires_code: true }).success).toBe(true);
    expect(VerifyLoginCodeResponseSchema.safeParse({ success: true, always_verify_email: true }).success).toBe(true);
    expect(GetAlwaysVerifyEmailFlagResponseSchema.safeParse({ always_verify_email: true }).success).toBe(true);
    expect(RequestToggleVerifyEmailResponseSchema.safeParse({ success: true }).success).toBe(true);
    expect(ConfirmToggleVerifyEmailResponseSchema.safeParse({ success: true, always_verify_email: true }).success).toBe(true);
    expect(ClaimPendingRelicResponseSchema.safeParse({ success: true, relic_name: 'Shiny Relic' }).success).toBe(true);
  });
});

describe('Socket.IO payload schemas', () => {
  it('parses joined_lobby/joined/left/error', () => {
    expect(JoinedLobbyPayloadSchema.safeParse({ lobby_id: 'AB12', token: 'tok' }).success).toBe(true);
    expect(JoinedPayloadSchema.safeParse({ lobby_id: 'AB12', name: 'Alice' }).success).toBe(true);
    expect(LeftPayloadSchema.safeParse({ lobby_id: 'AB12', name: null }).success).toBe(true);
    expect(ErrorPayloadSchema.safeParse({ message: 'Lobby not found' }).success).toBe(true);
  });

  it('rejects a malformed payload with a helpful, non-throwing failure', () => {
    const result = ErrorPayloadSchema.safeParse({ msg: 'wrong key name' });
    expect(result.success).toBe(false);
  });
});
