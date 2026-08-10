import { request, ApiError } from '@/lib/http';
import { getSocket, subscribe } from '@/lib/socket';
import { setStoredToken, getStoredToken, setStoredAccountToken } from '@/lib/http';
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
  ClaimNameResponseSchema,
  ClaimPendingRelicResponseSchema,
  ConfirmEmailVerificationResponseSchema,
  ForgotUsernameResponseSchema,
  ResolveAccountSessionResponseSchema,
  LogOutResponseSchema,
  ClaimPendingWheelResponseSchema,
  InventoryResponseSchema,
  EquipSkinResponseSchema,
  SpinWheelResponseSchema,
  CheckClaimVerifiedResponseSchema,
  PlayerProfileResponseSchema,
  RankedActiveResponseSchema,
  RankedProfileResponseSchema,
  RankedQueueJoinResponseSchema,
  RankedQueueLeaveResponseSchema,
  WellProfileResponseSchema,
  ShopProductsResponseSchema,
  CheckoutResponseSchema,
  WheelTablesResponseSchema,
} from '@/lib/schemas';

export type ShopProduct = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  kind: 'wheel' | 'skin';
  odds_denominator?: number;
  odds?: { skin: string; weight: number; probability: number }[];
  skin?: string;
};

export async function createLobby(name: string, email: string): Promise<{ lobby_id: string; token: string }> {
  const data = await request('/create_lobby', CreateLobbyResponseSchema, {
    body: { name, email },
    defaultErrorMessage: 'Create lobby failed',
  });
  setStoredToken(data.lobby_id, data.token);
  return data;
}

export async function joinLobby(joinCode: string, name: string, email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const unsubJoined = subscribe('joined_lobby', (data) => {
      unsubJoined();
      unsubError();
      setStoredToken(data.lobby_id, data.token);
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
  if (data.token) setStoredToken(data.lobby_id, data.token);
  const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') ?? '' : '';
  getSocket().emit('join_lobby', { lobby_id: data.lobby_id, name: playerName, email });
  return data;
}

export async function getNextBossfightTime(): Promise<{ start_time: string }> {
  return request('/get_next_bossfight_time', GetNextBossfightTimeResponseSchema, {
    defaultErrorMessage: 'Failed to fetch next boss fight time',
  });
}

// docs/RANK_SYSTEM_PLAN.md §6/§10 -- ranked matchmaking queue + rank badge.

export async function joinRankedQueue(playerName: string): Promise<{ status: string }> {
  return request('/ranked/queue/join', RankedQueueJoinResponseSchema, {
    body: { name: playerName },
    defaultErrorMessage: 'Failed to join the ranked queue.',
  });
}

export async function leaveRankedQueue(playerName: string): Promise<{ status: string; was_queued: boolean }> {
  return request('/ranked/queue/leave', RankedQueueLeaveResponseSchema, {
    body: { name: playerName },
    defaultErrorMessage: 'Failed to leave the ranked queue.',
  });
}

export async function getRankedProfile(playerName: string): Promise<{ tier: string | null; ranked_games_played: number }> {
  return request(`/ranked/profile/${encodeURIComponent(playerName)}`, RankedProfileResponseSchema, {
    defaultErrorMessage: 'Failed to fetch ranked profile.',
  });
}

export async function getActiveRankedLobby(
  playerName: string
): Promise<{ lobby_id: string | null; token: string | null; ranked_countdown_deadline: string | null; started: boolean }> {
  return request(`/ranked/active/${encodeURIComponent(playerName)}`, RankedActiveResponseSchema, {
    defaultErrorMessage: 'Failed to check for an active ranked match.',
  });
}

export async function getWellProfile(
  playerName: string
): Promise<{ well_wins: number; rewards: { reward: string; count: number; first_awarded_at: string }[] }> {
  return request(`/well/profile/${encodeURIComponent(playerName)}`, WellProfileResponseSchema, {
    defaultErrorMessage: 'Failed to fetch well profile.',
  });
}

export async function getPlayerProfile(
  playerName: string,
): Promise<{ created_at: string | null; played_games: number; wins: number; kills: number }> {
  return request(`/player/profile/${encodeURIComponent(playerName)}`, PlayerProfileResponseSchema, {
    defaultErrorMessage: 'Failed to fetch player profile.',
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
): Promise<{ messages: (string | string[])[]; events: GameEvent[]; instakill: boolean }> {
  // Backend Phase 1b: messages/events are private data, gated behind the
  // session token issued on join (see getStoredToken). A stale tab that
  // never (re)joined has no token -- fetch will 403 and fall through to
  // the empty-result fallback below, same as any other failure.
  const token = getStoredToken(lobbyId);
  const path = token
    ? `/get_player_messages/${lobbyId}/${playerName}?token=${encodeURIComponent(token)}`
    : `/get_player_messages/${lobbyId}/${playerName}`;
  try {
    const data = await request(path, GetPlayerMessagesResponseSchema);
    return { messages: data.messages, events: data.events, instakill: data.instakill ?? false };
  } catch {
    return { messages: [], events: [], instakill: false };
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
    const data = await request('/log_in', LogInResponseSchema, {
      body: { name, email },
      defaultErrorMessage: 'Log in failed',
    });
    if (data.session_token) setStoredAccountToken(data.session_token);
    return data;
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
    const data = await request('/verify_code', VerifyLoginCodeResponseSchema, {
      body: { name, code },
      defaultErrorMessage: 'Verification failed',
    });
    if (data.session_token) setStoredAccountToken(data.session_token);
    return data;
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
): Promise<{ success: boolean; pending_verification?: boolean; relic_name?: string }> {
  return request('/claim_pending_relic', ClaimPendingRelicResponseSchema, {
    body: { lobby_id: lobbyId, name, email },
    defaultErrorMessage: 'Failed to claim relic',
  });
}

export async function claimPendingWheel(
  lobbyId: string,
  name: string,
  email: string
): Promise<{ success: boolean; pending_verification?: boolean }> {
  return request('/claim_pending_wheel', ClaimPendingWheelResponseSchema, {
    body: { lobby_id: lobbyId, name, email },
    defaultErrorMessage: 'Failed to claim wheel',
  });
}

export async function getInventory(
  token: string
): Promise<{ equipped_skin: string; skins: { skin: string; count: number }[]; wheels: { id: number; kind: string }[] }> {
  return request('/inventory', InventoryResponseSchema, {
    body: { token },
    defaultErrorMessage: 'Failed to load inventory.',
  });
}

export async function equipSkin(token: string, skin: string): Promise<{ success: boolean; equipped_skin: string }> {
  try {
    return await request('/inventory/equip', EquipSkinResponseSchema, {
      body: { token, skin },
      defaultErrorMessage: 'Failed to equip skin.',
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) throw new Error('You do not own this skin.');
    throw e;
  }
}

export async function spinWheel(token: string, wheelId: number): Promise<{ success: boolean; result_skin: string }> {
  try {
    return await request('/wheel/spin', SpinWheelResponseSchema, {
      body: { token, wheel_id: wheelId },
      defaultErrorMessage: 'Failed to spin wheel.',
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new Error('Wheel not found or already spun.');
    throw e;
  }
}

export async function claimName(
  name: string,
  email: string
): Promise<{ success: boolean; pending_verification?: boolean }> {
  return request('/claim_name', ClaimNameResponseSchema, {
    body: { name, email },
    defaultErrorMessage: 'Signup failed.',
  });
}

export async function confirmEmailVerification(
  token: string
): Promise<{ success: boolean; purpose: 'claim_name' | 'claim_relic' | 'claim_wheel'; relic_name?: string | null }> {
  try {
    const data = await request('/confirm_email_verification', ConfirmEmailVerificationResponseSchema, {
      body: { token },
      defaultErrorMessage: 'Failed to confirm.',
    });
    // Clicking this link is proof of inbox ownership, same as a direct
    // login -- store the session so e.g. a claim_wheel redirect into
    // /inventory actually shows something instead of "log in first".
    if (data.session_token) setStoredAccountToken(data.session_token);
    return data;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 404) throw new Error('Invalid or expired link.');
      if (e.status === 409) throw new Error('Name already claimed by a different email.');
    }
    throw e;
  }
}

export async function forgotUsername(email: string): Promise<{ success: boolean }> {
  return request('/forgot_username', ForgotUsernameResponseSchema, {
    body: { email },
    defaultErrorMessage: 'Failed to send email.',
  });
}

export async function checkClaimVerified(name: string, email: string): Promise<{ verified: boolean }> {
  const data = await request('/check_claim_verified', CheckClaimVerifiedResponseSchema, {
    body: { name, email },
    defaultErrorMessage: 'Failed to check verification status.',
  });
  // Cross-device claim polling: this is the device that never saw the
  // session /confirm_email_verification issued on whichever device actually
  // clicked the link (see WheelClaimNudge/BossSignupNudge and the
  // inventory page's own pending-claim check).
  if (data.session_token) setStoredAccountToken(data.session_token);
  return { verified: data.verified };
}

export async function resolveAccountSession(
  token: string
): Promise<{ name: string; email: string | null; always_verify_email: boolean; email_verified: boolean }> {
  return request('/resolve_account_session', ResolveAccountSessionResponseSchema, {
    body: { token },
    defaultErrorMessage: 'Invalid or expired session.',
  });
}

// docs/MONETIZATION_PLAN.md §5.3/§8 -- shop, checkout.

export async function getShopProducts(): Promise<{
  shop_enabled: boolean;
  terms_version: string;
  products: ShopProduct[];
}> {
  return request('/shop/products', ShopProductsResponseSchema, {
    defaultErrorMessage: 'Failed to load the shop.',
  });
}

export async function postCheckout(
  token: string,
  product: string,
  confirmDuplicate?: boolean,
  quantity?: number
): Promise<{ checkout_url: string; order_id: number }> {
  return request('/shop/checkout', CheckoutResponseSchema, {
    body: { token, product, confirm_duplicate: confirmDuplicate, quantity },
    defaultErrorMessage: 'Failed to start checkout.',
  });
}

// GET /wheel/tables -- public, unauthenticated. Not currently used by
// WheelSpinModal (still its own local table, docs/MONETIZATION_PLAN.md
// §2.3 item 3's remaining tail -- both copies are hand-verified identical
// today, so this is a maintenance debt, not a live discrepancy); exposed
// here for the shop page's own odds display if it ever needs a table
// outside a specific product's already-embedded `odds`.
export async function getWheelTables(): Promise<{
  normal: { skin: string; weight: number; probability: number }[];
  special: { skin: string; weight: number; probability: number }[];
}> {
  return request('/wheel/tables', WheelTablesResponseSchema, {
    defaultErrorMessage: 'Failed to load wheel odds.',
  });
}

export async function logOut(token: string | null): Promise<{ success: boolean }> {
  // Clear the local credential unconditionally, before attempting the
  // server-side revoke -- an unreachable backend shouldn't stop this
  // browser from considering itself logged out. The revoke call is
  // best-effort cleanup on top of that, not a precondition for it.
  setStoredAccountToken(null);
  if (!token) return { success: true };
  try {
    return await request('/log_out', LogOutResponseSchema, {
      body: { token },
      defaultErrorMessage: 'Failed to log out.',
    });
  } catch {
    return { success: true };
  }
}
