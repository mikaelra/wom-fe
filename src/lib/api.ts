import { request, ApiError } from '@/lib/http';
import { getSocket, subscribe } from '@/lib/socket';
import { setStoredToken, getStoredToken, setStoredAccountToken } from '@/lib/http';
import type { z } from 'zod';
import type { Relic } from '@/types/game';
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
  ArtifactLedgerResponseSchema,
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
  WellProfileResponseSchema,
  ShopProductsResponseSchema,
  CheckoutResponseSchema,
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
    defaultErrorMessage: 'Failed to enter the bossfight.',
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
    defaultErrorMessage: 'Failed to fetch the bossfight roster',
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

export async function getInventory(
  token: string
): Promise<{
  equipped_skin: string;
  skins: { skin: string; count: number }[];
  wheels: { id: number; kind: string }[];
  equipped_cosmetic?: string | null;
  artifact?: { ordinal: number; discovered_at: string | null; cosmetic: string } | null;
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

export async function getOrderStatus(
  token: string,
  orderId: string | number,
): Promise<{ status: string; product: string; fulfilled: boolean }> {
  return request('/shop/order', OrderStatusResponseSchema, {
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
): Promise<{ listing: MarketListing }> {
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
    body: { token: accountToken },
    defaultErrorMessage: 'Failed to check for an active bot-ranked match.',
  });
}
