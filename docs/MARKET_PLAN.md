# Market — a player-to-player trading post in the city

Status: **Draft — not started. Fee amounts, listing duration, and tradeable-item scope are intentionally left open (§11) pending product decisions.**

Scope: wom-be + wom-fe · Written: 2026-09-01

Depends on: read `frontend/docs/CITY_SCENE_PLAN.md` §5 (signpost/buildings) and `backend/docs/TRADE_UP_PLAN.md` in full before implementing — this doc borrows the signpost-arm mechanics from the former and the economy-feature skeleton (data model → domain → API → frontend → tests → build order) from the latter. Also read `backend/docs/MONETIZATION_PLAN.md` §9.3 before touching §0 of this doc — it is the reason §0 exists.

The wom-be copy of this doc is authoritative; mirror unchanged into wom-fe/docs when frontend work starts, per repo convention.

---

## 0. Read this first — this conflicts with a locked decision

`backend/docs/MONETIZATION_PLAN.md` §9.3 states, and calls "load-bearing" for keeping paid loot boxes out of gambling-law territory:

> "No cash-out, ever. Skins are never sellable for money on our platform; no trading at launch (trading + rarity odds is what pulled CS:GO skins into gambling regulation)."

`backend/docs/TRADE_UP_PLAN.md` §3 reiterates: *"No counterparty. This is not player-to-player trading... nothing here creates a market, an external value, or a way to move an item between accounts."*

This document specs exactly the thing those two passages were written to rule out: real player-to-player trading of owned items. That is not a reason to not write the plan — the product direction below is what was asked for — but it **is** a reason this plan cannot go to implementation on engineering judgment alone. Before §13's build order starts, someone with authority over the compliance call needs to explicitly either:

- **(a)** amend/retire the MONETIZATION_PLAN §9.3 "no trading" clause, having weighed the regulatory exposure it was written to avoid, or
- **(b)** scope this feature narrowly enough that §9.3 still holds — see the mitigation options in §1.1.

Nothing below should be read as that decision having already been made. It hasn't.

### 0.1 Why this specific feature is the regulatory trigger

The CS:GO precedent §9.3 cites isn't "trading is illegal" in the abstract — it's the *combination* of (1) randomized paid loot boxes producing (2) items with (3) a liquid way to convert them to something of value via player trading, that regulators treated as an unlicensed gambling product (loot box → tradeable item → market price → de facto cash value). Wom already has (1) and (2) shipped (`shop.py`'s `wheel_special`, `wheel.py`'s spins). This plan adds (3). Scoping *what* is tradeable (§1.1) is therefore not a style choice, it's the whole mitigation.

---

## 1. Product rules (as specified, 2026-09-01)

From the conversation that spawned this doc, restated precisely so implementation has a fixed target:

1. A new signpost arm appears one tier below the existing "🌍 EARTH" arm, on the **right** side, at full size (matching BOSSFIGHT/RANKED, not EARTH's shrunk `secondary` style).
2. A new **Market** building appears in the city scene; clicking either the arm or the building takes the player to the marketplace.
3. The marketplace is a **shared space** — everyone currently in it sees the same thing, including a **common chat** visible to everyone present (not per-trade, one room).
4. A player can **post a trade offer**: they pay some number of **Hades' Coin(s)** (the existing persistent relic, `relics` table, owned via `relics_players`) as the cost of listing. The listing stays up for a set duration ("so and so long" — not yet decided, see §11).
5. While a listing is up, **other players can go into the market and trade with the poster** — i.e. negotiate/propose an exchange, not just pay a fixed price.
6. Exact fee amounts, listing duration, and pricing mechanics are explicitly **not decided yet** — this plan must not hardcode guesses into the data model where a config knob will do.

### 1.1 What can be listed — the central open decision

Three tradeable-scope options, in increasing order of regulatory exposure per §0:

| Option | What's tradeable | Compliance posture |
|---|---|---|
| **A — Relics only** | Hades' Coin (and any future relics), which are boss-kill trophies, never sold for real money | Lowest risk. No loot-box-sourced item ever changes hands; §9.3's "skins never sellable" holds literally. Coins would need to also be tradeable *items*, not just the listing fee — so this option changes the fee model too (see §11). |
| **B — Non-monetized skins only** | Skins whose `skin_items.source` marks them as earned via gameplay (boss drop / quest / event), excluding `source='wheel'` or `source='shop'` (real-money-derived) | Middle ground. Requires `source` to reliably distinguish "paid-for" from "earned" provenance for every skin — needs an audit of every value written to `skin_items.source` today before this can be trusted as a gate. |
| **C — Any owned skin** | Everything in `skin_items`, regardless of provenance | This is exactly the CS:GO pattern §9.3 was written about. Do not build this without (a) from §0 explicitly signed off, ideally with legal input, not just an engineering decision. |

This plan is written to support **Option A or B** without rework (the data model in §4 is item-type-agnostic and provenance-checkable); it explicitly flags Option C as **not implementable under current MONETIZATION_PLAN.md** without a documented policy change. **Recommendation: start with Option A** (coins only) — it's the smallest slice that satisfies "trade with other players," ships with zero compliance ambiguity, and the market's scene/chat/listing/offer machinery all still gets built and can later have Option B's item types added without touching the trade-execution code path.

### 1.2 Trade mechanics — negotiated offers, not fixed pricing

Given §1.6 (pricing "not decided yet") and the "come and trade with you" framing (implies back-and-forth, not a vending machine), listings work as **negotiated counter-offers**, not first-click-wins:

1. Seller creates a **listing**: the item(s)/coin(s) they're offering, an optional free-text "looking for" note, pays the listing fee, listing goes live for the configured duration.
2. Any other player can submit an **offer** against that listing: their own item(s)/coin(s) proposed in exchange. Multiple players can each have a pending offer on the same listing simultaneously.
3. The seller reviews pending offers (in the market UI, informed by chat negotiation) and **accepts one**. Accepting atomically swaps ownership, marks the listing fulfilled, and auto-rejects every other pending offer on that listing.
4. A buyer can **withdraw** their own pending offer any time before it's accepted.
5. A seller can **cancel** their own listing any time before an offer is accepted (any other pending offers are auto-rejected); the listing fee is **not refunded** on cancel (open question in §11 — could go either way).
6. If a listing's duration expires with no accepted offer, it moves to `expired`; the fee is forfeit, and any pending offers are auto-rejected. Nothing was ever removed from either party's inventory before acceptance, so expiry needs no rollback beyond status changes.

This is the "auction with negotiation" model rather than "priced storefront" — it matches a barter market better than a fixed-price shop, and defers needing a pricing formula (§11) since sellers/buyers propose their own terms per trade.

---

## 2. The three spaces this touches

```
City scene (3D hub)              Market (new — shared room)         Lobby (existing — private per-match)
┌──────────────────────┐         ┌──────────────────────────┐       ┌───────────────────────────┐
│ Signpost: new arm  ───┼───────▶ │ Listing board (all open  │       │ Per-lobby chat (existing,  │
│ Market building     ──┼───────▶ │  listings, live)          │       │  sockets/chat.py) — NOT    │
│ (BuildingTarget)      │         │ Common chat (new, global) │       │  reused here — different   │
└──────────────────────┘         │ "My listings / offers"    │       │  scope (per-match vs global)│
                                   │ "Create listing" form     │       └───────────────────────────┘
                                   └──────────────────────────┘
```

The market is **not** a lobby: it has no game rules, no round/phase engine, no `config.lobbies` entry, and (unlike a lobby, which is process-pinned per §5) it must be visible identically to every player regardless of which backend worker they're connected to. That single fact drives most of §4–§6: **listings, offers, and chat backlog must live in Postgres, not in an in-memory dict**, unlike lobby state.

---

## 3. City scene changes

### 3.1 `frontend/src/components/city/Signpost.tsx` / `CityScene.tsx` — the arm

The arms array in `CityScene.tsx` (~line 290) gains a fourth entry:

```ts
{
  side: 'right',
  tier: 2,                       // one ARM_TIER_DROP below EARTH's tier: 1
  label: 'MARKET',
  sublabel: marketSublabel,      // optional, e.g. "N listings" — see §3.3
  color: MARKET_COLOR,           // new constant, pick a palette color distinct from BOSSFIGHT/RANKED/EARTH
  onActivate: onMarket,
  onHoverChange: setMarketHot,
}
```

`tier: 2` is required (not `1`) specifically because `tier: 1` is already taken by EARTH, and `Signpost.tsx`'s arm `key` is `${side}-${tier}` — a collision there would silently drop one arm. Full size is achieved simply by **omitting** `secondary`/`lengthScale` (EARTH sets `secondary: true, lengthScale: 0.62`; BOSSFIGHT/RANKED set neither), matching the spec's "same size as bossfight and ranked."

`onMarket` is threaded the same way `onBossfight`/`onRanked`/`onBackToEarth` already are: a prop on `CitySceneProps`, wired from `frontend/src/app/city/page.tsx` to a router navigation (`router.push('/market')`).

### 3.2 The building

A third structure joins Temple/Senate, following the same pattern:

- **Position**: a new `MARKET_POSITION` constant in `frontend/src/lib/cityLayout.ts`, placed following the existing "measure GLB extents, scale distance vector, keep bearing" convention documented for the temple. Needs a concrete spot chosen relative to Temple/Senate/Signpost/Campfire that doesn't collide with terrain or existing footprints — a decision for whoever lays out the scene, not fixed here.
- **Mesh**: start as a procedural placeholder exactly like `Senate.tsx` today (a plain geometry the parent tints on hover) until real art exists (§9). No new art-loading machinery needed.
- **Interactivity**: wrapped in the existing `BuildingTarget` (`CityScene.tsx:184-208`) with `onActivate={onMarket}` and `onHoverChange={setMarketHot}` — the **same** `marketHot`/`onMarket` pair the signpost arm uses, so hovering either the arm or the building lights both, exactly like Temple/Senate today.

### 3.3 Optional: live listing count on the arm

`sockets/city.py`'s bossfight-roster pattern (public, unauthenticated, read-only room pushing live state to city onlookers) is the template if the arm should show a live count (e.g. "MARKET — 4 listings") the way the signpost captions bossfight roster size. This is a nice-to-have, not required for v1 — `sublabel` can simply be omitted or static at first.

---

## 4. Data model

All new tables follow the repo's existing convention: no FK on `player_id` columns (documented reason, repeated across `skin_items`/`relics_players`/`account_sessions`: `players`' live PK is a legacy composite `(id, name)`, so there's no solo unique constraint to target). FKs are used only between the new tables themselves and into `relics`/existing catalog tables where a real FK target exists.

### 4.1 New tables

```
market_listings
  id                  PK
  created_at
  seller_player_id                 -- no FK, matches skin_items convention
  status                           -- 'open' | 'fulfilled' | 'cancelled' | 'expired'
  fee_relic_id        FK -> relics -- which relic paid the listing fee (COIN_RELIC_ID today)
  fee_count           int          -- how many units of that relic were spent to list
  looking_for_note    text, null   -- free-text "what I want", optional
  expires_at                       -- created_at + configured duration (§11)
  fulfilled_offer_id  FK -> market_offers, null   -- set on accept

market_listing_items
  id                  PK
  listing_id          FK -> market_listings
  item_type           text         -- 'skin' | 'relic' (extensible; v1 may only populate 'relic' per §1.1 Option A)
  skin_item_id        FK -> skin_items, null
  relic_player_row_id FK -> relics_players, null
  -- exactly one of skin_item_id / relic_player_row_id set, matching item_type

market_offers
  id                  PK
  created_at
  listing_id          FK -> market_listings
  buyer_player_id                  -- no FK
  status                           -- 'pending' | 'accepted' | 'rejected' | 'withdrawn'

market_offer_items
  id                  PK
  offer_id            FK -> market_offers
  item_type           text
  skin_item_id        FK -> skin_items, null
  relic_player_row_id FK -> relics_players, null

market_trades                      -- audit log, mirrors trade_ups' role
  id                  PK
  created_at
  listing_id          FK -> market_listings
  offer_id            FK -> market_offers
  seller_player_id
  buyer_player_id
  -- item movement is reconstructible by joining listing_items/offer_items at this created_at;
  -- this table exists purely so a completed trade has one stable row to point at (support/disputes/analytics)

market_chat_messages               -- unlike lobby chat, must be DB-backed — see §2
  id                  PK
  created_at
  sender_player_id
  sender_name         text         -- denormalized at send time, same reasoning lobby chat's {sender, message, timestamp} shape uses
  message             text         -- capped length, same MAX_MESSAGE_LENGTH constant reused from sockets/chat.py
```

Why `market_chat_messages` is a table and lobby chat isn't: lobby chat lives in `lobby.chat` (an in-memory Python list on the lobby dict) because a lobby's participants are all pinned to the one worker process holding that lobby (per `DDD_REFACTORING_PLAN.md`'s documented scale-out caveat). The market has no such pinning — any player on any worker can be in it — so a player who joins after a message was sent, or who's connected to a different worker than the sender, must be able to fetch backlog from a shared store. Prune to a rolling window (e.g. keep last 200, or last 24h) the same way lobby chat caps at 100 — a scheduled DB cleanup, not an unbounded table.

### 4.2 Migration

One Alembic migration adding all six tables above, following the style of `0a338b36b5c0`'s neighbors (see any `add_..._table.py` migration, e.g. `b41716b1f81b_add_orders_table.py`, for the exact `op.create_table`/`op.create_foreign_key` idiom this repo uses). No changes to existing tables required — `skin_items`/`relics_players` are referenced, not altered.

### 4.3 Ownership transfer is a row-level `player_id` reassignment, not a copy

Consistent with how `skin_items`/`relics_players` already model ownership (one row per owned copy, no count column, explicitly designed — per the `skin_items` schema comment — for "future features (trading, dismantling)" needing per-item identity): a completed trade **updates `player_id`** on the moved `skin_items`/`relics_players` rows in place inside the accept transaction. No new rows are created for the items themselves; only the audit row in `market_trades` records that the movement happened.

---

## 5. Domain module — `backend/domain/market.py`

Pure rules, no Flask/SQL, mirroring `backend/domain/tradeups.py`'s shape:

- `MarketListing`, `MarketOffer` dataclasses (mirrors the `Lobby`/`Player` dataclass style already used for `domain/lobby.py`).
- `can_create_listing(seller_owned_relics: int, fee_count: int) -> bool` — pure affordability check, no DB access (caller fetches the count first).
- `can_submit_offer(listing: MarketListing, buyer_player_id) -> Result` — rejects offering on your own listing, rejects if listing isn't `open`, rejects if listing has expired (belt-and-suspenders alongside the sweeper).
- `resolve_accept(listing, accepted_offer, other_pending_offers) -> ...` — pure description of the state transition (which rows change status, which get auto-rejected) that the infra layer then executes as one SQL transaction. Keeping this pure (like `tradeups.py`'s ladder logic) makes it unit-testable without a DB, per this repo's existing testing convention (`backend/tests/test_shop_routes.py` style hits routes; pure domain logic gets plain unit tests).
- Constants: `DEFAULT_LISTING_FEE_COUNT`, `DEFAULT_LISTING_DURATION` — **placeholders pending §11**, but living here (not hardcoded inline in routes) so the eventual real values are a one-line change.

---

## 6. Backend API — `backend/routes/market.py` (`market_bp`)

Auth pattern reused verbatim from `tradeup.py`/`shop.py`: token pulled from the JSON body (or query string for the GET), resolved via `resolve_account_session(token)` (`routes/auth.py:151`), 401 on invalid/expired session, 403 on unverified email for any value-bearing action (creating a listing, making an offer, accepting).

- `GET /market/listings` — public read (no token required, matching how a browsable board should work), returns all `status='open'` listings with their offered items and seller display name. Paginate or cap if this list can grow large; not expected to be a concern at launch scale.
- `POST /market/listings` — create. Body: token, item(s) to list, `looking_for_note`. Verifies caller owns every listed item (fresh DB check, not trusting client-supplied ownership), verifies caller owns ≥ fee_count of the fee relic, then in one transaction: consumes the fee relic (reuse `SqlRelicRepository`'s `consume_most_recent_relic`-style logic), inserts the listing + listing_items rows.
- `GET /market/listings/<id>/offers` — token required (only the seller should see the full offer list with buyer identities, to avoid one buyer seeing/gaming another's terms — open question in §11 on whether offers should be visible to other bidders at all).
- `POST /market/listings/<id>/offers` — submit an offer. Verifies caller owns every offered item, verifies listing is still `open` and unexpired, inserts offer + offer_items.
- `POST /market/listings/<id>/offers/<offer_id>/accept` — **the atomic trade**. Caller must be the listing's seller. Re-verifies (at accept time, not just at offer time — items could have moved since) that both seller and buyer still own everything referenced. In one DB transaction: reassign `player_id` on every item row on both sides, mark the listing `fulfilled` with `fulfilled_offer_id`, mark the accepted offer `accepted`, mark every other pending offer on that listing `rejected`, insert one `market_trades` audit row. If the re-verification fails (an item moved/was consumed elsewhere since the offer was made), fail the whole transaction with a clear error rather than a partial trade.
- `POST /market/listings/<id>/cancel` — caller must be seller, listing must still be `open`. Marks `cancelled`, rejects any pending offers. Fee refund behavior: **open question, §11**.
- `POST /market/listings/<id>/offers/<offer_id>/withdraw` — caller must be the offer's buyer, offer must still be `pending`. Marks `withdrawn`.

Rate limiting: stacked `@limiter.limit(...)` decorators on every mutating route (IP-keyed + `token_from_json_body`-keyed), matching `tradeup.py:33-34`'s two-layer pattern exactly. Listing/offer creation are the routes most worth a tight per-token limit (spam listings, spam offers).

### 6.1 Background sweeper

`market_listing_sweeper_task`, started via `socketio.start_background_task` from `app.py` exactly like `shop.py`'s `order_sweeper_task`. Periodically (e.g. every minute) finds `status='open'` listings past `expires_at`, marks them `expired`, rejects any still-pending offers on them, and emits a `listing_expired` socket event so connected market clients drop it from the board live instead of waiting for a refetch.

---

## 7. Sockets — `backend/sockets/market.py`

Two concerns: presence/chat (ambient, low-stakes) and live board updates (so players don't have to poll).

- `join_market` / `leave_market` — room membership in a single well-known `MARKET_ROOM` constant, structurally like `sockets/city.py`'s `watch_bossfight`/`stop_watching_bossfight`, **except** this room requires an authenticated session (unlike city.py's anonymous watch) since being in it lets you send chat and see who's trading. Resolve identity the same way `sockets/lobby.py` does for its authenticated flows.
- `send_market_message` — same shape and rate limit as `sockets/chat.py`'s `send_message` (`socket_rate_limited(sid, "send_market_message", limit=5, window_seconds=10)`, `MAX_MESSAGE_LENGTH` reused), except it inserts into `market_chat_messages` (DB) rather than appending to an in-memory list, then broadcasts `market_chat_message` to `MARKET_ROOM`. On `join_market`, push the last N rows from `market_chat_messages` as backlog (this is what makes DB-backing necessary — see §4.1's note).
- Server-initiated broadcasts to `MARKET_ROOM`, all fired from the routes/sweeper above after their DB transaction commits: `listing_created`, `listing_updated` (covers new offer / offer withdrawn / offer accepted / cancelled), `listing_expired`. Payloads carry the changed listing's id and new state so the frontend can patch its local list rather than doing a full refetch on every event — but a full refetch on reconnect/join is still the source of truth.

All new events get added to `backend/docs/PROTOCOL.md` (canonical event list) as part of implementation — `frontend/src/lib/socket.ts`'s typed event map is built directly against that doc.

---

## 8. Frontend (wom-fe)

### 8.1 Route

`frontend/src/app/market/page.tsx` — a new top-level route, `'use client'`, following the existing per-scene `page.tsx` convention (no shared "SceneManager"). Unlike city/lobby/world-map, this doesn't need to be an R3F `<Canvas>` scene — a 2D DOM screen (listing board + chat + create-listing form) is the natural fit and avoids inventing 3D interactions for a UI-dense feature. `SceneTopBar` (existing shared chrome component) provides the back-to-city affordance.

### 8.2 Plumbing

- `frontend/src/lib/api.ts` — new thin wrappers: `getMarketListings`, `createMarketListing`, `submitMarketOffer`, `acceptMarketOffer`, `cancelMarketListing`, `withdrawMarketOffer`, all built on the existing `http.ts` fetch wrapper (account token attached automatically) — same shape as `getShopProducts`/`postCheckout`.
- `frontend/src/lib/schemas.ts` — Zod schemas for listings/offers/chat messages, validating every socket payload the way `EVENT_SCHEMAS` already does for `chat_message`/`bossfight_roster`.
- `frontend/src/lib/socket.ts` — extend `ServerToClientEvents`/`ClientToServerEvents` with the new market events from §7.
- New hook `frontend/src/lib/useMarketConnection.ts` (mirrors `useLobbyConnection.ts`'s shape and `useBossfightRoster.ts`'s push+poll-fallback+tab-visibility-pause pattern): owns `join_market`/`leave_market` lifecycle, folds `listing_created`/`listing_updated`/`listing_expired`/`market_chat_message` into local state, exposes `{ listings, chat, sendChat, ...}` to the page.

### 8.3 Components

- `MarketBoard` — grid/list of open listings (item thumbnails via the same skin-rendering component `inventory/page.tsx` already uses, seller name, looking-for note, time remaining, an "Offer" button).
- `CreateListingModal` — item picker sourced from the player's own inventory (reusing whatever `inventory/page.tsx` uses to fetch/render owned items), fee display (pulled from a `GET /market/config`-style endpoint or just the known constant — avoids hardcoding the fee twice), looking-for note field.
- `OfferModal` — item picker (same component) for the buyer's own inventory, submit → `submitMarketOffer`.
- `MyListingsPanel` — seller's own open listings with their pending offers listed, each with Accept/Reject, plus a Cancel action on the listing itself.
- `MarketChatPanel` — close structural cousin of `SceneOverlay.tsx`'s existing chat panel (expand/collapse, input, unread badge) but pointed at the new hook/events instead of lobby chat — enough shared shape that factoring a common `<ChatPanel>` out of both may be worth doing here rather than duplicating, if time allows (not required for v1).

### 8.4 City scene wiring

`frontend/src/app/city/page.tsx` gains an `onMarket` handler (`router.push('/market')`) passed into `<CityScene>`, alongside the existing `onBossfight`/`onRanked`/`onBackToEarth`.

---

## 9. Art required

- Market building model (or a starting procedural placeholder per §3.2, same tier of effort as `Senate.tsx`'s current placeholder box).
- Signpost arm needs no new art — it reuses the existing wood/label materials.
- Optional: item/coin icons for the listing board if `inventory/page.tsx`'s existing item rendering isn't directly reusable in a compact card layout.

---

## 10. What does *not* change

- No changes to `skin_items`/`relics_players` schemas — only new tables reference them.
- No changes to lobby chat, lobby state, or the round/phase engine — the market has no game rules.
- No changes to the Shop or Trade-up features — this is a third, independent economy surface, not a replacement.
- Hades' Coin's existing earn path (boss kill drop) and existing spend path (pre-match `toggle_relic_selection` → `consume_selected_relics` → +1 in-match coin) are untouched; the market adds a *second* spend path (listing fee) on the same owned-relic pool.

---

## 11. Open questions — must be resolved before §13 starts

1. **The compliance decision in §0** — is this feature Option A, B, or C from §1.1? This blocks everything else meaningfully, since it determines whether `market_listing_items`/`market_offer_items` ever populate `item_type='skin'` rows at all.
2. **Listing fee amount** — flat (e.g. 1 coin) vs scaling with the value/rarity of what's listed.
3. **Listing duration** — fixed constant (e.g. 24h/48h) vs seller-selectable within a range.
4. **Fee refund on cancel** — forfeit (simplest, discourages spam-listing/de-listing to game the board) vs refunded (friendlier, but see §6's rate limiting as the actual anti-spam lever if refunded).
5. **Offer visibility** — can other bidders on the same listing see each other's offers (auction-like, may drive competitive bidding) or only the seller (current default in §6, avoids offer-sniping/collusion)?
6. **Can Hades' Coins themselves be listed as a tradeable item** (not just spent as the posting fee), e.g. someone trading 3 coins for a skin? The data model (§4.1) already supports `item_type='relic'` in listing/offer items, so this is a product decision, not an engineering one.
7. **Anti-bot/anti-farm**: is there any concern about players running multiple accounts to trade items to themselves (self-dealing to launder loot-box RNG into a chosen outcome)? Worth a explicit look once §11.1 is settled, since Option C would make this the sharper version of the §0 risk.

---

## 12. Tests

Mirrors `TRADE_UP_PLAN.md` §9's split:

- **Backend**: `backend/tests/test_market_routes.py` — create/offer/accept/cancel/withdraw happy paths; ownership-re-verification-at-accept-time race (item moved between offer and accept); fee-insufficient rejection; offering on your own listing rejected; expired-listing offer rejected; sweeper expires past-due listings and rejects their pending offers. Domain-level unit tests for `backend/domain/market.py`'s pure functions, no DB.
- **Frontend**: hook tests for `useMarketConnection.ts`'s event-folding logic (mirrors however `useBossfightRoster.ts`/`useLobbyConnection.ts` are tested today).
- **Manual pass**: two browser sessions, two accounts — list, offer, negotiate over chat, accept, verify both inventories updated; verify a third session sees the listing disappear from the board live via the socket event, not just on refresh.

---

## 13. Suggested commit sequence

Each step independently reviewable, app stays working throughout — style matches `CITY_SCENE_PLAN.md` §13 / `TRADE_UP_PLAN.md` §10:

1. **§0/§11.1 resolved** — not a commit, a prerequisite decision. Do not start step 2 without it.
2. Migration + `backend/domain/market.py` (pure, unit-tested, no routes/sockets wired yet).
3. `backend/routes/market.py` read-only endpoint (`GET /market/listings`) + repository read methods — lets the frontend board be built against real (empty) data immediately.
4. `backend/routes/market.py` mutating endpoints (create/offer/accept/cancel/withdraw) + repository write methods, behind the existing auth/rate-limit patterns, with `test_market_routes.py` landing alongside.
5. `backend/sockets/market.py` (join/leave, chat, broadcasts) + sweeper background task registered in `app.py`.
6. `PROTOCOL.md` updated with the new routes/events (should really happen alongside 3–5, called out separately here only because it's easy to forget).
7. Frontend plumbing (§8.2) — api.ts/schemas.ts/socket.ts/hook — no UI yet, just wiring, sanity-checked against step 3's live endpoint.
8. `MarketBoard` + city scene signpost arm + building (§3) — the board is viewable and the city links to it, even before creation/offers have UI.
9. `CreateListingModal` / `OfferModal` / `MyListingsPanel` — the full create → offer → accept loop becomes usable.
10. `MarketChatPanel`.
11. Art pass (§9) — placeholder building can ship in step 8 and be swapped later without touching logic.

---

## 14. Risks

- **Compliance (§0)** — the dominant risk, covered above; repeating it here only to keep it in the risk-register scan.
- **Race conditions on accept** — two sellers' accept calls, or an accept racing an item being consumed elsewhere (e.g. spent in trade-up) — mitigated by re-verifying ownership inside the accept transaction (§6) rather than trusting the state at offer time.
- **Chat abuse** (harassment/scamming-via-chat, e.g. agreeing verbally to a trade then not delivering) — the trade itself is atomic and can't be reneged on once accepted, which removes the classic "scam trade" vector entirely; chat abuse (harassment, spam) is the same moderation surface lobby chat already has and should reuse whatever tooling/limits exist there (`MAX_MESSAGE_LENGTH`, `socket_rate_limited`) rather than inventing new moderation.
- **DB load from a global, unpinned room** — every worker can have market participants, so `market_chat_message`/`listing_updated` broadcasts fan out via the existing Redis `message_queue` exactly as designed for scale-out; no new infra needed, but this is the first *global* (not per-lobby) room the socket layer has carried at any real scale — worth a light load-check before assuming it behaves like lobby broadcasts do.

---

## 15. Acceptance criteria

- [ ] A right-side, full-size signpost arm labeled MARKET appears one tier below EARTH; clicking it or the market building navigates to `/market`.
- [ ] `/market` shows all currently-open listings, live-updating as listings are created/offered-on/accepted/expired without a manual refresh.
- [ ] A player can create a listing (paying the configured Hades' Coin fee, which is deducted immediately) with items they actually own; cannot list items they don't own.
- [ ] A player can submit an offer on someone else's listing; cannot offer on their own listing.
- [ ] A seller can accept one pending offer on their listing; on accept, both parties' inventories update atomically, the listing closes, and every other pending offer on it is auto-rejected.
- [ ] A listing past its expiry is no longer offerable-on and disappears from the open board (via the sweeper), with its fee forfeited.
- [ ] Common chat is visible and usable by everyone present in the market, with the same message-length/rate limits as lobby chat.
- [ ] Nothing above works for §1.1's excluded item types (Option C skins, unless/until §0's decision explicitly changes that).
