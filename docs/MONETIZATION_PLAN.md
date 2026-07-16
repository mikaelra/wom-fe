# Monetization Plan — Frogskins, Wheels & Shop

Status: draft for review · Scope: `game/frontend` + `game/backend` · Last updated: 2026-07-16

## 1. Summary

Monetize the game through frogskins. Skins stop being randomly assigned per lobby and
become **owned, persistent items** on a player's account:

- Everyone starts with (and permanently owns) the default **green** frog skin.
- Finishing any match — bossfight or PvP — gives each player an independent **25% chance
  of earning a Wheel** (free). Wheels can be spun immediately or saved in the inventory.
- Spinning a **normal Wheel** opens a tivoli-style spinning wheel with the 6 non-green
  common skin colors as equally sized slices; the landed skin is added to the inventory.
- The **Shop** sells a **Special Wheel for $5** with weighted rare slices
  (silver 63%, gold 30%, rainbow 6.6667%, bling 0.3333%) drawn to scale on the wheel,
  and the **Cherub skin for $500** as a direct purchase.
- Duplicates are allowed and every copy is tracked in the database.
- Spending money requires an account with a **verified email**; we also plan social
  logins (Google first, then Steam and others).

This document covers product rules, data model, backend/frontend work, payments,
account/identity prerequisites, compliance, testing, and a phased rollout.

---

## 2. Current state (what exists today)

**Skins** — `frontend/src/lib/frogSkins.ts`:

- 7 common skins: `frog_green_v1`, `frog_blue_v1`, `frog_orange_cursed_v1`,
  `frog_pink_v1`, `frog_purple_v1`, `frog_red_v1`, `frog_yellow_v1`.
- 4 rare skins: `frog_silver_v1`, `frog_gold_v1`, `frog_rainbow_v2`, `frog_bling_v1`.
- Skins are `.glb` models served from `/models/frogs/`.
- Assignment is a deterministic client-side hash of `playerName + lobbyId`
  (`assignSkins`), with per-lobby exclusivity (no two players share a skin) and a
  built-in rare roll. **All of this gets replaced** — the roll moves to the Wheel, and
  the skin you wear becomes the one you equipped.

**Matches** — `backend/engine/combat.py`:

- On game end (`botPresent == False`), per-player stats are written to `players` and
  `game_player_stats` (`pvp_won`, `boss_won`). This is the natural hook for the
  post-match wheel drop.

**Accounts** — `backend/routes/auth.py`, `backend/models.py`:

- `players` table: unique `name`, optional `email`, `always_verify_email` flag.
- `claim_name` attaches an email to a name **without verifying it**.
- `log_in` checks only name+email (no password); a 6-digit HMAC-hashed code is emailed
  only when `always_verify_email` is on.
- Per-lobby session tokens exist (frontend `lib/api.ts`, backend
  `resolve_session_token`), but there is **no persistent account session**.

**Payments** — none. No Stripe/payment code exists anywhere yet.

### Gaps that block monetization

1. **No verified-email state.** Emails are stored unverified; there is no
   `email_verified_at`. Purchases must be gated on actual verification.
2. **No real authentication.** Knowing someone's name+email pair is enough to log in.
   Before accounts hold paid items, login must prove control of the email (code on
   every login) or use OAuth.
3. **No persistent auth token.** Session tokens are scoped to a lobby. Inventory, shop
   and purchase endpoints need an account-scoped session.
4. **No cherub asset.** `frog_cherub_v1.glb` must be created.

---

## 3. Product design

### 3.1 Skin ownership & default

- Every player implicitly owns `frog_green_v1`; it is the default equipped skin and can
  never be lost. (No DB row needed — the backend treats it as always owned.)
- Every other copy of a skin is a row in the DB (duplicates allowed).
- `players.equipped_skin` (default `frog_green_v1`) is what the player wears in every
  lobby. Equipping is done from the Inventory page and validated server-side against
  ownership.
- **Per-lobby exclusivity is dropped** (decided): two players who both own and equip
  `frog_red_v1` both appear red. Your equipped skin is your identity.

### 3.2 Normal Wheel — free, post-match drop

- **Trigger:** when a match ends (bossfight or PvP), each participating player with a
  **claimed account** rolls an independent 25% chance to receive one Normal Wheel.
  Guests earn nothing and wear green; show them a "claim your name to earn wheels"
  teaser on the game-over screen — the drop doubles as an account-creation funnel.
- **Server-side only.** The roll happens in the game-end path in
  `engine/combat.py` (same guard as stats: matches with bots grant nothing, otherwise
  bot lobbies become a wheel farm).
- **Award UX:** the game-over screen shows "You won a Wheel!" with two buttons:
  **Spin now** and **Save for later**. Saved wheels live in the inventory.
- **Spin outcome:** uniform over the 6 non-green common skins (each 1/6 ≈ 16.67%).
  Green is excluded — everyone already owns it, so every spin yields something you
  didn't start with. The result can still be a duplicate of an earned skin —
  duplicates are kept and counted.

### 3.3 Special Wheel — $5, shop item

- Purchased in the Shop; on successful payment a Special Wheel item lands in the
  inventory (it is an item, not an instant spin — consistent with normal wheels, and it
  survives a mid-checkout disconnect).
- **Odds** (must sum to exactly 100%; use integer weights, never floats):

  | Slice   | Weight (of 30 000) | Probability | ≈ 1 in |
  |---------|--------------------|-------------|--------|
  | Silver  | 18 900             | 63%         | 1.59   |
  | Gold    |  9 000             | 30%         | 3.33   |
  | Rainbow |  2 000             | 6.6667%     | 15     |
  | Bling   |    100             | 0.3333%     | 300    |

  Expected cost to hit one bling from scratch is 300 spins × $5 = **$1,500 in
  expectation** (it is a per-spin probability — no guarantee at any spend level).
  **Decided: no pity mechanic** — every spin is independent, disclosed as such.
  Keep this framing in mind for the compliance section.
- **Decided: single quantity only at launch.** One $5 wheel per checkout; multi-packs
  are a trivial later addition since wheels are inventory items.
- **Wheel rendering shows true proportions, but visual slices are decoupled from the
  RNG weights.** The 30 000 above is only the roll denominator — the drawn wheel can
  have any slice layout as long as each color's total angle matches its probability.
  For the tivoli look (many small alternating slices), **300 visual slices is the
  smallest count where every color is an exact whole number of slices**: 189 silver,
  90 gold, 20 rainbow, 1 bling. Any smaller count makes rainbow (6.6667%) a
  non-integer slice count, so a coarser wheel would need one odd-sized rainbow slice
  or slightly-off visuals. Exact layout is a visual-polish decision to refine near
  implementation; the constraint that total drawn angle = true probability is not
  negotiable (compliance, §9).

### 3.4 Cherub skin — $500, direct purchase

- New exclusive skin, purchase-only (never on any wheel). Duplicates are allowed
  (consistent with the ownership rules), but **decided: warn + confirm** — if the
  player already owns Cherub, the shop shows "You already own Cherub" and requires an
  explicit confirmation step before a second $500 charge.
- Requires a new model asset `frog_cherub_v1.glb` + thumbnail. Track asset production
  as its own workstream — it gates the shop launch only for this product, not the rest.

### 3.5 Wheel spin UX (both wheel types)

1. Player clicks **Use** on a wheel in the inventory (or **Spin now** post-match).
2. Frontend calls `POST /wheel/spin` with the wheel item id. **The server consumes the
   wheel and decides the outcome in this call**, atomically, before any animation.
3. A modal shows the top arc of a large tivoli wheel already spinning fast. Slices are
   colored per skin (normal wheel: the 6 non-green common skin colors, equal; special
   wheel: silver / gold / rainbow-gradient / bling, sized per §3.3).
4. A **STOP ROLL** button appears. Clicking it starts a several-second ease-out that
   lands the pointer on the server-chosen slice. If the player never clicks (or closes
   the tab), the outcome already happened — the skin is in their inventory; the
   animation is pure presentation. Auto-stop after ~15s so the wheel can't spin forever.
5. Result splash ("You won FROG GOLD!") with a button to equip immediately.

Implementation note: render the wheel with SVG/canvas conic segments and a
requestAnimationFrame easing, choosing a final rotation = N full turns + the target
slice's angle. No physics needed; determinism from the server response.

---

## 4. Data model (backend, Alembic migrations)

New tables (SQLAlchemy Core, matching `models.py` style):

```
skin_items                            -- one row per owned skin copy
  id            bigint PK
  player_id     bigint FK -> players.id, indexed
  skin          text NOT NULL         -- e.g. 'frog_gold_v1'
  source        text NOT NULL         -- 'wheel_normal' | 'wheel_special' | 'purchase' | 'grant'
  source_ref    text                  -- wheel item id or order id, for audit
  created_at    timestamptz

wheel_items                           -- unspun wheels in inventory
  id            bigint PK
  player_id     bigint FK -> players.id, indexed
  kind          text NOT NULL         -- 'normal' | 'special'
  source        text NOT NULL         -- 'match_drop' | 'purchase'
  source_ref    text                  -- game_id or order id
  spun_at       timestamptz           -- NULL = available; set on spin (kept for audit)
  result_skin   text                  -- filled on spin
  created_at    timestamptz

orders                                -- one row per payment attempt
  id            bigint PK
  player_id     bigint FK -> players.id
  product       text NOT NULL         -- 'wheel_special' | 'skin_cherub'
  quantity      int NOT NULL DEFAULT 1
  amount_cents  int NOT NULL
  currency      text NOT NULL DEFAULT 'usd'
  provider      text NOT NULL DEFAULT 'stripe'
  provider_session_id  text UNIQUE    -- Stripe Checkout session id (idempotency key)
  status        text NOT NULL         -- 'pending' | 'paid' | 'fulfilled' | 'refunded' | 'chargeback'
  created_at / updated_at  timestamptz

auth_identities                       -- OAuth logins (Phase: identity)
  id            bigint PK
  player_id     bigint FK -> players.id
  provider      text NOT NULL         -- 'google' | 'steam' | ...
  subject       text NOT NULL         -- provider's stable user id
  email         text
  created_at    timestamptz
  UNIQUE (provider, subject)

account_sessions                      -- persistent login sessions
  token_hash    text PK               -- store hash, never the raw token
  player_id     bigint FK -> players.id
  created_at / expires_at / last_seen_at  timestamptz
```

Columns added to `players`:

```
equipped_skin      text NOT NULL DEFAULT 'frog_green_v1'
email_verified_at  timestamptz        -- NULL = unverified
```

Design points:

- **Row-per-copy** for `skin_items` (not a count column): each copy keeps its
  provenance, and future features (trading, dismantling) need per-item identity.
- **Wheels are consumed by setting `spun_at` + `result_skin` in the same transaction
  that inserts the `skin_items` row.** The spin endpoint uses
  `UPDATE ... WHERE id = :id AND player_id = :pid AND spun_at IS NULL` and treats
  0 rows updated as "already spun" — this makes double-clicks and replayed requests
  harmless.
- `orders.provider_session_id UNIQUE` makes Stripe webhook delivery idempotent: a
  replayed `checkout.session.completed` finds the order already `fulfilled` and no-ops.
- Chargeback/refund handling: mark the order and delete the granted `wheel_items`
  (if unspun) or `skin_items` rows via `source_ref`; if the wheel was already spun,
  remove the resulting skin item. If it was equipped, reset `equipped_skin` to green.

## 5. Backend API

All account endpoints require the persistent session (§7). Suggested routes
(`routes/inventory.py`, `routes/shop.py`, extend `routes/auth.py`):

```
GET  /inventory                      -> { equipped_skin, skins: [{skin, count}], wheels: [{id, kind}] }
POST /inventory/equip                { skin }            -- 403 unless owned (green always owned)
POST /wheel/spin                     { wheel_id }        -> { result_skin, wheel_kind }
GET  /shop/products                  -> prices + full odds table (frontend renders slices & disclosure from this)
POST /shop/checkout                  { product }         -> { checkout_url }   -- 403 unless email verified
POST /stripe/webhook                                     -- signature-checked, grants items
POST /auth/request_email_verification / /auth/confirm_email_verification
GET  /auth/oauth/<provider>/start, /auth/oauth/<provider>/callback
```

The wheel drop itself is not an endpoint: `engine/combat.py`'s game-end path inserts
`wheel_items` rows for winners of the 25% roll (CSPRNG server-side, per player,
claimed accounts only) and includes `wheel_awarded: true` per player in the game-over
socket payload so the frontend can show the award screen (or the claim-your-name
teaser for guests).

**Skins in lobbies:** the lobby join/state payload gains `skin` per player, taken from
`players.equipped_skin` at join time (frozen for the match). `assignSkins` in
`frogSkins.ts` and its tests are deleted; `Playerv1.tsx` / `LobbyScene.tsx` read the
skin from the player payload. Guests without an account wear green.

## 6. Payments — Stripe

**Recommendation: Stripe Checkout (hosted page) + webhooks.** Rationale: no card data
ever touches our servers (SAQ-A PCI scope), Apple Pay/Google Pay for free, built-in
support for Stripe Tax, Radar fraud screening — important for a $500 SKU.

Flow:

1. `POST /shop/checkout` verifies session + `email_verified_at`, creates an `orders`
   row (`pending`) and a Stripe Checkout Session with
   `metadata: {order_id, player_id, product}` and the player's verified email pinned as
   `customer_email`. Returns the redirect URL.
2. Player pays on Stripe's page; Stripe redirects to `/shop/success` (purely cosmetic).
3. The **webhook** (`checkout.session.completed`, signature verified) is the only thing
   that grants items: order → `paid` → insert `wheel_items` / `skin_items` →
   `fulfilled`. Never grant from the redirect — redirects can be forged or never happen.
4. `charge.refunded` / `charge.dispute.created` webhooks trigger the revocation logic
   in §4. Repeated chargebacks flag the account.

Operational: prices in Stripe as Price objects (not hardcoded cents in two places);
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` via env like existing config; Stripe CLI
for local webhook testing; a $500 SKU **will** attract stolen-card testing — keep Radar
on and consider manual review above a threshold.

## 7. Accounts & identity (prerequisite work)

Money makes accounts worth stealing; the current name+email login is not enough.

1. **Email verification at rest.** New flow reusing the existing HMAC'd 6-digit code
   machinery (`email_verifications`, `mailer.py`): request → email code → confirm →
   set `players.email_verified_at`. Changing the email clears it. The shop is gated on
   it; the game itself stays open to unverified/guest players.
2. **Real login before first purchase.** Once an account has any order or paid item,
   force code-verified login (effectively `always_verify_email = true`, set permanently
   at first checkout). Cheap to build — the code flow already exists.
3. **Persistent sessions.** On successful (verified) login, issue a random token,
   store its hash in `account_sessions`, return it to the client (`lib/api.ts` already
   has the token-attach pattern; add a parallel account token in `localStorage`, ~30-day
   expiry, sliding renewal). All inventory/shop routes resolve the player from it.
4. **OAuth (Google first).** Standard OIDC code flow; on callback, match
   `auth_identities(provider, subject)` → session. New Google users with an email match
   on an existing verified player get a link-account prompt; otherwise create a player
   (name-picker step). Google emails arrive pre-verified → set `email_verified_at`.
5. **Steam later, with a caveat:** Steam uses OpenID 2.0 and **does not give you an
   email**, so Steam-only accounts still need the email-verification step before
   buying. Discord/Apple are easier follow-ups than Steam if the goal is verified
   emails.

## 8. Frontend work

New routes under `src/app/`:

- **`/inventory`** — grid of owned skins (3D thumbnail or pre-rendered image, count
  badge for duplicates, EQUIPPED marker, Equip button); a Wheels section listing unspun
  wheels with a **Use** button; a prominent **Shop** button. Reachable from the lobby
  and main menu.
- **`/shop`** — two product cards (Special Wheel $5, Cherub $500). The Special Wheel
  card shows the full odds table (compliance, §9) fetched from `/shop/products`. Buy →
  email-verified gate (inline verification flow if not) → Stripe redirect.
  `/shop/success` and `/shop/cancel` pages; success polls `/inventory` until the
  webhook has landed the item ("Payment received — your wheel is in your inventory").

New components:

- **`WheelSpinModal`** (§3.5) — takes `{kind, slices: [{skin, color, weight}], resultSkin}`;
  slice geometry computed from weights so normal (6 × equal) and special
  (63/30/6.6667/0.3333) render from one component.
- **Post-match award panel** in the game-over screen: "You won a Wheel!" →
  Spin now (opens `WheelSpinModal`) / Save for later.
- **Skin rendering change**: player skin comes from the server lobby payload;
  remove `assignSkins` usage from `LobbyScene.tsx` / `Playerv1.tsx`.

State: a small inventory store (fetch-on-focus is fine; no realtime needed except the
post-success poll).

## 9. Compliance & player trust

The paid Special Wheel is a **loot box** (real money in, randomized reward). This is
regulated territory:

- **Odds disclosure is mandatory practice** (required by Apple/Google if ever shipped
  as an app, required by law in China, expected by consumer regulators in the EU):
  show the exact percentages next to the buy button and inside the wheel modal, and
  keep the displayed table generated from the same server config the RNG uses.
- **Belgium & the Netherlands** treat paid loot boxes as gambling; the pragmatic
  standard-industry answer is geo-blocking the Special Wheel purchase there (the free
  post-match wheel and the direct Cherub purchase are fine everywhere).
- **No cash-out.** Skins must never be sellable back for money on our platform;
  no trading at launch (trading + rarity odds is what pulled CS:GO skins into gambling
  regulation).
- **The STOP ROLL button must not be presented as skill.** The outcome is decided at
  spin start; the UI should never say "stopped at the right moment!". This is both
  honesty and legal safety.
- **Minors / spending:** ToS statement that purchases require being 18+ or having
  guardian consent; purchases are gated behind verified email regardless.
- Publish a short **refund policy** (digital goods, consumed on spin; unspun wheels
  refundable within 14 days for EU consumer-rights compliance — refunding an unspun
  wheel is easy because it's still a revocable inventory row).
- Log every grant/spin/purchase (`source`, `source_ref`, timestamps already in the
  schema) so any player dispute can be answered from the audit trail.

## 10. Integrity & anti-abuse

- All rolls happen server-side with a CSPRNG (`secrets` / `random.SystemRandom`) —
  never trust the client, never seed from player-controlled input (the current
  name-hash approach in `frogSkins.ts` is exactly what we're retiring).
- Wheel drop only in bot-free matches (reuses the existing `botPresent` guard);
  add a per-player daily cap (e.g. max 10 wheel drops/day) so 2-friend quick-loss
  farming has bounded yield.
- Rate-limit spin/equip/checkout endpoints with the existing `rate_limit.py` limiter.
- Ownership checks on every equip/spin (`player_id` from session, never from body).

## 11. Testing

- **Backend unit:** weight-table sums to exactly 30 000; spin endpoint consumes
  atomically (double-spin returns "already spun"); drop roll respects `botPresent`;
  webhook idempotency (same event twice → one grant); revocation on refund events.
- **Backend integration:** Stripe CLI–driven webhook tests against the docker-compose
  stack (see existing test layout in `backend/tests/`).
- **Frontend unit (vitest):** slice-geometry math from weights; inventory equip flow.
- **E2E (Playwright):** post-match wheel award → spin → skin in inventory → equip →
  visible in next lobby. Note: this repo's in-game action buttons need
  `dispatchEvent('click')` rather than `click({force: true})`.
- **Odds sanity:** a seedable test hook to run 1M simulated spins in CI and assert
  frequencies within tolerance.

## 12. Rollout phases

**Phase 0 — Identity prerequisites (backend-heavy)**
Persistent `account_sessions`; email verification flow + `email_verified_at`;
forced code login for paying accounts. *Exit: a player can verifiably own things.*

**Phase 1 — Ownership & the free wheel (no money yet)**
Migrations (`skin_items`, `wheel_items`, `players` columns); equipped skin drives
lobby appearance (delete `assignSkins`); 25% post-match drop; `WheelSpinModal`;
`/inventory` page. *Exit: full loop earn → spin → equip → seen by others. Ship this
alone first — it's a player-facing feature even before payments and shakes out the
whole pipeline.*

**Phase 2 — Shop & payments**
`orders`, Stripe Checkout + webhooks, `/shop` page, Special Wheel, odds disclosure,
geo-gating, refund/chargeback revocation. Cherub ships here if the asset is ready.
*Exit: first real dollar, correctly fulfilled and refundable.*

**Phase 3 — Social login**
Google OIDC, `auth_identities`, account linking. Steam/Discord afterwards.

**Phase 4 — Polish & ops**
Purchase analytics/dashboards, admin grant/revoke tooling, daily drop cap tuning,
localization of prices (Stripe Prices per currency).

## 13. Decision log (resolved 2026-07-16)

Formerly the open-questions list; all six are decided and folded into the sections
above:

1. **Skin clashes:** identical skins allowed — two players can both appear red.
   Per-lobby exclusivity dies with `assignSkins` (§3.1).
2. **Guests:** wheel drops require a claimed account. Guests wear green and get a
   "claim your name to earn wheels" teaser on the game-over screen (§3.2).
3. **Green on the normal wheel:** excluded. 6 slices, 1/6 each — every spin yields
   something you didn't start with (§3.2).
4. **Multi-packs:** single $5 wheel per checkout at launch; packs later if wanted
   (§3.3).
5. **Cherub duplicates:** allowed but warn + explicit confirm before a second $500
   charge (§3.4).
6. **Pity mechanic:** none. Pure independent 1/300 per spin, disclosed as such (§3.3).

Still open (visual polish, not blocking): exact special-wheel slice layout — 300
tivoli slices for exact math vs. a coarser wheel with one odd-sized rainbow slice
(§3.3), to be refined during `WheelSpinModal` implementation.
