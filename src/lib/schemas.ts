import { z } from 'zod';
import { RelicSchema } from '@/types/game';
import { GameEventSchema } from '@/lib/gameEvents';

// Response/payload schemas for every server-sent shape the frontend
// actually consumes, built directly against wom-be's docs/PROTOCOL.md (the
// golden-tested source of truth) rather than assumption. Routes the
// frontend never calls (get_history, get_player_history, the HTTP
// join_lobby route) and routes that don't exist on the backend at all
// (get_state, request_replay) intentionally have no schema here — see
// docs/CODEBASE_HARDENING_PLAN.md's Phase 1 writeup.

// ── HTTP response schemas ───────────────────────────────────────────────────

export const CreateLobbyResponseSchema = z.object({
  lobby_id: z.string(),
  token: z.string(),
});

export const GetBossfightLobbyResponseSchema = z.object({
  lobby_id: z.string(),
  start_time: z.string(),
  // Absent entirely (not null) when the caller already had a token from an
  // earlier join and is just re-checking in (e.g. a page refresh) — see
  // api.ts's getBossfightLobby.
  token: z.string().optional(),
});

export const GetNextBossfightTimeResponseSchema = z.object({
  start_time: z.string(),
});

/**
 * GET /get_bossfight_roster -- who is standing in the bossfight right now,
 * readable without joining it (backend docs/PROTOCOL.md).
 *
 * Presence only, and the shape is the point: the route is unauthenticated,
 * so a name and a cosmetic skin is all it is allowed to carry. If the
 * backend ever starts sending more, this schema strips it rather than
 * letting it reach the scene.
 */
export const BossfightRosterResponseSchema = z.object({
  lobby_id: z.string().nullable(),
  round: z.number().int(),
  start_time: z.string().nullable(),
  players: z.array(z.object({
    name: z.string(),
    skin: z.string().nullable(),
    alive: z.boolean(),
    spectator: z.boolean(),
    bot: z.boolean(),
  })),
});

export const GetPlayerRelicsResponseSchema = z.object({
  relics: z.array(RelicSchema),
});

// `messages` is a genuine mix of plain strings and single/multi-element
// string arrays — confirmed directly against wom-be's engine code: most
// entries are appended as plain strings (e.g. engine/phases/attacks.py's
// `p["messages"] += ["..."]`), but several are inserted as one-element
// lists (e.g. engine/rewards.py's `winner["messages"].insert(1, ["You got
// 2 coins!"])`). The existing `.flat()` call in SceneOverlay.tsx already
// handles both shapes; this schema just makes that contract explicit.
export const GetPlayerMessagesResponseSchema = z.object({
  player: z.string(),
  messages: z.array(z.union([z.string(), z.array(z.string())])),
  events: z.array(GameEventSchema),
  // Whether this player currently holds an active Poisoned Dagger charge --
  // private per-player (this route is token-gated), unlike state_update
  // which is broadcast to the whole lobby room. See routes/lobby.py.
  instakill: z.boolean().optional(),
});

export const CheckNameResponseSchema = z.object({
  claimed: z.boolean(),
});

export const LogInResponseSchema = z.object({
  success: z.boolean(),
  requires_code: z.boolean().optional(),
  always_verify_email: z.boolean().optional(),
  session_token: z.string().optional(),
});

export const VerifyLoginCodeResponseSchema = z.object({
  success: z.boolean(),
  always_verify_email: z.boolean().optional(),
  session_token: z.string().nullable().optional(),
});

export const ResolveAccountSessionResponseSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  always_verify_email: z.boolean(),
  email_verified: z.boolean(),
});

export const LogOutResponseSchema = z.object({
  success: z.boolean(),
});

export const GetAlwaysVerifyEmailFlagResponseSchema = z.object({
  always_verify_email: z.boolean(),
});

export const RequestToggleVerifyEmailResponseSchema = z.object({
  success: z.boolean(),
});

export const ConfirmToggleVerifyEmailResponseSchema = z.object({
  success: z.boolean(),
  always_verify_email: z.boolean(),
});

export const ClaimNameResponseSchema = z.object({
  success: z.boolean(),
  pending_verification: z.boolean().optional(),
});

export const ClaimPendingRelicResponseSchema = z.object({
  success: z.boolean(),
  pending_verification: z.boolean().optional(),
  relic_name: z.string().optional(),
});

export const ConfirmEmailVerificationResponseSchema = z.object({
  success: z.boolean(),
  // Deliberately not z.enum. This was pinned to
  // ['claim_name', 'claim_relic', 'claim_wheel'] and the day wom-be added a
  // fourth purpose ('claim_artifact') every verification link of that kind
  // died on this line -- the backend had already verified the email, issued
  // the session and granted the item, and the only thing that failed was
  // this page's ability to describe it. A closed enum here turns "wom-be
  // knows a word we don't" into a hard failure of work that already
  // succeeded, which is exactly the deploy-independence problem the wire
  // schema in types/game.ts documents. The page falls back to a generic
  // confirmation for a purpose it does not recognise.
  purpose: z.string(),
  relic_name: z.string().nullable().optional(),
  session_token: z.string().optional(),
});

export const ForgotUsernameResponseSchema = z.object({
  success: z.boolean(),
});

export const CheckClaimVerifiedResponseSchema = z.object({
  verified: z.boolean(),
  session_token: z.string().optional(),
});

export const ClaimPendingWheelResponseSchema = z.object({
  success: z.boolean(),
  pending_verification: z.boolean().optional(),
});

export const InventoryResponseSchema = z.object({
  equipped_skin: z.string(),
  skins: z.array(z.object({ skin: z.string(), count: z.number().int() })),
  wheels: z.array(z.object({ id: z.number().int(), kind: z.string() })),
  // Optional for the same deploy-independence reasoning as the wire schema's
  // player fields (types/game.ts): a wom-be deployed before the artifact
  // system simply omits these, and every consumer here treats absent the
  // same as null.
  equipped_cosmetic: z.string().nullable().optional(),
  artifact: z
    .object({
      ordinal: z.number().int(),
      discovered_at: z.string().nullable(),
      cosmetic: z.string(),
    })
    .nullable()
    .optional(),
});

export const EquipCosmeticResponseSchema = z.object({
  success: z.boolean(),
  equipped_cosmetic: z.string().nullable(),
});

// GET /artifacts/ledger -- public, no auth. current_chance is what one
// eligible Well win is worth right now; it rises as the world discovers more
// (wom-be docs/ARTIFACT_PLAN.md §4.2), so nothing should hardcode "1 in 1000".
export const ArtifactLedgerResponseSchema = z.object({
  artifacts: z.array(
    z.object({
      ordinal: z.number().int(),
      finder_name: z.string(),
      discovered_at: z.string().nullable(),
    }),
  ),
  total: z.number().int(),
  current_chance: z.number(),
});

export const EquipSkinResponseSchema = z.object({
  success: z.boolean(),
  equipped_skin: z.string(),
});

export const SpinWheelResponseSchema = z.object({
  success: z.boolean(),
  result_skin: z.string(),
});

// GET /ranked/profile/<name> (docs/RANK_SYSTEM_PLAN.md §4/§5) — deliberately
// never the raw mu/sigma, just the derived tier (null during placements, or
// for a player who's never queued).
export const RankedProfileResponseSchema = z.object({
  tier: z.string().nullable(),
  ranked_games_played: z.number().int(),
});

// POST /ranked/queue/join, /ranked/queue/leave (docs/RANK_SYSTEM_PLAN.md §6).
export const RankedQueueJoinResponseSchema = z.object({
  status: z.string(),
});

export const RankedQueueLeaveResponseSchema = z.object({
  status: z.string(),
  was_queued: z.boolean(),
});

// GET /ranked/active/<name> -- does this player have a currently
// unfinished ranked match to return to (docs/RANK_SYSTEM_PLAN.md §6/§10)?
// "Back to Home" only navigates away, it never leaves the lobby server-side,
// so a player can come back here and find their way back in.
export const RankedActiveResponseSchema = z.object({
  lobby_id: z.string().nullable(),
  token: z.string().nullable(),
  ranked_countdown_deadline: z.string().nullable(),
  started: z.boolean(),
});

// GET /well/profile/<name> -- discovery-style: `rewards` only ever lists
// reward types the player has actually won (backend-filtered, same
// principle as /get_player_relics), never every possible WELL_REWARDS key.
export const WellRewardEntrySchema = z.object({
  reward: z.string(),
  count: z.number().int(),
  first_awarded_at: z.string(),
  // The reward's true draw odds (0-1), computed backend-side from
  // wom-be's WELL_REWARDS weights -- never shipped as a raw weight table
  // in the frontend bundle, so it isn't a one-line datamine.
  expected_share: z.number(),
});

export const WellProfileResponseSchema = z.object({
  well_wins: z.number().int(),
  rewards: z.array(WellRewardEntrySchema),
});

// GET /player/profile/<name> -- general (non-ranked, non-well) stats for
// the Stats page's middle section.
export const PlayerProfileResponseSchema = z.object({
  created_at: z.string().nullable(),
  played_games: z.number().int(),
  wins: z.number().int(),
  kills: z.number().int(),
});

// docs/MONETIZATION_PLAN.md §5.2/§5.3/§8 -- shop, checkout, wheel odds.

export const WheelOddsEntrySchema = z.object({
  skin: z.string(),
  weight: z.number().int(),
  probability: z.number(),
});

// GET /wheel/tables -- public, unauthenticated, the same source
// /shop/products' embedded `odds` reads from (§5.2).
export const WheelTablesResponseSchema = z.object({
  normal: z.array(WheelOddsEntrySchema),
  special: z.array(WheelOddsEntrySchema),
});

// One entry of GET /shop/products' `products` array -- `odds`/`odds_denominator`
// only present on kind: 'wheel', `skin` only on kind: 'skin' (§5.3).
export const ShopProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price_cents: z.number().int(),
  currency: z.string(),
  kind: z.enum(['wheel', 'skin']),
  odds_denominator: z.number().int().optional(),
  odds: z.array(WheelOddsEntrySchema).optional(),
  skin: z.string().optional(),
});

export const ShopProductsResponseSchema = z.object({
  shop_enabled: z.boolean(),
  terms_version: z.string(),
  products: z.array(ShopProductSchema),
});

// POST /shop/checkout -- the 200 shape; error shapes ({error, code}) go
// through ApiError.code instead (see http.ts).
export const CheckoutResponseSchema = z.object({
  checkout_url: z.string(),
  order_id: z.number().int(),
});

// docs/TRADE_UP_PLAN.md §5/§6 -- the ladder table and the trade-up result.

export const TradeUpRuleSchema = z.object({
  cost: z.number().int(),
  output_kind: z.enum(['wheel', 'skin']),
  output: z.string(),
});

// GET /tradeup/rules -- public, unauthenticated, keyed by input skin.
export const TradeUpRulesResponseSchema = z.object({
  rules: z.record(z.string(), TradeUpRuleSchema),
});

// POST /inventory/trade_up -- the 200 shape; error shapes go through
// ApiError.code instead (see http.ts). `wheel_id` only present when
// output_kind === 'wheel'; `equipped_skin` only present when the trade
// consumed the player's last copy of an equipped skin.
export const TradeUpResponseSchema = z.object({
  success: z.boolean(),
  trade_up_id: z.number().int(),
  output_kind: z.enum(['wheel', 'skin']),
  output: z.string(),
  wheel_id: z.number().int().optional(),
  remaining: z.number().int(),
  equipped_skin: z.string().optional(),
});

// ── Socket.IO payload schemas (not already in @/types/game) ────────────────

export const JoinedLobbyPayloadSchema = z.object({
  lobby_id: z.string(),
  token: z.string(),
});

export const JoinedPayloadSchema = z.object({
  lobby_id: z.string(),
  name: z.string(),
});

export const LeftPayloadSchema = z.object({
  lobby_id: z.string(),
  name: z.string().nullable(),
});

export const ErrorPayloadSchema = z.object({
  message: z.string(),
});

export const JoinedRankedQueuePayloadSchema = z.object({
  name: z.string(),
});

export const RankedMatchFoundPayloadSchema = z.object({
  lobby_id: z.string(),
  token: z.string(),
});

export const OnlineCountPayloadSchema = z.object({
  count: z.number().int(),
});

// ── Market -- the player-to-player trading post (wom-be docs/MARKET_PLAN.md,
//    direct-swap model §1A) ──────────────────────────────────────────────────

// One item on either side of a trade -- a catalog descriptor, not an owned
// row. Exactly one of skin / relic_id / wheel_kind is set, matching
// item_type.
export const MarketItemSchema = z.object({
  item_type: z.enum(['skin', 'relic', 'wheel']),
  skin: z.string().nullable(),
  relic_id: z.number().int().nullable(),
  wheel_kind: z.string().nullable(),
  quantity: z.number().int(),
});

export const MarketListingSchema = z.object({
  id: z.number().int(),
  kind: z.enum(['quick', 'long']),
  status: z.enum(['open', 'fulfilled', 'cancelled', 'expired']),
  seller_player_id: z.number().int(),
  seller_name: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
  give: z.array(MarketItemSchema),
  want: z.array(MarketItemSchema),
});

// GET /market/listings
export const MarketListingsResponseSchema = z.object({
  listings: z.array(MarketListingSchema),
  server_time: z.string(),
});

// GET /market/catalog
export const MarketCatalogResponseSchema = z.object({
  skins: z.array(z.string()),
  relics: z.array(z.object({ id: z.number().int(), name: z.string() })),
  wheel_kinds: z.array(z.string()),
  coin_relic_id: z.number().int(),
  terms_version: z.string(),
  terms_text: z.string(),
});

// POST /market/trades -- the caller's OWN completed swaps, newest first,
// keyset-paginated on `before`. Each row is told from the caller's side:
// `role` ('seller' = they posted it, 'buyer' = they accepted it),
// `counterparty_name`, and what they `gave` / `got`.
export const MarketTradeSchema = z.object({
  id: z.number().int(),
  listing_id: z.number().int(),
  kind: z.enum(['quick', 'long']),
  role: z.enum(['seller', 'buyer']),
  counterparty_name: z.string(),
  completed_at: z.string(),
  gave: z.array(MarketItemSchema),
  got: z.array(MarketItemSchema),
});

export const MarketTradesResponseSchema = z.object({
  trades: z.array(MarketTradeSchema),
  has_more: z.boolean(),
  next_before: z.number().int().nullable(),
});

// POST /market/enter
export const MarketEnterResponseSchema = z.object({
  player_id: z.number().int(),
  player_name: z.string(),
  terms_accepted: z.boolean(),
  terms_version: z.string(),
  coins: z.number().int(),
  email_verified: z.boolean(),
});

// POST /market/accept_terms
export const MarketAcceptTermsResponseSchema = z.object({
  terms_accepted: z.boolean(),
  terms_version: z.string(),
});

// POST /market/listings, .../accept, .../cancel -- all return the affected
// listing. Error shapes ({error, code}) go through ApiError.code.
export const MarketMutationResponseSchema = z.object({
  success: z.boolean(),
  listing: MarketListingSchema,
});

// Socket payloads (wom-be sockets/market.py). A market chat message reuses
// the {sender, message, timestamp} shape lobby chat uses.
export const MarketChatMessageSchema = z.object({
  sender: z.string(),
  message: z.string(),
  timestamp: z.string(),
});

export const MarketChatBacklogSchema = z.object({
  messages: z.array(MarketChatMessageSchema),
});

export const MarketListingExpiredSchema = z.object({
  id: z.number().int(),
});
