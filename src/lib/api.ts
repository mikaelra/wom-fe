import { request, ApiError } from '@/lib/http';
import { getSocket, subscribe } from '@/lib/socket';
import {
  setStoredToken,
  getStoredToken,
  setStoredAccountToken,
  getStoredAccountToken,
  getStoredRankedTicket,
  setStoredRankedTicket,
} from '@/lib/http';
import type { z } from 'zod';
import type { Relic } from '@/types/game';
import type { SeasonHistoryEntry, MerchantOfferSchema, MerchantEventSchema } from '@/lib/schemas';
import type { GameEvent } from '@/lib/gameEvents';
import {
  MyAiStatusSchema,
  MyAiToggleResponseSchema,
  MyAiSettingsResponseSchema,
  MyAiMatchesSchema,
  MyAiBotRankedResponseSchema,
  MyAiBotRankedLeaveResponseSchema,
  MyAiBotRankedActiveResponseSchema,
  type MyAiStatus,
  type MyAiKnobs,
  type MyAiOverrideRule,
  type MyAiMatches,
  CreateLobbyResponseSchema,
  GetBossfightLobbyResponseSchema,
  GetNextBossfightTimeResponseSchema,
  BossfightRosterResponseSchema,
  MerchantOfferResponseSchema,
  MerchantPurchaseResponseSchema,
  MerchantRevertTimeResponseSchema,
  MerchantSkyEventsResponseSchema,
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
  DeleteAccountResponseSchema,
  AgeAffirmResponseSchema,
  ConnectionsResponseSchema,
  EntitlementsResponseSchema,
  ConnectWebResponseSchema,
  ChatReportResponseSchema,
  LogOutResponseSchema,
  ClaimPendingWheelResponseSchema,
  ArtifactLedgerResponseSchema,
  ArtifactTranscribedToResponseSchema,
  EquipCosmeticResponseSchema,
  InventoryResponseSchema,
  EquipSkinResponseSchema,
  SpinWheelResponseSchema,
  CheckClaimVerifiedResponseSchema,
  PlayerProfileResponseSchema,
  RankedActiveResponseSchema,
  RankedProfileResponseSchema,
  RankedQueueJoinResponseSchema,
  RankedQueueLeaveResponseSchema,
  SeasonHistoryResponseSchema,
  SeasonInfoResponseSchema,
  WellProfileResponseSchema,
  ShopProductsResponseSchema,
  CheckoutResponseSchema,
  ApplePrepareResponseSchema,
  SteamAuthResponseSchema,
  AppleVerifyResponseSchema,
  SteamFinalizeResponseSchema,
  SteamInitResponseSchema,
  OrderStatusResponseSchema,
  WheelTablesResponseSchema,
  TradeUpRulesResponseSchema,
  TradeUpResponseSchema,
  MarketCatalogResponseSchema,
  MarketListingsResponseSchema,
  MarketEnterResponseSchema,
  MarketAcceptTermsResponseSchema,
  MarketMutationResponseSchema,
  MarketTradesResponseSchema,
} from '@/lib/schemas';
import type { TradeUpRule, TradeUpResult } from '@/lib/tradeUps';
import type { MarketCatalog, MarketItemInput, MarketListing, MarketTrade } from '@/lib/market';

export type ShopProduct = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  kind: 'wheel' | 'skin' | 'ai_credits';
  odds_denominator?: number;
  odds?: { skin: string; weight: number; probability: number }[];
  skin?: string;
  credits_per_pack?: number;
  max_quantity?: number;
};

export async function createLobby(name: string, email: string): Promise<{ lobby_id: string; token: string }> {
  const data = await request('/create_lobby', CreateLobbyResponseSchema, {
    // account_token: a Steam player has no email; their account session is
    // what proves the name is theirs (wom-be routes/steam_auth.py).
    body: { name, email, account_token: getStoredAccountToken() ?? undefined },
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

    getSocket().emit('join_lobby', { lobby_id: joinCode, name, email, account_token: getStoredAccountToken() ?? undefined });
  });
}

export async function getBossfightLobby(playerName: string): Promise<{ lobby_id: string; start_time: string; token?: string }> {
  const data = await request('/get_bossfight_lobby', GetBossfightLobbyResponseSchema, {
    body: { name: playerName },
    defaultErrorMessage: 'Failed to enter the bossfight.',
  });
  // token may be absent when the caller is already a member re-checking in
  // (e.g. a page refresh) -- in that case they're expected to still hold
  // the token from their original join, so don't clobber it.
  if (data.token) setStoredToken(data.lobby_id, data.token);
  const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') ?? '' : '';
  getSocket().emit('join_lobby', { lobby_id: data.lobby_id, name: playerName, email, account_token: getStoredAccountToken() ?? undefined });
  return data;
}

export async function getNextBossfightTime(): Promise<{ start_time: string }> {
  return request('/get_next_bossfight_time', GetNextBossfightTimeResponseSchema, {
    defaultErrorMessage: 'Failed to fetch the next bossfight time',
  });
}

/**
 * Who is in the bossfight right now, without joining it.
 *
 * Note this is NOT getBossfightLobby with a different name: that one is a
 * POST that ADDS the caller to the fight. This is the read-only counterpart
 * added for the city scene, which shows the live bossfight inside the temple
 * you can see from the street.
 */
export type BossfightRoster = z.infer<typeof BossfightRosterResponseSchema>;
export type BossfightRosterPlayer = BossfightRoster['players'][number];

export async function getBossfightRoster(): Promise<BossfightRoster> {
  return request('/get_bossfight_roster', BossfightRosterResponseSchema, {
    quiet: true, // polled
    defaultErrorMessage: 'Failed to fetch the bossfight roster',
  });
}

// docs/MERCHANT_PLAN.md -- the merchants on the globe.

export type MerchantOffer = z.infer<typeof MerchantOfferSchema>;
export type MerchantEvent = z.infer<typeof MerchantEventSchema>;
export type MerchantState = z.infer<typeof MerchantOfferResponseSchema>;

/** `token` may be null (a signed-out viewer) -- the route still answers,
 * with `already_bought_this_period` always false in that case, so the
 * markers themselves can render without requiring a session. */
export async function getMerchantOffer(token: string | null): Promise<MerchantState> {
  return request('/merchant/offer', MerchantOfferResponseSchema, {
    body: { token: token ?? '' },
    defaultErrorMessage: "Failed to reach the Merchant.",
  });
}

/** Buy from one merchant -- `offer` names which (its offer_id and the
 *  event it came for), since a full moon and a conjunction can both have
 *  one in town at once. */
export async function purchaseMerchantOffer(
  token: string,
  offer: Pick<MerchantOffer, 'offer_id' | 'event_key'>,
): Promise<{ ok: boolean; item_name: string }> {
  return request('/merchant/purchase', MerchantPurchaseResponseSchema, {
    body: { token, offer_id: offer.offer_id, event_key: offer.event_key },
    defaultErrorMessage: "Failed to complete the trade.",
  });
}

/** docs/MERCHANT_PLAN.md §7 -- sacrifice one merchant relic (Stone of
 * Vitality or Paper) to turn the sky back, for everyone for an hour, to
 * the instant that copy was bought: every merchant whose event was live
 * then comes back. */
export async function revertMerchantTime(
  token: string,
  relic: string,
  /** Which copy -- each turns time back to its own purchase instant. null
   *  or omitted is the newest. */
  copyId: number | null = null,
): Promise<z.infer<typeof MerchantRevertTimeResponseSchema>> {
  return request('/merchant/revert_time', MerchantRevertTimeResponseSchema, {
    body: copyId === null ? { token, relic } : { token, relic, copy_id: copyId },
    defaultErrorMessage: 'Timewarp failed.',
  });
}

/** The merchant-summoning events live at an instant -- what a relic
 *  bought then would bring back if sacrificed. */
export async function getMerchantSkyEvents(at: string): Promise<MerchantEvent[]> {
  const res = await request(`/merchant/sky_events?at=${encodeURIComponent(at)}`, MerchantSkyEventsResponseSchema, {
    defaultErrorMessage: 'Failed to read the sky.',
  });
  return res.events;
}

// docs/RANK_SYSTEM_PLAN.md §6/§10 -- ranked matchmaking queue + rank badge.

/**
 * What proves to wom-be that this client is `playerName` in ranked: the
 * ranked ticket /ranked/queue/join handed out, and the account session if
 * logged in. Either is enough; undefined fields drop out of the JSON.
 * Also the join_ranked_queue socket payload.
 */
export function rankedCredentials(playerName: string): { ticket?: string; token?: string } {
  return {
    ticket: getStoredRankedTicket(playerName) ?? undefined,
    token: getStoredAccountToken() ?? undefined,
  };
}

export async function joinRankedQueue(playerName: string): Promise<{ status: string; ticket?: string }> {
  const data = await request('/ranked/queue/join', RankedQueueJoinResponseSchema, {
    body: { name: playerName, ...rankedCredentials(playerName) },
    defaultErrorMessage: 'Failed to join the ranked queue.',
  });
  if (data.ticket) setStoredRankedTicket(playerName, data.ticket);
  return data;
}

export async function leaveRankedQueue(playerName: string): Promise<{ status: string; was_queued: boolean }> {
  return request('/ranked/queue/leave', RankedQueueLeaveResponseSchema, {
    body: { name: playerName, ...rankedCredentials(playerName) },
    defaultErrorMessage: 'Failed to leave the ranked queue.',
  });
}

export async function getRankedProfile(
  playerName: string,
): Promise<{ tier: string | null; ranked_games_played: number; principality_rank?: number | null }> {
  return request(`/ranked/profile/${encodeURIComponent(playerName)}`, RankedProfileResponseSchema, {
    defaultErrorMessage: 'Failed to fetch ranked profile.',
  });
}

export async function getCurrentSeason(): Promise<{ name: string; ends_at: string }> {
  return request('/ranked/season', SeasonInfoResponseSchema, {
    defaultErrorMessage: 'Failed to fetch the current season.',
  });
}

export async function getSeasonHistory(
  playerName: string,
): Promise<{ human: SeasonHistoryEntry[]; ai: SeasonHistoryEntry[] }> {
  return request(`/ranked/season_history/${encodeURIComponent(playerName)}`, SeasonHistoryResponseSchema, {
    defaultErrorMessage: 'Failed to fetch season history.',
  });
}

export async function getActiveRankedLobby(
  playerName: string
): Promise<{ lobby_id: string | null; token: string | null; ranked_countdown_deadline: string | null; started: boolean }> {
  const credentials = rankedCredentials(playerName);
  // Nothing to prove who we are with -- the backend would 403, and a
  // player who never queued (or queued on another browser, logged out)
  // has no match here to return to anyway.
  if (!credentials.ticket && !credentials.token) {
    return { lobby_id: null, token: null, ranked_countdown_deadline: null, started: false };
  }
  return request('/ranked/active', RankedActiveResponseSchema, {
    quiet: true, // polled
    body: { name: playerName, ...credentials },
    defaultErrorMessage: 'Failed to check for an active ranked match.',
  });
}

export async function getWellProfile(playerName: string): Promise<{
  well_wins: number;
  rewards: { reward: string; count: number; first_awarded_at: string; expected_share: number }[];
}> {
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

/** Claim an artifact discovered without a verified account. Same shape as
 *  claimPendingWheel, because wom-be reuses the same claim flow for both. */
export async function claimPendingArtifact(
  lobbyId: string,
  name: string,
  email: string
): Promise<{ success: boolean; pending_verification?: boolean }> {
  return request('/claim_pending_artifact', ClaimPendingWheelResponseSchema, {
    body: { lobby_id: lobbyId, name, email },
    defaultErrorMessage: 'Failed to claim artifact',
  });
}

/** One Artifact this one was transcribed to (wom-be MARKET_PLAN.md §1B). */
export type TranscribedEntry = {
  id?: number;
  name: string;
  origin: string;
  copy_number?: number;
  transcribed_count?: number;
  at: string | null;
};

export async function getInventory(
  token: string
): Promise<{
  name?: string;
  equipped_skin: string;
  skins: { skin: string; count: number }[];
  wheels: { id: number; kind: string }[];
  equipped_cosmetic?: string | null;
  artifact?: {
    ordinal: number | null;
    discovered_at: string | null;
    cosmetic: string;
    origin?: string | null;
    origin_ordinal?: number | null;
    origin_order?: number | null;
    reproduced_to?: TranscribedEntry[];
  } | null;
  ai_credits?: number;
}> {
  return request('/inventory', InventoryResponseSchema, {
    body: { token },
    defaultErrorMessage: 'Failed to load inventory.',
  });
}

/** Equip a cosmetic, or unequip by passing an empty string. Unequipping is
 *  always allowed -- taking something off needs no ownership check. */
export async function equipCosmetic(
  token: string,
  cosmetic: string
): Promise<{ success: boolean; equipped_cosmetic: string | null }> {
  try {
    return await request('/inventory/equip_cosmetic', EquipCosmeticResponseSchema, {
      body: { token, cosmetic },
      defaultErrorMessage: 'Failed to equip cosmetic.',
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) throw new Error('You do not own this cosmetic.');
    throw e;
  }
}

/** The discovery ledger: every artifact ever found, oldest first.
 *
 *  Readable only by someone who has discovered one themselves -- the server
 *  answers 403 otherwise, which callers should treat as "sealed" rather than
 *  as a failure. Keyset-paginated on ordinal: pass the last ordinal seen as
 *  `after`. */
/** Who another Artifact was transcribed to -- following the list down a
 *  chain (wom-be routes/artifacts.py). */
export async function getArtifactTranscribedTo(
  token: string,
  artifactId: number,
): Promise<{ name: string; transcribed_to: TranscribedEntry[] }> {
  return request('/artifacts/transcribed_to', ArtifactTranscribedToResponseSchema, {
    body: { token, artifact_id: artifactId },
    defaultErrorMessage: 'Failed to load who it was transcribed to.',
  });
}

export async function getArtifactLedger(
  token: string,
  after = 0,
  limit = 100
): Promise<{
  artifacts: { ordinal: number; finder_name: string; discovered_at: string | null }[];
  total: number;
  current_chance: number;
}> {
  return request('/artifacts/ledger', ArtifactLedgerResponseSchema, {
    body: { token, after, limit },
    defaultErrorMessage: 'Failed to load the artifact ledger.',
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
  // `purpose` is a plain string, not a union of the purposes this build
  // knows: wom-be can add one (it added 'claim_artifact') and a caller that
  // cannot name it should still be able to report success, since by this
  // point the backend has already done the work. See
  // ConfirmEmailVerificationResponseSchema.
): Promise<{ success: boolean; purpose: string; relic_name?: string | null }> {
  try {
    const data = await request('/confirm_email_verification', ConfirmEmailVerificationResponseSchema, {
      body: { token },
      defaultErrorMessage: 'Failed to confirm.',
    });
    // Clicking this link is proof of inbox ownership, same as a direct
    // login -- store the session so e.g. a claim_wheel redirect into
    // /inventory actually shows something instead of "log in first".
    if (data.session_token) setStoredAccountToken(data.session_token);
    // A connect_web link opens in a browser that has never seen this
    // account: remember who is logged in, as the login page does.
    if (data.name && data.email) {
      localStorage.setItem('playerName', data.name);
      localStorage.setItem('playerEmail', data.email);
    }
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
    quiet: true, // polled
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
): Promise<{
  name: string;
  email: string | null;
  always_verify_email: boolean;
  email_verified: boolean;
  age_affirmed?: boolean;
}> {
  return request('/resolve_account_session', ResolveAccountSessionResponseSchema, {
    body: { token },
    defaultErrorMessage: 'Invalid or expired session.',
  });
}

/** Delete the logged-in account for good (wom-be routes/account.py). The
 *  player confirms by typing their exact name. On success this browser is
 *  logged out too -- the backend has already revoked every session. */
export async function deleteAccount(token: string, confirmName: string): Promise<void> {
  await request('/account/delete', DeleteAccountResponseSchema, {
    body: { token, confirm_name: confirmName },
    defaultErrorMessage: 'Could not delete your account.',
  });
  setStoredAccountToken(null);
}

/** Record that the player confirmed they're 18 or older (or have guardian
 *  consent). */
export async function affirmAge(token: string): Promise<void> {
  await request('/account/age', AgeAffirmResponseSchema, {
    body: { token },
    defaultErrorMessage: 'Could not save your answer.',
  });
}

/** Settings -> Connections: where else the logged-in account plays. */
export async function getConnections(token: string): Promise<z.infer<typeof ConnectionsResponseSchema>> {
  return request('/account/connections', ConnectionsResponseSchema, {
    body: { token },
    defaultErrorMessage: 'Could not load your connections.',
  });
}

/** What the logged-in account has paid for beyond items -- HD textures on
 *  the web (lib/hdTextures.ts). */
export async function getEntitlements(token: string): Promise<z.infer<typeof EntitlementsResponseSchema>> {
  return request('/account/entitlements', EntitlementsResponseSchema, {
    body: { token },
    defaultErrorMessage: 'Could not load your account.',
  });
}

/** Email a link that lets this account log in on the web too (an account
 *  without an email -- one made on Steam). */
export async function connectWeb(token: string, email: string): Promise<void> {
  await request('/account/connect_web', ConnectWebResponseSchema, {
    body: { token, email },
    defaultErrorMessage: 'Could not send the email.',
  });
}

/** Report another player's chat message (wom-be routes/chat_report.py).
 *  `token` is null for a player without an account. */
export async function reportChatMessage(
  token: string | null,
  report: { reportedName: string; message: string; context: 'lobby' | 'market'; complaint: string },
): Promise<void> {
  await request('/chat/report', ChatReportResponseSchema, {
    body: {
      token,
      reported_name: report.reportedName,
      message: report.message,
      context: report.context,
      complaint: report.complaint,
    },
    defaultErrorMessage: 'Could not send the report.',
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

// Each Steam call also sends the Steam account's name (steamName), which the
// backend keeps for Settings -> Connections on other devices.

/** Log in with a Steam auth ticket (src/lib/steamAccount.ts). */
export async function postSteamLogin(
  ticket: string,
  steamName: string | null = null
): Promise<z.infer<typeof SteamAuthResponseSchema>> {
  return request('/auth/steam', SteamAuthResponseSchema, {
    body: { ticket, steam_name: steamName },
    defaultErrorMessage: 'Steam login failed.',
  });
}

/** A new account for this Steam account ("Play now"). */
export async function postSteamCreate(
  ticket: string,
  name: string,
  steamName: string | null = null
): Promise<z.infer<typeof SteamAuthResponseSchema>> {
  return request('/auth/steam/create', SteamAuthResponseSchema, {
    body: { ticket, name, steam_name: steamName },
    defaultErrorMessage: 'Could not create the account.',
  });
}

/** This Steam account logs into the logged-in account from now on. */
export async function postSteamLink(
  ticket: string,
  token: string,
  steamName: string | null = null
): Promise<z.infer<typeof SteamAuthResponseSchema>> {
  return request('/auth/steam/link', SteamAuthResponseSchema, {
    body: { ticket, token, steam_name: steamName },
    defaultErrorMessage: 'Could not link your Steam account.',
  });
}

// The iOS app logs in with its signed AppTransaction (src/lib/appleAccount.ts,
// wom-be routes/apple_auth.py); the answers are the Steam calls' answers.

/** Log in with the Apple account the iOS app was got with. */
export async function postAppleLogin(appTransaction: string): Promise<z.infer<typeof SteamAuthResponseSchema>> {
  return request('/auth/apple', SteamAuthResponseSchema, {
    body: { app_transaction: appTransaction },
    defaultErrorMessage: 'Apple login failed.',
  });
}

/** A new account for this Apple account ("Play now"). */
export async function postAppleCreate(
  appTransaction: string,
  name: string
): Promise<z.infer<typeof SteamAuthResponseSchema>> {
  return request('/auth/apple/create', SteamAuthResponseSchema, {
    body: { app_transaction: appTransaction, name },
    defaultErrorMessage: 'Could not create the account.',
  });
}

/** This Apple account logs into the logged-in account from now on. */
export async function postAppleLink(
  appTransaction: string,
  token: string
): Promise<z.infer<typeof SteamAuthResponseSchema>> {
  return request('/auth/apple/link', SteamAuthResponseSchema, {
    body: { app_transaction: appTransaction, token },
    defaultErrorMessage: 'Could not link your Apple account.',
  });
}

/** The iOS app's shop (src/lib/appleShop.ts): what may be sold in this App
 *  Store country, and the token StoreKit stamps on the purchase. */
export async function postApplePrepare(
  token: string,
  storefront?: string
): Promise<z.infer<typeof ApplePrepareResponseSchema>> {
  return request('/shop/apple/prepare', ApplePrepareResponseSchema, {
    body: { token, storefront },
    defaultErrorMessage: 'Failed to load the shop.',
  });
}

/** Hand a StoreKit purchase's signed transaction to the backend to grant. */
export async function postAppleVerify(
  token: string,
  signedTransaction: string
): Promise<z.infer<typeof AppleVerifyResponseSchema>> {
  return request('/shop/apple/verify', AppleVerifyResponseSchema, {
    body: { token, signed_transaction: signedTransaction },
    defaultErrorMessage: 'Failed to deliver the purchase.',
  });
}

/** Start a Steam Wallet purchase in the Steam build (src/lib/steamShop.ts).
 *  `web` makes it a web purchase, approved on the page in steam_url (Linux,
 *  which has no Steam overlay). */
export async function postSteamInit(
  token: string,
  product: string,
  quantity: number,
  confirmDuplicate: boolean,
  language: string,
  web = false
): Promise<z.infer<typeof SteamInitResponseSchema>> {
  return request('/shop/steam/init', SteamInitResponseSchema, {
    body: { token, product, quantity, confirm_duplicate: confirmDuplicate, language, ...(web ? { web: true } : {}) },
    defaultErrorMessage: 'Failed to start the purchase.',
  });
}

/** Pass on the player's answer to Steam's purchase dialog. */
export async function postSteamFinalize(
  token: string,
  orderId: number,
  authorized: boolean
): Promise<z.infer<typeof SteamFinalizeResponseSchema>> {
  return request('/shop/steam/finalize', SteamFinalizeResponseSchema, {
    body: { token, order_id: orderId, authorized },
    defaultErrorMessage: 'Failed to complete the purchase.',
  });
}

/** Ask whether a Steam web purchase has been approved yet: "fulfilled",
 *  "pending", or anything else when it won't go through. */
export async function postSteamCheck(
  token: string,
  orderId: number
): Promise<z.infer<typeof SteamFinalizeResponseSchema>> {
  return request('/shop/steam/finalize', SteamFinalizeResponseSchema, {
    body: { token, order_id: orderId, check: true },
    defaultErrorMessage: 'Failed to check the purchase.',
    quiet: true, // polled
  });
}

export async function getOrderStatus(
  token: string,
  orderId: string | number,
): Promise<{ status: string; product: string; fulfilled: boolean }> {
  return request('/shop/order', OrderStatusResponseSchema, {
    quiet: true, // polled
    body: { token, order_id: orderId },
    defaultErrorMessage: 'Failed to check the order.',
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

// docs/TRADE_UP_PLAN.md §6/§8.1 -- trade-up rules and the trade itself.

export async function getTradeUpRules(): Promise<{ rules: Record<string, TradeUpRule> }> {
  return request('/tradeup/rules', TradeUpRulesResponseSchema, {
    defaultErrorMessage: 'Failed to load trade-up rules.',
  });
}

export async function tradeUp(token: string, skin: string): Promise<TradeUpResult> {
  try {
    return await request('/inventory/trade_up', TradeUpResponseSchema, {
      body: { token, skin },
      defaultErrorMessage: 'Failed to trade up.',
    });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'insufficient_copies') throw new Error('You no longer have enough copies.');
      if (e.code === 'email_unverified') throw new Error('Verify your email to trade up.');
      if (e.code === 'not_tradeable') throw new Error("This skin can't be traded up.");
    }
    throw e;
  }
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

// ── Market -- the player-to-player trading post (wom-be docs/MARKET_PLAN.md,
//    direct-swap model §1A) ──────────────────────────────────────────────────

/** The "want" picker's item catalog + the RMT disclaimer text/version.
 *  Public, cacheable -- no token. */
export async function getMarketCatalog(): Promise<MarketCatalog> {
  return request('/market/catalog', MarketCatalogResponseSchema, {
    defaultErrorMessage: 'Failed to load the market catalog.',
  });
}

/** Every open, unexpired listing plus the server clock (so "time remaining"
 *  is measured against the server, not a skewed local clock). Public read. */
export async function getMarketListings(): Promise<{
  listings: MarketListing[];
  server_time: string;
}> {
  return request('/market/listings', MarketListingsResponseSchema, {
    defaultErrorMessage: 'Failed to load the market.',
  });
}

/** The caller's own completed trades, newest first -- the market's
 *  History button. Session-gated. Keyset-paginated: pass the previous
 *  page's `next_before` to fetch the page below it. */
export async function getMarketTrades(
  token: string,
  opts: { before?: number; limit?: number } = {},
): Promise<{ trades: MarketTrade[]; has_more: boolean; next_before: number | null }> {
  return request('/market/trades', MarketTradesResponseSchema, {
    body: { token, ...(opts.before != null ? { before: opts.before } : {}), ...(opts.limit != null ? { limit: opts.limit } : {}) },
    defaultErrorMessage: 'Failed to load your trade history.',
  });
}

/** Per-player page bootstrap: has this player accepted the current terms,
 *  and how many Hades' Coins do they hold (the /longoffer cost). */
export async function enterMarket(token: string): Promise<{
  player_id: number;
  player_name: string;
  terms_accepted: boolean;
  terms_version: string;
  coins: number;
  ai_credits: number;
  email_verified: boolean;
}> {
  return request('/market/enter', MarketEnterResponseSchema, {
    body: { token },
    defaultErrorMessage: 'Failed to enter the market.',
  });
}

/** Record acceptance of the current RMT disclaimer version -- what the
 *  "I understand" gate calls before retrying the action it blocked. */
export async function acceptMarketTerms(token: string): Promise<{
  terms_accepted: boolean;
  terms_version: string;
}> {
  return request('/market/accept_terms', MarketAcceptTermsResponseSchema, {
    body: { token },
    defaultErrorMessage: 'Failed to record acceptance.',
  });
}

function mapMarketError(e: unknown): never {
  if (e instanceof ApiError) {
    if (e.code === 'email_unverified') throw new Error('Verify your email to trade.');
    if (e.code === 'terms_not_accepted') throw new Error('Acknowledge the trading rules first.');
    if (e.code === 'give_not_owned') throw new Error("You don't own everything you're offering.");
    if (e.code === 'insufficient_coins') throw new Error("You don't have that many Hades' Coins.");
    if (e.code === 'seller_item_gone') throw new Error('The other player no longer owns everything in this trade.');
    if (e.code === 'your_item_gone') throw new Error("You no longer own everything this trade asks for.");
    if (e.code === 'own_listing') throw new Error("You can't accept your own trade.");
    if (e.code === 'not_open') throw new Error('That trade is no longer open.');
    if (e.code === 'expired') throw new Error('That trade has expired.');
    if (e.code === 'not_found') throw new Error('That trade is gone.');
  }
  throw e;
}

/** Craft-and-post a trade. `kind` 'quick' (free, 60s) or 'long' (1-4 coins,
 *  6h each). Both sides need >= 1 item and may be uneven. */
export async function createMarketListing(
  token: string,
  input: { kind: 'quick' | 'long'; coins: number; give: MarketItemInput[]; want: MarketItemInput[] },
): Promise<{ listing: MarketListing }> {
  try {
    return await request('/market/listings', MarketMutationResponseSchema, {
      body: { token, ...input },
      defaultErrorMessage: 'Failed to post the trade.',
    });
  } catch (e) {
    mapMarketError(e);
  }
}

/** Accept someone else's listing -- the atomic swap. Caller is the accepter
 *  and must own every requested item. */
export async function acceptMarketListing(
  token: string,
  listingId: number,
): Promise<{ listing: MarketListing; reproduced?: { to: string; origin: string | null } }> {
  try {
    return await request(`/market/listings/${listingId}/accept`, MarketMutationResponseSchema, {
      body: { token },
      defaultErrorMessage: 'Failed to accept the trade.',
    });
  } catch (e) {
    mapMarketError(e);
  }
}

/** Cancel your own open listing. /longoffer coins are not refunded. */
export async function cancelMarketListing(
  token: string,
  listingId: number,
): Promise<{ listing: MarketListing }> {
  try {
    return await request(`/market/listings/${listingId}/cancel`, MarketMutationResponseSchema, {
      body: { token },
      defaultErrorMessage: 'Failed to cancel the trade.',
    });
  } catch (e) {
    mapMarketError(e);
  }
}

// ---------------------------------------------------------------------------
// "My AI" -- the personal AI that competes in bot ranked
// (wom-be docs/MY_AI.md §9.2)
// ---------------------------------------------------------------------------

export async function getMyAiStatus(token: string): Promise<MyAiStatus> {
  return request('/my_ai/status', MyAiStatusSchema, {
    body: { token },
    defaultErrorMessage: 'Failed to load your AI.',
  });
}

export async function toggleMyAi(
  token: string,
  enabled: boolean,
): Promise<{ enabled: boolean; queued: boolean; reason: string }> {
  return request('/my_ai/toggle', MyAiToggleResponseSchema, {
    body: { token, enabled },
    defaultErrorMessage: 'Failed to toggle your AI.',
  });
}

export async function saveMyAiSettings(
  token: string,
  settings: { minute_counter?: number; knobs?: MyAiKnobs; override_rules?: MyAiOverrideRule[] },
): Promise<z.infer<typeof MyAiSettingsResponseSchema>> {
  return request('/my_ai/settings', MyAiSettingsResponseSchema, {
    body: { token, ...settings },
    defaultErrorMessage: 'Failed to save settings.',
  });
}

export async function getMyAiMatches(token: string): Promise<MyAiMatches> {
  return request('/my_ai/matches', MyAiMatchesSchema, {
    body: { token },
    defaultErrorMessage: 'Failed to load match history.',
  });
}

/**
 * Join the bot-ranked matchmaking queue (docs/MY_AI.md §4). Real players
 * queue and are grouped into ONE shared lobby (30s countdown), padded
 * with Wolf/Owl/Turtle in the last few seconds so even a lone queuer
 * plays a full table. Always free -- My AI credits gate only the
 * autonomous queue, never a player practising here.
 *
 * This call just enters the queue; the {lobby_id, token} arrives over the
 * ai_ranked_match_found socket push (see useBotRankedQueue), same shape
 * as human ranked.
 */
export async function joinBotRankedQueue(
  accountToken: string,
): Promise<{ queued: boolean; queue_size?: number }> {
  return request('/my_ai/bot_ranked', MyAiBotRankedResponseSchema, {
    body: { token: accountToken },
    defaultErrorMessage: 'Failed to join the bot-ranked queue.',
  });
}

export async function leaveBotRankedQueue(
  accountToken: string,
): Promise<{ left: boolean; was_queued: boolean }> {
  return request('/my_ai/bot_ranked/leave', MyAiBotRankedLeaveResponseSchema, {
    body: { token: accountToken },
    defaultErrorMessage: 'Failed to leave the bot-ranked queue.',
  });
}

export async function getActiveBotRankedLobby(
  accountToken: string,
): Promise<{
  lobby_id: string | null;
  token: string | null;
  ai_ranked_countdown_deadline: string | null;
  started: boolean;
}> {
  return request('/my_ai/bot_ranked/active', MyAiBotRankedActiveResponseSchema, {
    quiet: true, // polled
    body: { token: accountToken },
    defaultErrorMessage: 'Failed to check for an active bot-ranked match.',
  });
}
