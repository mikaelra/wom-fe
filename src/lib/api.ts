import { request, ApiError } from '@/lib/http';
import { getSocket, subscribe } from '@/lib/socket';
import { setStoredToken, getStoredToken } from '@/lib/http';
import type { Relic } from '@/types/game';
import type { GameEvent } from '@/lib/gameEvents';
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
} from '@/lib/schemas';

export async function createLobby(name: string, email: string): Promise<{ lobby_id: string; token: string }> {
  const data = await request('/create_lobby', CreateLobbyResponseSchema, {
    body: { name, email },
    defaultErrorMessage: 'Create lobby failed',
  });
  setStoredToken(data.token);
  return data;
}

export async function joinLobby(joinCode: string, name: string, email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const unsubJoined = subscribe('joined_lobby', (data) => {
      unsubJoined();
      unsubError();
      setStoredToken(data.token);
      resolve();
    });
    const unsubError = subscribe('error', (data) => {
      unsubJoined();
      unsubError();
      reject(new Error(data.message));
    });

    getSocket().emit('join_lobby', { lobby_id: joinCode, name, email });
  });
}

export async function getBossfightLobby(playerName: string): Promise<{ lobby_id: string; start_time: string; token?: string }> {
  const data = await request('/get_bossfight_lobby', GetBossfightLobbyResponseSchema, {
    body: { name: playerName },
    defaultErrorMessage: 'Failed to enter boss fight.',
  });
  // token may be absent when the caller is already a member re-checking in
  // (e.g. a page refresh) -- in that case they're expected to still hold
  // the token from their original join, so don't clobber it.
  if (data.token) setStoredToken(data.token);
  const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') ?? '' : '';
  getSocket().emit('join_lobby', { lobby_id: data.lobby_id, name: playerName, email });
  return data;
}

export async function getNextBossfightTime(): Promise<{ start_time: string }> {
  return request('/get_next_bossfight_time', GetNextBossfightTimeResponseSchema, {
    defaultErrorMessage: 'Failed to fetch next boss fight time',
  });
}

export async function getPlayerRelics(playerName: string): Promise<{ relics: Relic[] }> {
  try {
    return await request('/get_player_relics', GetPlayerRelicsResponseSchema, { body: { name: playerName } });
  } catch {
    return { relics: [] };
  }
}

export async function getPlayerMessages(
  lobbyId: string,
  playerName: string
): Promise<{ messages: (string | string[])[]; events: GameEvent[] }> {
  // Backend Phase 1b: messages/events are private data, gated behind the
  // session token issued on join (see getStoredToken). A stale tab that
  // never (re)joined has no token -- fetch will 403 and fall through to
  // the empty-result fallback below, same as any other failure.
  const token = getStoredToken();
  const path = token
    ? `/get_player_messages/${lobbyId}/${playerName}?token=${encodeURIComponent(token)}`
    : `/get_player_messages/${lobbyId}/${playerName}`;
  try {
    const data = await request(path, GetPlayerMessagesResponseSchema);
    return { messages: data.messages, events: data.events };
  } catch {
    return { messages: [], events: [] };
  }
}

export async function checkName(name: string): Promise<{ claimed: boolean }> {
  return request('/check_name', CheckNameResponseSchema, {
    body: { name },
    defaultErrorMessage: 'Failed to check name',
  });
}

export async function logInUser(
  name: string,
  email: string
): Promise<{ success: boolean; requires_code?: boolean; always_verify_email?: boolean }> {
  try {
    return await request('/log_in', LogInResponseSchema, {
      body: { name, email },
      defaultErrorMessage: 'Log in failed',
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) throw new Error('Wrong email');
    throw e;
  }
}

export async function verifyLoginCode(
  name: string,
  code: string
): Promise<{ success: boolean; always_verify_email?: boolean }> {
  try {
    return await request('/verify_code', VerifyLoginCodeResponseSchema, {
      body: { name, code },
      defaultErrorMessage: 'Verification failed',
    });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 403) throw new Error('Wrong code');
      if (e.status === 410) throw new Error('Code expired');
      if (e.status === 429) throw new Error('Too many attempts');
    }
    throw e;
  }
}

export async function getAlwaysVerifyEmailFlag(
  name: string,
  email: string
): Promise<{ always_verify_email: boolean }> {
  return request('/get_always_verify_email_flag', GetAlwaysVerifyEmailFlagResponseSchema, {
    body: { name, email },
    defaultErrorMessage: 'Failed to load settings',
  });
}

export async function requestToggleVerifyEmail(
  name: string,
  email: string,
  alwaysVerifyEmail: boolean
): Promise<{ success: boolean }> {
  return request('/request_toggle_verify_email', RequestToggleVerifyEmailResponseSchema, {
    body: { name, email, always_verify_email: alwaysVerifyEmail },
    defaultErrorMessage: 'Failed to send email.',
  });
}

export async function confirmToggleVerifyEmail(
  token: string
): Promise<{ success: boolean; always_verify_email: boolean }> {
  try {
    return await request('/confirm_toggle_verify_email', ConfirmToggleVerifyEmailResponseSchema, {
      body: { token },
      defaultErrorMessage: 'Failed to confirm.',
    });
  } catch (e) {
    // Note: the backend only ever returns 400/404 for this route (confirmed
    // against docs/PROTOCOL.md) -- there is no 410 case. A previous version
    // of this function had a dead `res.status === 410` branch here.
    if (e instanceof ApiError && e.status === 404) throw new Error('Invalid or expired link.');
    throw e;
  }
}

export async function claimPendingRelic(
  lobbyId: string,
  name: string,
  email: string
): Promise<{ success: boolean; relic_name: string }> {
  return request('/claim_pending_relic', ClaimPendingRelicResponseSchema, {
    body: { lobby_id: lobbyId, name, email },
    defaultErrorMessage: 'Failed to claim relic',
  });
}
