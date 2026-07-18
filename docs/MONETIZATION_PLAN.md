# Monetization Plan — Frogskins, Wheels & Shop

Status: draft for review · Scope: `game/frontend` + `game/backend` · Last updated: 2026-07-18

## 1. Summary

Monetize the game through frogskins. Skins stop being randomly assigned per lobby and
become **owned, persistent items** on a player's account:

- Everyone starts with (and permanently owns) the default **green** frog skin.
- Finishing any match — bossfight or PvP — gives each player an independent **25% chance
  of earning a Wheel** (free, capped at 4 wheels per rolling two weeks). Wheels can be
  spun immediately or saved in the inventory.
- Spinning a **normal Wheel** shows the top arc of a tivoli-style spinning wheel with
  the 6 non-green common skin colors at equal odds; the landed skin is added to the
  inventory.
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
- A link-based confirmation flow already exists, just scoped to a settings toggle:
  `request_toggle_verify_email` / `confirm_toggle_verify_email` (`lib/api.ts`) email a
  link to `/email_verified?token=...`, which on click flips `always_verify_email`. The
  reward-claim verification in §7.1 is a new, purpose-built flow but follows the same
  shape (email a link → confirm page → server-side effect on click).

**Relics** — `backend/routes/bossfight.py`, already live in production:

- Defeating the Hades boss awards a **relic** (`get_player_relics`, `claim_pending_relic`,
  `pending_relic_nudge` on the player payload, "You won a relic" nudge in
  `LobbyOverlay.tsx`). This predates the skin/wheel system and isn't itself part of this
  plan, but it shares the exact problem this plan is solving: **an earned item can be
  attached to an email nobody has proven they control.**
- `CODEBASE_HARDENING_PLAN.md` (Phase 4 write-up) documents a confirmed, live
  vulnerability here: if the name that earned the relic has never registered an account,
  `claim_pending_relic` **creates a new account under whatever email the caller supplies
  and immediately awards the pending relic** — no verification at all. Anyone who can
  guess a name that earned an unclaimed relic can steal it by supplying their own email.
  Filed there as a backend-only fix, out of this repo's control. §7.1 below is the
  product rule that closes it (and applies the same rule to wheels going forward).

**Payments** — none. No Stripe/payment code exists anywhere yet.

### Gaps that block monetization

1. **No verified-email state.** Emails are stored unverified; there is no
   `email_verified_at`. Purchases must be gated on actual verification.
2. **No real authentication.** Knowing someone's name+email pair is enough to log in.
   Before accounts hold paid items, login must prove control of the email (code on
   every login) or use OAuth.
3. **No persistent auth token.** Session tokens are scoped to a lobby. Inventory, shop
   and purchase endpoints need an account-scoped session.
4. **Cherub asset exists but lives outside the frogs folder:**
   `public/models/cherub-v01.glb` (note: *not* under `/models/frogs/`, and not
   `frog_*`-named). `skinUrl()` assumes `/models/frogs/<skin>.glb`, so the skin-id →
   model-URL mapping needs an exception (or a lookup table). Verify the model works
   as a player skin (scale/rig/animations vs. the frog models) and produce a shop
   thumbnail.

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
- **Held pending verification if the email isn't verified yet** (§7.1): the roll still
  happens and the wheel is reserved server-side, but it doesn't appear in the inventory
  or become spinnable until the player verifies. Same rule applies to relics (Hades
  bossfight) — see §7.1.
- **Server-side only.** The roll happens in the game-end path in
  `engine/combat.py` (same guard as stats: matches with bots grant nothing, otherwise
  bot lobbies become a wheel farm).
- **Award UX:** the game-over screen shows "You won a Wheel!" with two buttons:
  **Spin now** and **Save for later**. Saved wheels live in the inventory.
- **Spin outcome:** uniform over the 6 non-green common skins (each 1/6 ≈ 16.67%);
  green is excluded because everyone already owns it. **Every spin is completely
  random and independent** — there is no dedup or "new skin" bias, so rolling a skin
  you already own is normal and expected. Duplicates are kept and counted.
- **Drop cap: 4 Normal Wheels per player per two weeks** (rolling 14-day window).
  Once a player has been granted 4 match-drop wheels in the trailing 14 days, the
  post-match roll simply doesn't happen for them until a grant ages out. Enforced
  server-side by counting `wheel_items` with `source = 'match_drop'` and
  `created_at > now() - 14 days` before rolling.

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
- The model already exists: `public/models/cherub-v01.glb` (in `/models/`, not
  `/models/frogs/`). Remaining work is integration, not asset production: a skin-id →
  model-URL mapping exception for non-frog-folder skins, verifying scale/rig/animations
  in-game as a player skin, and a shop thumbnail.

### 3.5 Wheel spin UX (both wheel types)

1. Player clicks **Use** on a wheel in the inventory (or **Spin now** post-match).
2. Frontend calls `POST /wheel/spin` with the wheel item id. **The server consumes the
   wheel and decides the outcome in this call**, atomically, before any animation.
3. A modal shows the wheel already spinning fast. **Visual direction (to be iterated,
   but this is the target):** the wheel is drawn much larger than the viewport so the
   player only sees a small arc of the top — like standing in front of a real tivoli
   wheel — never the whole disc. Each color is split into many small repeated slices
   interleaved around the wheel rather than a few large wedges: the normal wheel is
   *not* 6 big slices but e.g. 6 colors × N repetitions (normal: the 6 non-green
   common skin colors, equal totals; special: silver / gold / rainbow-gradient /
   bling, totals sized per §3.3). Many narrow slices streaming past the pointer is
   what makes the spin feel alive; the per-color *total* angle share is what must
   stay true to the odds.
4. A **STOP ROLL** button appears. Clicking it starts a several-second ease-out that
   lands the pointer on the server-chosen slice. If the player never clicks (or closes
   the tab), the outcome already happened — the skin is in their inventory; the
   animation is pure presentation. Auto-stop after ~15s so the wheel can't spin forever.
5. Result splash ("You won FROG GOLD!") with a button to equip immediately.

Implementation note: render the wheel with SVG/canvas conic segments and a
requestAnimationFrame easing, choosing a final rotation = N full turns + the target
slice's angle. The partial-top-arc view is just a viewport crop: draw the full disc
in an oversized canvas and clip it, so the geometry/easing math stays trivial. No
physics needed; determinism from the server response.

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

Money makes accounts worth stealing; the current name+email login is not enough. Two
items here (§7.1, §7.2) are **Phase 0**, blocking Phase 1 — not because Phase 1 involves
money, but because Phase 1 hands out real, persistent items (wheels, and the
already-live relics) and those must not be handed to an unverified inbox. The
purchase-specific items (§7.3 OAuth is independent; forced re-login lives in §6/Phase 2)
are gated separately.

1. **Reward-claim email verification — link-based, Phase 0, blocks Phase 1.** Before
   *any* earned item (Normal/Special Wheel, or the existing Hades relic) is delivered to
   an account, that account's email must be verified by clicking a link — not the
   6-digit login code, a distinct flow:
   - Player earns a reward with `email_verified_at IS NULL` (either a brand-new
     name+email pair, or an existing unverified claim). The reward is recorded
     server-side (a `wheel_items` row / the existing pending-relic mechanism) but
     **held**: excluded from `/inventory`, not spinnable, not shown as claimed.
     Reworks `claim_pending_relic` (`backend/routes/bossfight.py`) to stop
     creating-account-and-awarding-in-one-step — this is exactly the theft path
     `CODEBASE_HARDENING_PLAN.md` flags (§2 above): a guessed name + attacker-supplied
     email currently gets the relic immediately with zero proof of email ownership.
   - Frontend prompts "enter your email to claim this" (or confirms the one on file) →
     `POST` a request-verification call → backend emails a link to a confirm page
     (same shape as the existing `/email_verified?token=...` flow, §2) → clicking it
     sets `players.email_verified_at`, and **only then** does the held reward move
     into the visible inventory (or the relic becomes claimed).
   - If the email is already verified, none of this is visible — reward lands
     immediately, same as today's plan. This only gates the *first* unverified reward
     per account, in practice.
   - `always_verify_email` (the existing settings toggle, still 6-digit-code-based) is
     an orthogonal, separate concern from this — one is about re-login friction, this
     one is about proving inbox ownership once before an item is at stake.
2. **Persistent sessions — Phase 0, blocks Phase 1.** On successful login, issue a
   random token, store its hash in `account_sessions`, return it to the client
   (`lib/api.ts` already has the token-attach pattern; add a parallel account token in
   `localStorage`, ~30-day expiry, sliding renewal). All inventory/shop routes resolve
   the player from it — needed because today's session tokens are per-`lobby_id`, and
   inventory/wheel state must survive across lobbies and matches.
3. **"Forgot username" recovery — Phase 0.** A button on `/login` ("Forgot username?")
   → a page that takes just an email → backend finds every `players` row where
   `email = X AND email_verified_at IS NOT NULL` and, if any exist, emails that address
   the list of usernames. **Only verified links are ever surfaced this way** —
   deliberately excludes unverified `claim_name` rows, so an unverified/never-confirmed
   claim can't be leaked or confirmed-by-existence through the recovery flow. Always
   respond with the same generic "if that email has any accounts, we've sent the list"
   message regardless of match, to avoid email-enumeration.
4. **Real login before first purchase — Phase 2 only, not a Phase 0/1 blocker.** Once
   an account has any order or paid item, force code-verified login (effectively
   `always_verify_email = true`, set permanently at first checkout). Cheap to build —
   the 6-digit code flow already exists. This is strictly about payment-account
   hardening and has no bearing on wheels/relics, which are gated by §7.1 instead.
5. **OAuth (Google first) — Phase 3, on hold for now, no active work.** Standard OIDC
   code flow; on callback, match `auth_identities(provider, subject)` → session. New
   Google users with an email match on an existing verified player get a link-account
   prompt; otherwise create a player (name-picker step). Google emails arrive
   pre-verified → set `email_verified_at` directly, skipping §7.1's link step.
6. **Steam later, with a caveat:** Steam uses OpenID 2.0 and **does not give you an
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
- **`/forgot_username`** (§7.3) — single email input + submit; always shows the same
  generic "check your inbox if that email has any accounts" success state, whether or
  not a match was found. Linked from a new "Forgot username?" button on `/login`.

New/changed states on existing screens:

- **Post-match award panel (game-over screen) and the Hades relic nudge
  (`LobbyOverlay.tsx`'s "You won a relic")** — when the winner's email isn't verified
  yet (§7.1), swap the normal "Spin now / Save for later" (or "claim") buttons for an
  "Enter your email to claim this" prompt, then a "Check your inbox" state after
  submitting. The reward is already reserved server-side; this is purely about
  unblocking delivery.
- **`/email_verified`-style confirm page** — either extend the existing page to handle
  a new token purpose, or add a sibling route, so clicking the reward-claim link
  releases the held wheel/relic and redirects into `/inventory` (or back to the relic
  claim) instead of toggling `always_verify_email`.

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
- Wheel drop only in bot-free matches (reuses the existing `botPresent` guard). The
  product rule of **4 match-drop wheels per player per rolling 14 days** (§3.2) also
  bounds 2-friend quick-loss farming — no separate anti-abuse cap needed.
- Rate-limit spin/equip/checkout endpoints with the existing `rate_limit.py` limiter.
- Ownership checks on every equip/spin (`player_id` from session, never from body).
- Rewards held on unverified emails (§7.1) close the live `claim_pending_relic`
  vulnerability in `CODEBASE_HARDENING_PLAN.md`: guessing a name that earned an item no
  longer lets an attacker attach their own email and receive it — the item only
  releases once that email's inbox proves it clicked the link.

## 11. Testing

- **Backend unit:** weight-table sums to exactly 30 000; spin endpoint consumes
  atomically (double-spin returns "already spun"); drop roll respects `botPresent`
  and the 4-per-14-days cap (5th drop in window never grants; a grant aging past
  14 days re-opens the roll); webhook idempotency (same event twice → one grant);
  revocation on refund events.
- **Backend integration:** Stripe CLI–driven webhook tests against the docker-compose
  stack (see existing test layout in `backend/tests/`).
- **Frontend unit (vitest):** slice-geometry math from weights; inventory equip flow.
- **E2E (Playwright):** post-match wheel award → spin → skin in inventory → equip →
  visible in next lobby. Note: this repo's in-game action buttons need
  `dispatchEvent('click')` rather than `click({force: true})`.
- **Odds sanity:** a seedable test hook to run 1M simulated spins in CI and assert
  frequencies within tolerance.
- **Reward-verification unit tests (§7.1):** a wheel/relic won on an unverified email
  is held (absent from `/inventory`, not spinnable, relic not claimable) until the
  confirm link is hit; hitting it releases exactly that reward, not any other pending
  one; already-verified accounts skip the hold entirely; double-confirming a token is a
  no-op, not a double-release.
- **Forgot-username unit tests (§7.3):** only rows with `email_verified_at IS NOT NULL`
  are included in the sent list; an email with zero verified matches still returns the
  same generic success response (no enumeration signal); multiple verified names on one
  email all appear in a single email.

## 12. Rollout phases

**Phase 0 — Identity prerequisites**
Persistent `account_sessions` (§7.2); link-based reward-claim email verification
gating wheel *and* relic delivery, `players.email_verified_at` (§7.1) — this also
closes the live `claim_pending_relic` vulnerability in `CODEBASE_HARDENING_PLAN.md`;
"Forgot username" recovery (§7.3). Forced code-login-before-purchase (old item 2) has
moved to Phase 2, since it's a payment concern with no bearing on Phase 1.
*Exit: a player can verifiably own things, and no reward can be delivered to an
unverified inbox.*

**Phase 1 — Ownership & the free wheel (no money yet)**
Migrations (`skin_items`, `wheel_items`, `players` columns); equipped skin drives
lobby appearance (delete `assignSkins`); 25% post-match drop, held pending
verification per §7.1/§3.2; `WheelSpinModal`; `/inventory` page. *Exit: full loop
earn → (verify if needed) → spin → equip → seen by others. Ship this alone first —
it's a player-facing feature even before payments and shakes out the whole pipeline.*

**Phase 2 — Shop & payments**
`orders`, Stripe Checkout + webhooks, `/shop` page, Special Wheel, odds disclosure,
geo-gating, refund/chargeback revocation, forced code-verified login before first
purchase (§7.4). Cherub ships here if the asset is ready.
*Exit: first real dollar, correctly fulfilled and refundable.*

**Phase 3 — Social login (on hold, no active work)**
Google OIDC, `auth_identities`, account linking. Steam/Discord afterwards. Deliberately
deferred — revisit once Phases 0–2 are shipped.

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
3. **Green on the normal wheel:** excluded — 6 slices, 1/6 each. Every spin is
   completely random and independent; duplicates of skins you already own are normal
   (§3.2).
4. **Multi-packs:** single $5 wheel per checkout at launch; packs later if wanted
   (§3.3).
5. **Cherub duplicates:** allowed but warn + explicit confirm before a second $500
   charge (§3.4).
6. **Pity mechanic:** none. Pure independent 1/300 per spin, disclosed as such (§3.3).
7. **Normal-wheel drop cap:** max 4 match-drop wheels per player per rolling 14 days
   (§3.2).
8. **Reward-claim verification (added 2026-07-18):** link-based, not the 6-digit login
   code; gates delivery of both wheels and the existing Hades relic; a reward earned
   on an unverified email is held server-side, not lost, and releases automatically on
   confirm (§7.1). This is Phase 0 work, blocking Phase 1, and separately closes the
   live `claim_pending_relic` vulnerability.
9. **Forgot username (added 2026-07-18):** recovery email lists only usernames whose
   email is verified; a generic response regardless of match to prevent enumeration
   (§7.3). Phase 0.
10. **Google OAuth (added 2026-07-18):** on hold — Phase 3 stays last, deliberately
    deferred with no active work for now (§7.5).

Still open (visual polish, not blocking): exact slice layout for both wheels. The
agreed direction (§3.5): only a small top arc of an oversized wheel is visible, and
each color repeats across many interleaved narrow slices — never a few big wedges.
Slice counts to tune during `WheelSpinModal` implementation (special wheel: 300
slices gives exact per-color math — 189/90/20/1; coarser needs one odd-sized rainbow
slice, per §3.3).
