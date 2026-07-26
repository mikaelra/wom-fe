# Monetization Plan — Frogskins, Wheels & Shop

Status: **Phase 0 + Phase 1 shipped · 2a shipped · 2b shipped · 2c shipped · 2d partial**
· 2e–4 specified below, ready to implement
Scope: `game/frontend` + `game/backend` · Last updated: 2026-07-25

## 1. Summary

Monetize the game through frogskins. Skins are **owned, persistent items** on a player's
account rather than randomly assigned per lobby:

- Everyone starts with (and permanently owns) the default **green** frog skin.
- Finishing any match — bossfight or PvP — gives each player an independent **25% chance
  of earning a Wheel** (free, capped at 4 wheels per global bi-weekly period).
- Spinning a **normal Wheel** lands one of the 6 non-green common skin colors at equal
  odds; the skin is added to the inventory.
- The **Shop** sells a **Special Wheel for $5** with weighted rare slices
  (silver 63%, gold 30%, rainbow 6.6667%, bling 0.3333%) and the **Cherub skin for $500**
  as a direct purchase.
- Duplicates are allowed and every copy is tracked in the database.
- Spending money requires an account with a **verified email**.

**Everything above except the Shop is live.** What remains is the wheel and the money.

**The wheel is the product.** Today it is a placeholder that flickers through colors on a
timer. What it has to become — an oversized fairground wheel seen as a shallow arc across
the full width of the screen, slightly tilted, its panels separated by grooves and brass
pegs, with a flapper that gets knocked aside by every peg and springs back — is specified
in full in **§3.5** and built in **Phase 2b, ahead of any payment code**. It ships to the
free post-match wheel that is already live, so it proves itself before anything is charged
for.

The money side is the `orders` table, Stripe Checkout + webhooks, the `/shop` page, the
Cherub integration, and the compliance/ops work that must land with them. §2 is the honest
as-built state (including the debt Phase 1 left behind); §12 is the build order.

---

## 2. Where we are (as built, 2026-07-25)

### 2.1 Shipped — Phase 0, identity prerequisites

| Piece | Where |
|---|---|
| `players.email_verified_at`, `players.equipped_skin` | migration `684b5f7933f8`, `a76a02be5426` |
| `pending_email_verifications` (name, email, token_hash, **purpose**, **context** JSONB, expires_at) | `models.py`, migration `684b5f7933f8` |
| `start_email_verification(name, email, purpose, context)` — "newest link wins", raises `MailerError` before any state is dropped | `routes/auth.py:80` |
| `/confirm_email_verification` — dispatches on `purpose` (`claim_relic`, `claim_wheel`, account) | `routes/auth.py:550` |
| `account_sessions` (token_hash PK, player_id, sliding 30-day expiry) | `models.py`, migration `c881a2c7c795` |
| `issue_account_session` / `resolve_account_session` | `routes/auth.py:121,144` |
| Account token in `localStorage`, minted by `/log_in` + `/verify_code` | `frontend/src/lib/http.ts:101-125` |
| `/forgot_username` — verified rows only, generic response | `routes/auth.py:670`, `frontend/src/app/forgot_username/` |
| `always_verify_email` now defaults **true** for new players | migration `7ecb33637956` |

The `claim_pending_relic` theft path flagged in `CODEBASE_HARDENING_PLAN.md` is closed:
rewards earned on an unverified email are held and only released by clicking the emailed
link.

### 2.2 Shipped — Phase 1, ownership & the free wheel

| Piece | Where |
|---|---|
| `skin_items` (row per copy: skin, source, source_ref) | `models.py:281`, migration `a76a02be5426` |
| `wheel_items` (kind, source, source_ref, spun_at, result_skin) | `models.py:299` |
| 25% post-match drop, bi-weekly cap of 4, bot-free matches only | `engine/combat.py` `_roll_wheel_drop` / `_deliver_wheel` / `_current_wheel_drop_period_start` |
| `SqlWheelRepository` (`award_wheel`, `count_recent_match_drops`) | `infrastructure/repositories.py:193` |
| `POST /claim_pending_wheel`, `POST /inventory`, `POST /inventory/equip`, `POST /wheel/spin` | `routes/wheel.py` |
| `/inventory` page (skins grid, equip, wheels, relics, pending-claim poll) | `frontend/src/app/inventory/page.tsx` |
| `WheelSpinModal`, `WheelClaimNudge` | `frontend/src/components/` |
| Equipped skin drives lobby appearance; `assignSkins` deleted | `frontend/src/lib/frogSkins.ts` |
| Tests | `backend/tests/test_wheel_drop.py`, `test_wheel_routes.py`; `frontend/e2e/wheel-drop-bossfight.spec.ts` |

Two conventions worth naming, because Phase 2 must follow them:

- **Tokens travel in the JSON body, not an `Authorization` header** (`{"token": ...}`).
  Every account-scoped route so far does this; the shop routes do too.
- **`players`' live primary key is the composite `(id, name)`**, so no table can put a
  real FK on `player_id` (`account_sessions`, `skin_items`, `wheel_items`,
  `relics_players` all note this). `orders` inherits the same limitation.

### 2.3 Debt Phase 1 left that Phase 2 must clear first

These are not nice-to-haves; each one is either a correctness bug the moment a paid wheel
exists, or a money-safety gap. They make up sub-phase **2a**. Status as of 2026-07-25: all
six resolved — **2a is fully shipped.**

1. ~~**The spin RNG is `random.choice`.**~~ **Resolved.** `routes/wheel.py`'s `spin()` now
   draws via `secrets.SystemRandom()`, passed into `domain/wheels.py`'s `draw()`.
2. ~~**`/wheel/spin` ignores `wheel_items.kind`.**~~ **Resolved.** `spin()` looks up the
   wheel's `kind` before drawing and calls `draw(kind, secrets.SystemRandom())`, which picks
   from the matching table. Verified against a real hand-inserted `kind='special'` row:
   lands on the special pool, grants the right skin, `skin_items.source` records
   `wheel_special`.
3. ~~**The odds table exists nowhere yet.**~~ **Resolved.** `domain/wheels.py`'s
   `WHEEL_TABLES` is the single server-side source of truth (`draw()` and `odds_payload()`
   both read from it), and `GET /wheel/tables` now serves `odds_payload()` for both kinds
   over HTTP — public, unauthenticated, cacheable. Still open, but out of 2a's own
   backend-only scope: `frontend/src/lib/wheelGeometry.ts` still carries its own local copy
   of the weights rather than fetching from this route. §9's "displayed odds generated from
   the same config the RNG uses" is structurally true server-side now; making the frontend
   actually consume it is 2c/2d follow-up, not a 2a blocker.
4. ~~**There is no multi-statement transaction helper.**~~ **Resolved.** `db.transaction()`
   wraps `get_db_engine().begin()` as a context manager; `/wheel/spin` now consumes the
   wheel and grants the skin inside one `with transaction() as conn: ...` block instead of
   two separate `execute()` calls, closing the money-safety gap before anything paid uses
   the same code path.
5. ~~**`WheelSpinModal` is a placeholder.**~~ **Resolved — this is Phase 2b, shipped.** See
   §2.5. The old color-cycling placeholder is gone; the free wheel that's already live now
   spins the real wheel built to §3.5's spec.
6. ~~**No rate limits on the wheel routes.**~~ **Resolved.** `rate_limit.py` gained
   `token_from_json_body()` (mirroring `name_from_json_body`/`email_from_json_body`, not
   lowercased since tokens are case-sensitive); `/wheel/spin` (`10/min` IP, `20/min` token),
   `/inventory` (`60/min` IP), and `/inventory/equip` (`30/min` token) now carry the exact
   limits from §5.4's table.

### 2.4 Not built at all

The Cherub skin-id → model-URL mapping (the asset `public/models/cherub-v01.glb` exists,
unverified as a player skin) · `/shop` frontend (2d) · `auth_identities` / OAuth · admin
grant/revoke tooling · purchase analytics. `orders` + the Stripe backend shipped in 2c
(§12) — but **there is still no way for a real player to reach a `kind='special'`
wheel_item**: `SHOP_ENABLED` defaults false, and even once flipped there's no `/shop`
frontend yet to call `/shop/checkout` from (2d). The only way one exists in any environment
today is a hand-inserted test-grant row; the Special Wheel's draw logic, visuals, and now
its full backend purchase/fulfillment/revocation path (2a/2b/2c) are all built and correct,
but the Special Wheel itself is not reachable by a real player until 2d ships.

### 2.5 Shipped — Phase 2b, the Wheel presentation

| Piece | Where |
|---|---|
| Pure geometry: responsive layout, Hamilton apportionment, seeded-RNG slice shuffle, landing-rotation math | `frontend/src/lib/wheelGeometry.ts` |
| Pure flapper physics: damped-spring peg impulses, ease-out stopping curve, settle rock | `frontend/src/lib/wheelPhysics.ts` |
| Canvas renderer: DPR-scaled, 3D shading/grooves/pegs/brass rim, edge vignette, temporal-supersampled motion blur, single-slice win highlight | `frontend/src/components/wheel/WheelCanvas.tsx` |
| SVG flapper (spring-driven, peg-impulse-driven) | `frontend/src/components/wheel/WheelFlapper.tsx` |
| rAF phase machine: spin-up → cruise → stopping → settle → result, reduced-motion and canvas-failure fallbacks | `frontend/src/components/wheel/useWheelAnimation.ts` |
| Modal rewrite: wheel spins cosmetically on open, Roll commits the server call and lands on the real result with no speed discontinuity, Close before Roll never spends the wheel, geometry frozen at mount so a mid-spin viewport resize can't land the wrong skin | `frontend/src/components/WheelSpinModal.tsx` |
| Tests | `frontend/src/lib/__tests__/wheelGeometry.test.ts`, `wheelPhysics.test.ts`, `frontend/src/components/__tests__/WheelSpinModal.test.tsx` |

Two bugs this surfaced in already-live code were fixed alongside it: `inventory/page.tsx`
was firing a "You got: X!" toast the instant the server responded, spoiling the wheel's own
result reveal before it had visually landed; and `WheelSpinModal` was recomputing geometry
on every `window resize` (which fires continuously on mobile Safari), which could invalidate
an in-flight spin's target slice and land the wheel on the wrong skin. Both fixed and
covered by tests.

*Verified by eye against the live dev backend on a real phone, in addition to the automated
tests: cosmetic pre-Roll spin, Roll → correct landing → correct result splash, Close before
Roll spends nothing, and (once 2a's kind-dispatch fix landed) a hand-granted special wheel
spinning correctly end-to-end. Not yet separately verified on an ultrawide/desktop viewport
or profiled for 60fps — §12's 2b exit criteria calls both out explicitly.*

---

## 3. Product design

### 3.1 Skin ownership & default — *shipped*

- Every player implicitly owns `frog_green_v1`; default equipped, never lost, no DB row.
- Every other copy is a `skin_items` row (duplicates allowed).
- `players.equipped_skin` is what the player wears in every lobby; equipping is validated
  server-side against ownership.
- Per-lobby exclusivity is gone: two players who both equip `frog_red_v1` both appear red.

### 3.2 Normal Wheel — free post-match drop — *shipped*

25% independent roll per player on match end, bot-free matches only, capped at 4
`source='match_drop'` wheels per player per global bi-weekly period (alternating Mondays
00:00 UTC, anchored — `_current_wheel_drop_period_start`). Held pending verification per
§7.1. Spin is uniform over the 6 non-green commons; duplicates are normal and expected.

### 3.3 Special Wheel — $5, shop item

Purchased in the Shop; on successful payment a `wheel_items` row with `kind='special'`
lands in the inventory (an item, not an instant spin — it survives a mid-checkout
disconnect and reuses the whole existing spin path).

**Odds — integer weights over a denominator of 30 000, never floats:**

| Slice   | Skin id | Weight | Probability | ≈ 1 in |
|---------|---------|--------|-------------|--------|
| Silver  | `frog_silver_v1`  | 18 900 | 63%      | 1.59 |
| Gold    | `frog_gold_v1`    |  9 000 | 30%      | 3.33 |
| Rainbow | `frog_rainbow_v2` |  2 000 | 6.6667%  | 15 |
| Bling   | `frog_bling_v1`   |    100 | 0.3333%  | 300 |

Expected cost to hit one bling from scratch is 300 spins × $5 = **$1,500 in expectation**
— a per-spin probability, no guarantee at any spend level. **Decided: no pity mechanic.**
**Decided: single quantity per checkout at launch**; multi-packs are a trivial later
addition since wheels are inventory items.

**The draw** (sub-phase 2a) lives in a new pure module `backend/domain/wheels.py` — no
Flask, no SQL, matching the layer `engine/phases/` already proves out (see
`docs/DDD_REFACTORING_PLAN.md`):

```python
# domain/wheels.py
WHEEL_TABLES = {
    "normal":  [("frog_blue_v1", 1), ("frog_orange_cursed_v1", 1), ("frog_pink_v1", 1),
                ("frog_purple_v1", 1), ("frog_red_v1", 1), ("frog_yellow_v1", 1)],
    "special": [("frog_silver_v1", 18_900), ("frog_gold_v1", 9_000),
                ("frog_rainbow_v2", 2_000), ("frog_bling_v1", 100)],
}

def draw(kind: str, rng) -> str:
    """Weighted pick using a caller-supplied RNG (routes pass
    secrets.SystemRandom()); tests pass a seeded random.Random for
    determinism. Cumulative-weight scan over ints -- no float arithmetic
    anywhere on the path that decides what a player paid for."""

def odds_payload(kind: str) -> list[dict]:
    """[{skin, weight, probability}] -- the single source both /shop/products
    and any displayed odds table read from (§9)."""
```

`routes/wheel.py` calls `draw(row["kind"], _RNG)`; the hardcoded `NORMAL_WHEEL_SKINS` list
there is deleted, and `frontend/src/lib/frogSkins.ts`'s mirrored copy stops being a
source of truth for odds (it may keep the list for the placeholder animation only until
2d replaces it).

### 3.4 Cherub skin — $500, direct purchase

- Purchase-only, never on any wheel. Duplicates allowed, but **decided: warn + confirm** —
  if the player already owns Cherub, the shop shows "You already own Cherub" and the buy
  button requires an explicit second confirmation (implemented as
  `POST /shop/checkout {confirm_duplicate: true}`; without it the server returns 409
  `already_owned`, so the guard is server-side, not just a UI nicety).
- **Skin id: `cherub_v1`** — deliberately not `frog_*`, since it isn't a frog and the
  naming would lie. This forces the URL-mapping exception the plan already anticipated:

  ```ts
  // frontend/src/lib/frogSkins.ts
  const SKIN_MODEL_URLS: Record<string, string> = { cherub_v1: '/models/cherub-v01.glb' };
  export function skinUrl(skinName: string): string {
    return SKIN_MODEL_URLS[skinName] ?? `/models/frogs/${skinName}.glb`;
  }
  ```
  plus a `SKIN_COLORS` and `SKIN_DISPLAY_NAMES` entry ("Cherub"). No other call site
  changes — `SpinningModelViewer` and `Playerv1` both go through `skinUrl`.
- **Asset verification is a real task, not a formality** (sub-phase 2e): load
  `cherub-v01.glb` as a player skin in a live lobby and check scale against the frog
  models, that the rig/animation names the player renderer expects exist (or that the
  renderer degrades to a static mesh cleanly), and draco/file size vs. the frog `.glb`s.
  **If it fails, 2e slips and the Special Wheel ships without it** — Cherub is not on the
  critical path.

### 3.5 The Wheel — presentation spec

**This is the centerpiece of the whole feature.** The odds, the shop and the payments are
plumbing; the wheel is the thing a player actually experiences and the only part that has
to be *good*. It gets its own build phase (§12, Phase 2b) and this spec is deliberately
concrete so it can be built without re-deciding any of it mid-implementation.

#### 3.5.1 The shot

You are standing in front of a fairground wheel that is far bigger than you. You see a
**wide, shallow arc of its top edge** — never the whole disc, never a hub, never a pie
chart. It fills the screen edge to edge and continues past both sides. The face is tilted
slightly away from you at the top, catching a light from above. Dozens of narrow colored
panels stream past, each one separated from its neighbours by a groove and a brass peg,
and a brass **flapper hangs down from above and gets knocked aside by every peg that
passes**, clacking and springing back. At cruise it is a blur of color bands. As it slows,
individual panels resolve, the flapper's ticks space out, and the last few slices crawl
past one at a time.

Everything below serves that description.

#### 3.5.2 Responsive geometry — one formula, phone to widescreen

The wheel is a *physical object of fixed apparent curvature*; the viewport is a window
onto it. A wider screen shows **more of the same wheel**, not a bigger wheel. That single
rule is what makes it work on a 390px phone and a 2560px monitor without two designs.

Given band width `W` (full viewport width) and band height `H`:

```
H       = clamp(0.38 × vh, 200, 460)          // shorter in landscape, see below
R       = clamp(1.25 × W, 480, 2400)          // wheel radius, px
TOP_INSET = 0.18 × H                          // gap above the rim, room for the flapper
cx, cy  = W / 2,  TOP_INSET + R               // centre sits far below the viewport
halfArc = asin(min(1, (W / 2) / R))           // ≈ 23°–32° on every device
faceDepth = 1.05 × H                          // face runs past the bottom crop
R_inner = max(R − faceDepth, 0.25 × R)
rimWidth = clamp(0.06 × H, 10, 26)
```

`R = 1.25 × W` is the load-bearing line: it keeps the **visible arc at ~47°–64° on every
screen size**, so the curvature reads identically on a phone and a widescreen while the
widescreen simply contains more slices. The clamps stop a 320px phone from getting a
comically tight arc and a 3440px ultrawide from flattening into a straight line.

Layout per breakpoint:

- **Portrait phone** — the modal is **full-screen**, not a card. Band is full-bleed at the
  top (respecting `env(safe-area-inset-top)`), controls in a column beneath, odds legend
  collapsed behind an "Odds" disclosure.
- **Landscape / short viewport (`vh < 480`)** — `H` floors at 180px and the controls
  overlay the bottom of the band on a scrim, rather than pushing the wheel off-screen.
- **Desktop / widescreen** — still full-bleed band (a wheel that stops at a 640px card
  edge stops being a wheel), with the controls and odds table in a centered ~480px column
  below it. The current `max-w-sm` card in `WheelSpinModal.tsx` goes away entirely.

#### 3.5.3 Slices and separation

Angle per color is fixed by the odds: `colorAngle_c = 360° × weight_c / totalWeight`.
Slice *count* is a purely visual choice, resolved per device so slices are always a
comfortable size:

```
SLICE_PX = clamp(0.09 × H, 26, 46)            // target arc-length of one slice, at the rim
N        = clamp(round(360 / degrees(SLICE_PX / R)), 48, 420)
count_c  = max(1, largestRemainder(N × probability_c))
sliceAngle_c = colorAngle_c / count_c          // equal within a color, may differ across colors
```

This generalizes the old "300 slices exactly" rule and is strictly better: **per-color
total angle is exact by construction at any N**, so the drawn wheel is always true to the
odds (§9.2) — a color that doesn't divide evenly just gets slightly wider or narrower
slices than its neighbours, which is invisible and honest. Typical results: a 390px phone
lands ~110 slices, a 1920px monitor ~340. Bling always gets exactly one slice, 1.2° wide —
a genuine sliver you have to catch, which is exactly what a 1-in-300 outcome should look
like.

**Order** — walk the N positions emitting the color with the largest running deficit
(largest-remainder / Bresenham sequencing), so no color ever blocks up and the pattern
reads as an interleaved fairground wheel rather than four wedges.

**Separation** is a three-part treatment on every boundary, and it is what the user
actually notices:

1. **Groove** — a 2px (×DPR) dark line (`rgba(0,0,0,.55)`) along the radial boundary.
2. **Leading-edge highlight** — a 1px light line (`rgba(255,255,255,.35)`) on the
   clockwise side of each groove. Groove + highlight together is what makes each slice
   read as a *raised panel* instead of a flat color band; it is cheap and does most of the
   3D work.
3. **Peg** — a brass stud at radius `R − rimWidth/2`, radius `clamp(0.018 × H, 3, 7)`, drawn
   with a small radial gradient (light top-left → dark bottom-right) and a contact shadow.
   The pegs are also the physical justification for the flapper: they are what hits it.

#### 3.5.4 The 3D treatment

Not a 3D engine — the wheel is 2D canvas plus a perspective transform and layered
shading. Cheap, sharp, and it runs on a phone.

- **Tilt**: the canvas element gets `transform: perspective(1400px) rotateX(8deg)` with
  `transform-origin: 50% 100%` (tune 6°–12°). The top of the arc recedes; the wheel reads
  as leaning back rather than lying flat on the screen.
- **Panel shading**: each slice fills with a radial gradient from its base color at the
  rim to ~72% luminance toward the hub.
- **Rim**: a brass band drawn as a thick arc stroke outside `R`, three-stop gradient
  (`#8a6216 → #f0d590 → #7a5512`) with a 1px dark outer edge.
- **Overlays, drawn in this order after the slices**:
  1. top-light sheen — white 10% → transparent over the top 40% of the face;
  2. inner rim shadow — 8–14px, black 35%, just inside the rim;
  3. **side vignette** — the outer 12% of the band fades to the modal background on both
     edges, so slices *dissolve* off-screen instead of being guillotined by the viewport.
     This is what sells "the wheel continues past the screen", and it matters most on
     widescreen;
  4. bottom fade into the controls area.
- **Cast shadow**: `filter: drop-shadow(0 18px 30px rgba(0,0,0,.55))` on the canvas.

Palette stays with the existing dark UI (`bg-gray-950/900`, amber accents) — brass rim
and pegs against `skinColor()` panels need no new design language.

#### 3.5.5 The flapper — the arrow, and its wiggle

A tapered brass blade pinned at the top centre, hanging down, its tip overlapping the rim
by ~40% of `rimWidth` so pegs genuinely reach it. Rendered as **SVG on top of the canvas**
(crisp edges, trivial styling, its own transform) with a pivot boss and a soft shadow cast
onto the wheel below.

Its motion is a **damped spring driven by peg impacts**, not a scripted loop — that is
what makes it feel mechanical instead of animated:

```
θ̈ = −k·θ − c·θ̇          k ≈ 900, c ≈ 26   (≈4.8 Hz, slightly under-damped)
on each peg crossing:  θ̇ += clamp(k₁ · ω, IMPULSE_MIN, IMPULSE_MAX)
clamp |θ| ≤ 34°
```

- **Direction**: the deflection goes with the surface travel at the pointer and springs
  back against it.
- **Crossing detection** must not assume a uniform slice angle (§3.5.3 allows per-color
  widths): each frame, find the index of the boundary nearest the pointer; if it changed,
  fire one impulse scaled by how many boundaries were crossed. Never fire more than one
  impulse per frame.
- The payoff is automatic: at cruise, ω is high, impulses arrive faster than the spring
  settles, and the flapper chatters at its natural frequency. As the wheel decelerates the
  ticks separate and each one becomes a distinct visible knock. **The flapper is the
  speedometer** — it communicates deceleration better than the blur does.
- **At rest**, settle the flapper leaning slightly against the trailing peg (~6° offset,
  not dead centre). A pointer standing perfectly upright looks like a diagram; one leaning
  on a peg looks like an object.

#### 3.5.6 Motion timeline

*As built (2026-07-25) deviates from this section in several ways — see decision log
entries #23-25 (§13): no separate STOP ROLL step (Roll commits and lands the wheel in one
action), no 15s auto-stop, and the actual cruise speed/minimum landing revolutions are
much lower than specified below, after three rounds of speed feedback during review.*

| Phase | Behaviour |
|---|---|
| **Spin-up** | 450ms ease-in from rest to cruise, on modal open. |
| **Cruise** | Constant `ω_cruise`; heavy motion blur; STOP ROLL enabled. |
| **Stopping** | Single power ease-out to the target: `θ(t) = θ_end − D·(1 − t/T)^p`, `T = 4.8s`, `p = 3.2`. |
| **Settle** | Damped rock of ±1.2° over ~500ms as the wheel rests against the flapper. |
| **Result** | Winning slice glows, neighbours dim, splash + Equip. |

**Cruise speed is derived, not chosen**: `ω_cruise = p · D / T`, where `D` is the total
stopping distance (≥ 2.5 turns plus the offset to the target slice). With `D ≈ 1050°` that
gives ~700°/s ≈ 1.9 rev/s — and, more importantly, **zero velocity discontinuity the
instant STOP ROLL is pressed**. A visible jolt there is the single most common way this
kind of animation looks cheap.

**Motion blur / anti-strobe.** At cruise the wheel moves ~11.7° per frame, several slice
widths — drawn naively that is a strobing wagon-wheel. Fix with temporal supersampling:
draw the visible slices `S` times per frame at `1/S` alpha, spread across the frame's
angular sweep. `S = 4` on `getQualityTier() === 'high'`, `S = 2` on `'low'`, `S = 1` below
0.35 slices/frame (no blur needed once it is slow). This is ~40–60 visible slices × S
paths — trivial on desktop, fine on a phone at S=2.

**STOP ROLL** is offered as soon as the modal opens. If the player hits it before the
server's result has landed (sub-200ms in practice), show "Stopping…" and begin the ease-out
the moment it arrives. **Auto-stop after 15s** of cruise. Pressing it never changes the
outcome (§9.3) and the UI never implies otherwise.

#### 3.5.7 Landing rules

*`turns` is chosen so `D ≥ 0.05` revolutions as built, not `≥ 2.5` — see decision log #25
(§13). Everything else in this section shipped as specified.*

The result is already decided server-side before the first frame. The animation solves for
a rotation that lands on it:

- Pick a target slice **uniformly at random among all slices of the winning color**, so a
  player who wins silver twice doesn't stop in the same place twice.
- Aim for the slice centre with jitter of up to ±35% of its width, so the flapper never
  rests ambiguously balanced on a peg.
- `D = (target − current) mod 360 + turns × 360`, `turns` chosen so `D ≥ 2.5` revolutions.
- **No near-miss choreography.** No lingering next to bling, no extra deceleration as it
  passes a rare slice, no "so close!" copy. The ease-out is a pure function of `D` and
  nothing else. This is §9.3, and it is the one rule here that is legal, not aesthetic.

#### 3.5.8 Result state

*As built, neighbours dim to 32% brightness, not 55%, and the odds line described below
was cut per product feedback — decision log #26-27 (§13).*

Winning slice keeps a soft outer glow and its neighbours drop to 55% brightness; the
flapper rests against its peg; the splash names the skin (`skinLabel`) over a
`SpinningModelViewer` of the actual model, with **Equip** and **Close**. For a Special
Wheel result, show what the odds of that outcome were ("Gold — 30%") — honest, and it
makes a rare win feel earned rather than arbitrary.

#### 3.5.9 Rendering & performance

Draw **only the visible arc**, every frame, into a canvas sized to the band. The naive
alternative — pre-rendering the whole disc and rotating it — needs a 4800px texture at
desktop `R` and is a non-starter on mobile memory. Redrawing ~40–60 slice paths per frame
is cheaper than it sounds and is resolution-independent.

- DPR capped at 2. Canvas resized on `ResizeObserver`, geometry recomputed, rotation
  preserved.
- No allocation inside the frame loop (pre-build the slice array once; reuse gradient
  objects keyed by color).
- `cancelAnimationFrame` on unmount and on `visibilitychange` — a backgrounded tab must
  not keep spinning. On return, resume from the same phase.
- Budget: 60fps on a mid-range phone at `S = 2`. If a frame budget is missed repeatedly,
  drop `S` to 1 rather than dropping frames.
- Reuse `getQualityTier()` (`src/lib/deviceQuality.ts`) — it already encodes the
  low/high split this needs.

#### 3.5.10 Accessibility & fallbacks

- `prefers-reduced-motion` → no spin: render the wheel statically already resting on the
  winning slice, then the result splash. The flapper does not wiggle.
- The canvas is `aria-hidden`; the result is announced through an `aria-live="polite"`
  region ("You won Gold Frog").
- STOP ROLL is a real focusable `<button>`; `Esc` closes once the result is in.
- If canvas context creation fails, fall back to today's simple color-cycle reveal rather
  than blocking — the player already owns the skin regardless of what renders.
- Sound (optional, `src/lib/sounds.ts`): one tick per peg impact, throttled to ≤20/s with
  volume and pitch scaled by ω, respecting the existing mute setting. The ticks slowing
  down is half the drama — but the spin must be fully legible with sound off.

#### 3.5.11 Modules and boundaries

| File | Responsibility |
|---|---|
| `src/lib/wheelGeometry.ts` | **Pure.** `buildSlices(table, {R, H, W})` → `{slices, N, sliceAngles}`; `pickTargetRotation(slices, resultSkin, rng)`; `boundaryIndexAt(rotation)`. No DOM, fully unit-testable. |
| `src/lib/wheelPhysics.ts` | **Pure.** Flapper spring integrator + the ease-out/settle curves, as `step(state, dt) → state`. |
| `src/components/wheel/WheelCanvas.tsx` | Canvas sizing, per-frame draw, blur sub-steps, overlays. |
| `src/components/wheel/WheelFlapper.tsx` | SVG flapper, driven by the physics state. |
| `src/components/wheel/useWheelAnimation.ts` | rAF loop, phase machine (spin-up → cruise → stopping → settle → result), visibility handling. |
| `src/components/WheelSpinModal.tsx` | Orchestration: full-screen layout, calls `POST /wheel/spin`, wires result → animation → splash. Keeps the existing `calledRef` StrictMode guard. |

The pure/impure split is the point: all the maths that can be wrong silently lives in two
files with no React and no canvas in them.

#### 3.5.12 Where the slice table comes from

The modal needs the table *before* the result, to draw the wheel while the request is in
flight. `GET /wheel/tables` (public, from `domain/wheels.odds_payload`, §5.2) serves both
kinds; the client caches it for the session. The frontend never hardcodes odds — including
for the normal wheel, whose list is currently duplicated in `frogSkins.ts:24` with a
"mirrors the backend" comment holding it together.

---

## 4. Data model

### 4.1 As built

`skin_items`, `wheel_items`, `account_sessions`, `pending_email_verifications`, plus
`players.equipped_skin` / `players.email_verified_at` — see §2.1/§2.2 and `models.py`.

### 4.2 New in Phase 2 — `orders`

```python
# models.py, matching the SQLAlchemy Core style of the surrounding tables
orders = Table(
    "orders", metadata,
    Column("id", BigInteger, primary_key=True),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    # No FK -- players' live PK is the composite (id, name); same note as
    # skin_items/wheel_items/account_sessions.
    Column("player_id", BigInteger, nullable=False, index=True),
    Column("product", Text, nullable=False),          # 'wheel_special' | 'skin_cherub'
    Column("quantity", Integer, nullable=False, server_default="1"),
    Column("amount_cents", Integer, nullable=False),  # snapshot of the price at purchase
    Column("currency", Text, nullable=False, server_default="usd"),
    Column("provider", Text, nullable=False, server_default="stripe"),
    Column("provider_session_id", Text),              # UNIQUE -- Stripe Checkout session
    Column("provider_payment_intent", Text),          # filled from the webhook; refund key
    Column("status", Text, nullable=False),           # see state machine below
    Column("country", Text),                          # billing country from Stripe (§9)
    Column("terms_version", Text),                    # what the player accepted at buy time
    Column("fulfilled_at", DateTime(timezone=True)),
    Column("revoked_at", DateTime(timezone=True)),
    Column("failure_reason", Text),                   # why a revoke/expire happened
    UniqueConstraint("provider_session_id", name="orders_provider_session_id_key"),
)
```

Indexes: `player_id`, `provider_session_id` (unique), and `(status, created_at)` for the
expiry sweeper and ops queries.

**Status state machine** — the only legal transitions:

```
pending ──paid──▶ paid ──fulfilled──▶ fulfilled ──▶ refunded
   │                                      │
   └──expired (session expired/abandoned)  └──▶ chargeback
```

`pending → expired` comes from `checkout.session.expired` or the sweeper (any `pending`
order older than 24h). `paid` is a transient state that only exists if fulfillment
fails mid-way; the webhook normally goes `pending → fulfilled` inside one transaction.
Anything else (e.g. a refund event for an order that was never fulfilled) is logged at
`error` and left alone for manual review rather than force-transitioned.

### 4.3 Supporting changes

- **`db.transaction()`** (sub-phase 2a) — a context manager beside `execute()`:

  ```python
  @contextmanager
  def transaction():
      """Multiple statements, one commit. execute() commits per statement,
      which is fine for single writes and wrong for anything money touches:
      webhook fulfillment must grant the item and mark the order fulfilled
      atomically, or a crash between them double-grants on Stripe's retry."""
      with get_db_engine().begin() as conn:
          yield conn
  ```
  Callers pass statements to `conn.execute(...)` directly. The spin endpoint moves onto
  it too (consume + grant in one commit), which retires debt item 2.3.4.

- **`players`**: no new columns needed for payments. §7.4's "force code-verified login
  after a purchase" is just setting the existing `always_verify_email = true`.

- **Grant provenance is the revocation key.** Every item granted by an order carries
  `source_ref = str(order_id)` and `source = 'purchase'` / `'wheel_special'`. Revocation
  (§6.4) needs no extra table — it's a query on `source_ref`.

---

## 5. Backend API

### 5.1 As built

```
POST /claim_pending_wheel   {name, email, lobby_id} -> {success, pending_verification}
POST /inventory             {token}          -> {equipped_skin, skins:[{skin,count}], wheels:[{id,kind}]}
POST /inventory/equip       {token, skin}    -> {success, equipped_skin}   -- 403 if not owned
POST /wheel/spin            {token, wheel_id}-> {success, result_skin}     -- 403 if unverified
GET  /wheel/tables          ()               -> {"normal": [...], "special": [...]}
```

Note the shipped shapes differ from the sketch in earlier drafts: they are **POST with a
body token**, not `GET /inventory`. New routes match the shipped convention.

### 5.2 Shipped in 2a — `GET /wheel/tables`

```
GET /wheel/tables
  -> {"normal":  [{"skin": "frog_blue_v1",   "weight": 1,     "probability": 0.16667}, ...],
      "special": [{"skin": "frog_silver_v1", "weight": 18900, "probability": 0.63}, ...]}
```

Public, unauthenticated, cacheable — straight from `domain/wheels.odds_payload()`. The
spin modal needs the slice table *before* the result arrives in order to draw the wheel
while the request is in flight (§3.5.12), and `/shop/products` will embed the same
`special` payload rather than computing its own once it ships. One table, one source, three
consumers. The frontend doesn't fetch it yet (`wheelGeometry.ts` still has its own local
copy) — wiring that up is 2c/2d follow-up, not part of what shipped here.

### 5.3 New in Phase 2 — `routes/shop.py`

```
GET  /shop/products
  -> {
       "shop_enabled": true,
       "terms_version": "2026-07",
       "products": [
         {"id": "wheel_special", "name": "Special Wheel", "price_cents": 500,
          "currency": "usd", "kind": "wheel",
          "odds_denominator": 30000,
          "odds": [{"skin": "frog_silver_v1", "weight": 18900, "probability": 0.63}, ...]},
         {"id": "skin_cherub", "name": "Cherub", "price_cents": 50000,
          "currency": "usd", "kind": "skin", "skin": "cherub_v1"}
       ]
     }
```
Public (no token) so the shop renders for logged-out visitors as a funnel. `odds` comes
straight from `domain/wheels.odds_payload("special")` — §9's "displayed table generated
from the same config the RNG uses" is satisfied structurally, not by discipline.

```
POST /shop/checkout   {token, product, confirm_duplicate?: bool}
  -> 200 {checkout_url, order_id}
  -> 401 {error, code: "invalid_session"}
  -> 403 {error, code: "email_unverified"}      -- players.email_verified_at IS NULL
  -> 403 {error, code: "region_blocked"}        -- §9 pre-check
  -> 403 {error, code: "payments_blocked"}      -- prior chargeback on this account
  -> 409 {error, code: "already_owned"}         -- Cherub duplicate, needs confirm_duplicate
  -> 503 {error, code: "shop_disabled"}         -- SHOP_ENABLED=false kill switch
```
Machine-readable `code` on every error: the frontend needs to *act* differently per case
(open the verification flow, show the confirm step, show a region notice), and matching
on prose is how that breaks.

```
POST /stripe/webhook   (raw body + Stripe-Signature header)
  -> 200 on every event we understand, handled or deliberately ignored
  -> 400 only on signature verification failure
```

### 5.4 Route-level guards

Add to `rate_limit.py` a `token_from_json_body()` key function (mirroring the existing
`name_from_json_body` / `email_from_json_body`), then:

| Route | Limits |
|---|---|
| `/wheel/spin` | `10/minute` per IP, `20/minute` per token |
| `/inventory` | `60/minute` per IP |
| `/inventory/equip` | `30/minute` per token |
| `/shop/checkout` | `10/minute` per IP, **`5/hour` per token** (a $500 SKU does not need burst capacity; it does need a ceiling on stolen-card probing) |
| `/shop/products` | `60/minute` per IP |
| `/stripe/webhook` | **`@limiter.exempt`** — Stripe retries with backoff and a 429 to Stripe is a lost fulfillment |

---

## 6. Payments — Stripe

**Decided: Stripe Checkout (hosted page) + webhooks.** No card data touches our servers
(SAQ-A PCI scope), Apple/Google Pay for free, Stripe Tax and Radar available — the last
matters for a $500 SKU.

### 6.1 Configuration

`requirements.txt` gains `stripe`. `config.py` (following its `os.environ.get` pattern):

```python
STRIPE_SECRET_KEY      = os.environ.get("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET  = os.environ.get("STRIPE_WEBHOOK_SECRET")
STRIPE_PRICE_WHEEL_SPECIAL = os.environ.get("STRIPE_PRICE_WHEEL_SPECIAL")  # price_... id
STRIPE_PRICE_CHERUB        = os.environ.get("STRIPE_PRICE_CHERUB")
SHOP_ENABLED           = os.environ.get("SHOP_ENABLED", "false").lower() == "true"
BLOCKED_COUNTRIES      = set(filter(None, os.environ.get("BLOCKED_COUNTRIES", "BE,NL").split(",")))
TERMS_VERSION          = os.environ.get("TERMS_VERSION", "2026-07")
```

Prices live in Stripe as **Price objects**, referenced by id — never hardcoded cents in
two places. `/shop/products` reads the amount from Stripe (cached in-process for ~5
minutes) so the displayed price cannot drift from the charged one. `SHOP_ENABLED`
defaults **false**, so merging shop code never accidentally opens a storefront; flipping
it is the launch action.

Startup validation in `config.py` (it already does this kind of check for
`VERIFICATION_CODE_SECRET`): if `SHOP_ENABLED` is true and any Stripe var is missing,
**fail to boot** rather than serve a shop that 500s at checkout.

### 6.2 `services/payments.py`

A thin wrapper over the Stripe SDK behind a Protocol, mirroring how
`infrastructure/repositories.py` defines `WheelRepository` — so tests inject a fake and
CI never needs network:

```python
class PaymentProvider(Protocol):
    def create_checkout_session(self, *, order_id, price_id, customer_email,
                                success_url, cancel_url, metadata) -> tuple[str, str]:
        """-> (session_id, checkout_url)."""
    def verify_webhook(self, payload: bytes, signature: str) -> dict: ...
    def refund(self, payment_intent_id: str, *, reason: str) -> None: ...
```

`StripePaymentProvider` implements it; `FakePaymentProvider` in `tests/` records calls.

### 6.3 Purchase flow

1. **`POST /shop/checkout`** — resolve session → check `email_verified_at` → check
   region (§9.1) → check chargeback history → for `skin_cherub`, check duplicate
   ownership unless `confirm_duplicate` → insert an `orders` row (`pending`,
   `amount_cents` snapshotted, `terms_version`) → create the Stripe Checkout Session with:
   - `mode="payment"`, `line_items=[{price: <price_id>, quantity: 1}]`
   - `customer_email` = the player's **verified** email (pinned; the player cannot pay
     under a different address than the one that owns the account)
   - `client_reference_id = str(order_id)`, `metadata = {order_id, player_id, product}`
   - `success_url = {FRONTEND_URL}/shop/success?order={order_id}`,
     `cancel_url = {FRONTEND_URL}/shop/cancel`
   - `automatic_tax={"enabled": True}` (see §6.6)
   - Stripe **`idempotency_key=f"order-{order_id}"`** — a retried checkout call never
     creates a second session for the same order.

   Store `provider_session_id`, return `{checkout_url, order_id}`.

2. **Player pays on Stripe's page**, is redirected to `/shop/success`. **The redirect
   grants nothing** — it is cosmetic and forgeable; it polls `/inventory`.

3. **`POST /stripe/webhook`** is the only thing that grants. In Flask this needs the raw
   body: `stripe.Webhook.construct_event(request.get_data(), request.headers["Stripe-Signature"], STRIPE_WEBHOOK_SECRET)`.
   Bad signature → 400 and log. Unknown event type → 200 (never make Stripe retry
   something we're choosing to ignore).

   | Event | Action |
   |---|---|
   | `checkout.session.completed` (with `payment_status == "paid"`) | fulfill (§6.4) |
   | `checkout.session.expired` | `pending → expired` |
   | `charge.refunded` | revoke (§6.5), `→ refunded` |
   | `charge.dispute.created` | revoke, `→ chargeback`, block future checkout for that player |
   | anything else | log at debug, 200 |

   Async-payment methods (bank debits) can pay after the session completes; if we ever
   enable them, also handle `checkout.session.async_payment_succeeded/failed`. At launch
   the payment method set is cards + wallets only, which settle synchronously.

### 6.4 Fulfillment — the one place atomicity matters

```python
def fulfill_order(order_id: int, payment_intent: str, country: str | None) -> None:
    with transaction() as conn:
        row = conn.execute(
            select(orders).where(orders.c.id == order_id).with_for_update()
        ).mappings().first()
        if row is None:
            log.error(...); return                    # never seen; alert
        if row["status"] in ("fulfilled", "refunded", "chargeback"):
            return                                    # idempotent no-op: Stripe retried
        # grant, tagging provenance for revocation
        if row["product"] == "wheel_special":
            conn.execute(insert(wheel_items).values(
                player_id=row["player_id"], kind="special",
                source="purchase", source_ref=str(order_id)))
        elif row["product"] == "skin_cherub":
            conn.execute(insert(skin_items).values(
                player_id=row["player_id"], skin="cherub_v1",
                source="purchase", source_ref=str(order_id)))
        conn.execute(update(orders).where(orders.c.id == order_id).values(
            status="fulfilled", fulfilled_at=func.now(), updated_at=func.now(),
            provider_payment_intent=payment_intent, country=country))
        # §7.4: an account that has spent money logs in with a code from now on
        conn.execute(update(players).where(players.c.id == row["player_id"])
                     .values(always_verify_email=True))
```

Three properties this buys, all of which have to hold:

- **`SELECT ... FOR UPDATE`** serializes concurrent deliveries of the same event (Stripe
  can and does deliver twice, in parallel).
- **The status check inside the lock** is the idempotency guard; `provider_session_id
  UNIQUE` is the second line of defence at the order-creation end.
- **One commit** covers grant + status, so a crash rolls back both and Stripe's retry
  re-runs cleanly.

### 6.5 Refunds & chargebacks

Revocation, by `source_ref = str(order_id)`, all inside one transaction:

1. Unspun `wheel_items` from this order → delete.
2. Spun `wheel_items` → delete the `skin_items` row whose `source_ref` is that wheel's id
   (the spin already writes this link), then delete the wheel row.
3. `skin_items` granted directly (Cherub) → delete.
4. If `players.equipped_skin` is a skin the player no longer owns → reset to
   `frog_green_v1`.
5. Set the order's `status` + `revoked_at` + `failure_reason`.

Deletion, not a soft flag: the audit trail lives in `orders`, and leaving a revoked skin
row around means every ownership query needs a filter it would eventually forget. Log the
full before/after at `info` — this is the record that answers a disputed refund.

Ops: refunds are issued from the **Stripe dashboard** at launch (no admin UI until Phase
4); the webhook makes that safe. A player who has had a chargeback cannot check out again
(`payments_blocked`) until an operator clears it manually.

### 6.6 Tax: what selling from a Norwegian ENK requires

**Decided: Stripe, with our own VAT registrations.** Not a merchant of record. *General
orientation, not tax advice — an hour with a Norwegian regnskapsfører before 2f is cheap
and is the right way to confirm all of this.*

Selling a digital good to a consumer means charging **VAT at the buyer's country's rate**
and remitting it there. Stripe is a payment processor, not a seller, so the ENK is the
seller of record and carries that obligation. The work this creates is **filings, not
code** — and it is a fixed, bounded amount of it.

**The real variable is market scope, not the processor.** Pick the rung before anything
else; everything below follows from it:

| Scope | What it costs you |
|---|---|
| Norway only | Norwegian MVA alone, with a NOK 50 000 threshold. Nearly free — but geo-fences away most of the player base, so it is not the plan. |
| **Norway + EU** *(recommended at launch)* | One **non-Union OSS** registration covering all 27 countries, one quarterly return. |
| \+ UK | One more registration with HMRC, quarterly. Add when UK players are worth it. |

Steps, in order:

1. **Norwegian MVA** — register in Merverdiavgiftsregisteret once taxable turnover passes
   **NOK 50 000** over 12 months. 25% on Norwegian buyers; bimonthly returns (annual
   reporting is possible below NOK 1 000 000 on application).
2. **Non-Union OSS** — Norway is outside the EU, so this is the non-Union scheme: register
   in one EU member state of your choosing (Ireland and the Netherlands are common picks
   for English-language administration), file one quarterly return covering all 27
   countries, pay in EUR. **No threshold for non-EU sellers — VAT is due from the first EU
   sale.** Norway and the EU have a VAT administrative-cooperation and recovery-assistance
   agreement, so this is enforceable, not theoretical.
3. **UK, when in scope** — HMRC registration, also **no threshold** for non-UK established
   sellers of digital services. Quarterly.
4. **Stripe Tax** — enable it (~0.5%/transaction), enter each registration as it is
   obtained, set the product tax code to *electronically supplied services*, and price
   **tax-inclusive**: a "$5" wheel must cost $5 at checkout for an EU consumer, so VAT eats
   a variable slice of margin (25% NO, 19% DE, 21% NL…). Exclusive pricing is legal but
   reads as bait-and-switch. Note Stripe Tax **calculates and collects; it does not file** —
   the returns are still yours.
5. **Records** — two non-contradictory pieces of location evidence per sale (billing
   country + IP, both stored by Stripe Tax), retained **10 years** under EU rules.
6. **Watch the other thresholds** — Switzerland (CHF 100 000 *worldwide* turnover is the
   trigger, unusually aggressive), Australia (AUD 75 000), Canada, Japan, Singapore, South
   Korea, India, US state economic nexus. Stripe Tax flags approaches; none are near-term.
7. **Hand the filings to a regnskapsfører.** Two registrations is roughly eight returns a
   year. This is the whole ongoing cost.

**Why not a merchant of record.** Paddle, Lemon Squeezy, FastSpring or Xsolla would become
the legal seller and handle all of the above, for **~5% + a fixed fee**. The reason to
decline is arithmetic: **their cost scales with revenue, ours is fixed.** Two registrations
plus an accountant is a flat annual number, so it wins early — the crossover is somewhere
in the **low tens of thousands** of annual revenue, not the six figures an earlier draft of
this section claimed.

Two things genuinely favour an MoR, and they are the triggers to revisit:

- An **ENK is not a separate legal person**, so the VAT liability is personal and
  unlimited, and a missed filing is your problem. If the returns turn out to be the thing
  that does not happen, that is the signal to switch — not a revenue number.
- They absorb most **chargeback** handling, which matters more for the $500 SKU than the $5
  one. If card fraud on Cherub becomes a real cost, reprice that risk.

Switching later is cheap by construction: §6.2 puts the provider behind the
`PaymentProvider` Protocol, so an MoR is a second implementation of
`create_checkout_session` / `verify_webhook` / `refund`, not a rewrite.

**On loot boxes and payment processors.** Stripe's restricted-business list targets
gambling — games of chance for prizes of *monetary value*. §9.3's absolute rule that skins
can **never** be cashed out or traded is exactly what keeps a paid randomized item out of
that category. That rule is therefore load-bearing for payment processing, not merely
compliance optics: **relaxing it later is a payments decision, not a product one.** (This
also cuts the other way — the games-specific MoRs exist partly because generalist
providers' acceptable-use policies are twitchier about randomized paid items. If Stripe
ever raises it, a pre-sales question to Xsolla or Paymentwall is the fallback.)

**None of this blocks building.** Phases 2a and 2b — the wheel, the largest remaining chunk
of work — contain no payment code at all, and 2c/2d run against Stripe test mode. The
registrations only need to exist before `SHOP_ENABLED` flips in 2f.

### 6.7 Local & CI testing

- `stripe listen --forward-to localhost:5000/stripe/webhook` against the docker-compose
  stack; `stripe trigger checkout.session.completed` for the happy path.
- Unit tests use `FakePaymentProvider` + a hand-built event dict — no network, no Stripe
  test keys in CI.
- One documented manual pass in test mode with card `4242 4242 4242 4242`, plus
  `4000 0000 0000 0341` (attaches, fails on charge) and a `stripe trigger
  charge.dispute.created` to exercise revocation.

---

## 7. Accounts & identity

§7.1–7.3 are **shipped** (§2.1). What remains:

### 7.4 Real login before/after first purchase — part of 2b

Already 90% done: `always_verify_email` now defaults true for new players (migration
`7ecb33637956`), so most accounts already require a 6-digit code at login. Remaining work
is two lines and one guard:

- `fulfill_order` sets `always_verify_email = true` permanently (§6.4) — this catches
  legacy accounts created before the default flipped.
- `/request_toggle_verify_email` refuses to turn it **off** for a player with any order in
  `('paid','fulfilled','refunded','chargeback')`: `403 {code: "paid_account"}`. Without
  this the flag is a toggle a compromised session can flip.

### 7.5 OAuth — Phase 3, on hold, spec kept implementable

Table (unchanged from the original plan, no FK on `player_id` per §2.2):

```
auth_identities: id, player_id, provider ('google'|'steam'|...), subject, email,
                 created_at, UNIQUE (provider, subject)
```

Google flow, concretely: `GET /auth/oauth/google/start` → build the OIDC authorization
URL with **PKCE** (S256) plus a random `state`, both stored in a short-lived signed cookie
→ Google → `GET /auth/oauth/google/callback` verifies `state`, exchanges the code, and
validates the `id_token` with `google-auth` (issuer, audience, expiry). Then:

1. `auth_identities(provider='google', subject=sub)` hit → `issue_account_session`, done.
2. No identity, but a `players` row with that email **and `email_verified_at NOT NULL`**
   → show an explicit "link this Google account?" confirmation, requiring the player to
   be logged in already or to pass the 6-digit code. Never auto-link on email alone.
3. Otherwise create a player via the existing name-picker, insert the identity, and —
   because Google asserts `email_verified` — set `email_verified_at` directly, skipping
   §7.1's link step.

Steam uses OpenID 2.0 and **gives no email**, so Steam-only accounts still need the email
verification step before buying. Discord and Apple are easier follow-ups if the goal is
verified emails.

---

## 8. Frontend work

### 8.1 Shipped (partial) — `/shop` (sub-phase 2d)

`src/app/shop/page.tsx`:
- Fetches `/shop/products` on mount (public — renders for logged-out visitors too, with
  a "log in to buy" CTA instead of the buy button).
- **Special Wheel card**: price, the odds table rendered from the API response (never
  hardcoded), a "how it works" line stating every spin is independent with no pity, and
  the 18+/terms checkbox that gates the buy button.
- **Cherub card** (2e): price, model preview via `SpinningModelViewer`, "You already own
  Cherub" state that turns Buy into a two-step confirm.
- Buy → `postCheckout` → on `email_unverified`, open the inline verification flow
  (reuse the `WheelClaimNudge` / `useClaimVerificationPoll` shape) instead of a dead end;
  on `already_owned`, flip the card to the confirm state; on `region_blocked`, show the
  region notice; otherwise `window.location.href = checkout_url`.

`src/app/shop/success/page.tsx` — reads `?order=`, polls `/inventory` every 2s for up to
60s until the item count changes, then "Payment received — your Special Wheel is in your
inventory" with a **Spin now** button. After 60s: "Payment received. If it isn't in your
inventory in a few minutes, contact support with order #N" — never a bare spinner, and
never a claim that the payment failed (it didn't; the webhook is just slow).

`src/app/shop/cancel/page.tsx` — "No charge was made", link back to `/shop`.

### 8.2 API layer (2c)

`src/lib/api.ts` + `src/lib/schemas.ts` gain `getShopProducts`, `postCheckout` — following
the existing `request(path, schema, {body, defaultErrorMessage})` pattern. `ApiError`
already carries `status`; extend the shop calls to surface the new `code` field (either
widen `ApiError` with an optional `code`, set in `http.ts` where it already reads
`body.error`, or return it in the resolved payload — the former keeps every call site
uniform and is preferred).

### 8.3 Changed screens

- **`/inventory`**: label wheel groups properly ("Special Wheel" vs "Wheel" — today
  `group.kind` is interpolated raw, so it renders "Use special Wheel"); add a Shop link
  next to the Wheels section and an empty-state "Get a Special Wheel" CTA.
- **`WheelSpinModal`** → the real wheel (**2b**, §3.5): full-screen instead of the current
  `max-w-sm` card, driven by `wheelGeometry.ts` / `wheelPhysics.ts` and the `kind` of the
  wheel being spun. Takes `{wheelId, kind}`; the inventory page already knows both. It
  fetches `/wheel/tables` (cached per session) so it can draw before the result lands.
- **Post-match award panel**: "Spin now" opens the same full-screen wheel. Check the
  game-over layout underneath it — the wheel is full-bleed and must not fight the
  scoreboard for the viewport on a phone.
- **Home / lobby nav**: a Shop entry point alongside Inventory.
- **`frogSkins.ts`**: `SKIN_MODEL_URLS` exception + Cherub color/label (2e).

### 8.4 Static pages (2f)

`/terms` and `/refunds` — plain content routes, linked from the shop card's checkbox and
from `/shop/success`. Content per §9.

---

## 9. Compliance & player trust

The paid Special Wheel is a **loot box** (real money in, randomized reward). Concrete
obligations, each with the implementation that satisfies it:

### 9.1 Region gating (Belgium & the Netherlands)

Both treat paid loot boxes as gambling. The free post-match wheel and the direct Cherub
purchase are fine everywhere; only `wheel_special` is gated. Two layers, because neither
alone is sufficient:

- **Pre-check at `/shop/checkout`** — best-effort country from the `CF-IPCountry` header
  (present if Cloudflare fronts the Hetzner deployment) or `X-Forwarded-For` + a GeoIP
  lookup if we add one. Blocked → `403 region_blocked`, no Stripe session created. If no
  country signal is available, allow through — this layer is a courtesy, not the gate.
- **Authoritative check at fulfillment** — Stripe collects the billing country;
  `session.customer_details.address.country` is trustworthy in a way an IP is not. If it
  is in `BLOCKED_COUNTRIES` for `wheel_special`: **do not grant**, immediately
  `provider.refund(payment_intent, reason="requested_by_customer")`, set the order to
  `refunded` with `failure_reason='region_blocked'`, and show the player an explanation on
  `/shop/success` (which is polling and needs a real terminal state for this case).

  Also set `payment_method_options` / Checkout's own country restrictions where Stripe
  supports it, so the common case is caught before money moves.

### 9.2 Odds disclosure

Mandatory in China, required by Apple/Google if this ever ships as an app, expected by EU
consumer regulators. Exact percentages shown **next to the buy button and inside the spin
modal**, generated from `/shop/products` → `domain/wheels.odds_payload` → the same table
`draw()` uses. A test asserts the rendered table's numbers match the served payload.

### 9.3 Honest framing

- **The STOP ROLL button must never be presented as skill.** The outcome is decided at
  spin start. No "nice timing!", no near-miss animation that lingers next to bling before
  moving on — a deliberate near-miss is the exact dark pattern regulators cite. The
  ease-out lands where it lands.
- State plainly that every spin is independent and there is no pity mechanic.
- **No cash-out, ever.** Skins are never sellable for money on our platform; no trading at
  launch (trading + rarity odds is what pulled CS:GO skins into gambling regulation).

### 9.4 Money & minors

- ToS: purchases require being 18+ or having guardian consent; the shop's buy button is
  gated behind an explicit checkbox, and `orders.terms_version` records what was accepted.
- Purchases are gated behind a verified email regardless.
- Publish a **refund policy**: digital goods; an **unspun wheel is refundable within 14
  days** (easy — it's a revocable inventory row); a spun wheel is consumed and not
  refundable, which is the standard "consumer consents to immediate performance" carve-out
  in the EU withdrawal right. Say this in the ToS *and* on the shop card, before purchase,
  because that is the condition on which the carve-out actually holds.
- Every grant/spin/purchase is logged with `source`, `source_ref`, timestamps (already in
  the schema), so a dispute is answerable from the audit trail.

---

## 10. Integrity & anti-abuse

- **CSPRNG for every roll** (2a): `secrets.SystemRandom()` in `routes/wheel.py`, injected
  into `domain/wheels.draw()`. Never seeded from player-controlled input. This replaces
  the current `random.choice` (§2.3.1) — the deterministic name-hash approach was already
  retired with `assignSkins`; this closes the last predictable-RNG path.
- **Wheel drop only in bot-free matches**, plus the 4-per-bi-weekly-period cap — together
  these bound quick-loss farming without a separate anti-abuse cap. *(Shipped.)*
- **Ownership from the session, never the body**: `player_id` always comes from
  `resolve_account_session`. *(Shipped; keep it true in `routes/shop.py`.)*
- **Rate limits** per §5.4, including the `5/hour` checkout ceiling.
- **Card testing**: a $500 SKU attracts it. Keep Radar on with the default rules plus
  "block if CVC fails" and manual review above $100; the `payments_blocked` state after a
  chargeback stops the same account retrying.
- **Never trust the redirect.** Only the signature-verified webhook grants items (§6.3).
- **Alert on anomalies** (Phase 4): more than N bling wins in a day, any order stuck in
  `paid` (fulfillment failed mid-way), any webhook signature failure burst.

---

## 11. Testing

Per sub-phase, with the file each test belongs in.

**2a — `backend/tests/test_wheel_domain.py` (new), `test_wheel_routes.py` (extend)**
- `WHEEL_TABLES['special']` weights sum to exactly 30 000; `normal` to 6.
- `draw()` with a seeded `random.Random` is deterministic; 1M-draw simulation lands each
  color within tolerance (marked slow, runs in CI nightly rather than per-commit).
- `draw()` never returns a skin outside the table; cumulative scan has no off-by-one at
  weight boundaries (assert the first and last weight unit map to the right slices).
- `/wheel/spin` on a `kind='special'` row returns a rare skin, on `normal` a common one.
- Spin is atomic: the wheel row and the `skin_items` row appear together or not at all.
- Double-spin still returns 404 "already spun" and grants exactly one skin.

**2b — the wheel. `src/lib/__tests__/wheelGeometry.test.ts` + `wheelPhysics.test.ts`**

Geometry (pure, so all of this is cheap and exact):
- Per-color total angle equals `360 × weight/total` within 1e-9, **at every slice count
  from 48 to 420** and for both tables — this is the §9.2 guarantee, so it gets a sweep,
  not a spot check.
- Every color gets at least one slice; bling gets exactly one; slice angles within a color
  are equal; all slices sum to 360°.
- The largest-remainder ordering never places two slices of the same color adjacently
  while another color still has a deficit.
- Geometry solved at 320/390/768/1280/1920/3440px widths: visible arc stays in 45°–66°,
  `R_inner > 0`, slice arc-length stays in 22–52px.
- `pickTargetRotation` lands strictly inside a slice of the result color — for every
  color, over thousands of RNG values — and never within 15% of a slice edge.
- Over many calls for the same color, the chosen slice is roughly uniform across that
  color's slices (no accidental bias to one spot).

Physics (pure `step(state, dt)`):
- The flapper spring is stable and returns to ~0 with no input; it never exceeds the 34°
  clamp under a maximum-ω impulse train.
- Peg-crossing detection fires exactly once per boundary crossed at 60fps *and* at 20fps
  (variable slice widths, multiple crossings per frame).
- `ω_cruise = p·D/T` holds: velocity at the ease-out's first frame equals cruise velocity
  within 1% — the no-jolt property.
- The ease-out is monotonic, ends exactly on target, and ends at ~zero velocity.

Component / visual:
- `WheelSpinModal` renders full-screen and calls `/wheel/spin` exactly once under
  StrictMode double-invoke (the existing `calledRef` regression).
- `prefers-reduced-motion` renders the result immediately with no rAF loop started.
- Canvas-context failure falls back to the simple reveal rather than throwing.
- Playwright screenshots at 390×844 and 1920×1080 as a manual eyeball check (not a
  pixel-diff gate — the wheel is animated and a diff would flap).

**2c — `backend/tests/test_shop_routes.py` (new)**
- `/shop/checkout`: 401 no session · 403 unverified · 403 blocked region · 403 after
  chargeback · 409 Cherub duplicate without `confirm_duplicate`, 200 with it · 503 when
  `SHOP_ENABLED=false`.
- Order row is `pending` with the price snapshotted before any Stripe call.
- Webhook: bad signature → 400 and **no** grant. Valid `checkout.session.completed` →
  exactly one item, order `fulfilled`, `always_verify_email` set.
- **Same event delivered twice → one grant** (the property that matters most).
- Two concurrent deliveries of the same event → one grant (exercise the `FOR UPDATE`
  path with two connections).
- `charge.refunded` on an unspun wheel deletes it; on a spun wheel deletes the resulting
  skin; equipped skin resets to green when revoked.
- A refund event for an unknown/never-fulfilled order logs and no-ops rather than
  crashing the webhook (a 500 makes Stripe retry forever).
- Region-blocked billing country at fulfillment → refund called, no grant.

**2d — frontend vitest, `src/app/shop/__tests__/`**
- Odds table renders exactly the served numbers (guards §9.2).
- Each error `code` drives the right UI branch.
- Success page stops polling and shows the support message after the timeout.

**2e** — Cherub: `skinUrl('cherub_v1')` maps to `/models/cherub-v01.glb`; equip endpoint
accepts it when owned, 403 when not.

**E2E (Playwright, `frontend/e2e/shop-purchase.spec.ts`)** — buy in Stripe test mode →
webhook (via `stripe listen`) → wheel appears in inventory → spin → skin owned → equip →
visible in the next lobby. Note this repo's quirk: in-game action buttons need
`dispatchEvent('click')` rather than `click({force: true})`.

**Coverage ratchet** — CI measures with `--cov=.` (see commit `aee7510`); new backend
modules must not drop it.

---

## 12. Rollout phases

**Phase 0 — Identity prerequisites — ✅ shipped.**
**Phase 1 — Ownership & the free wheel — ✅ shipped.**

### Phase 2 — Shop & payments

Ordered so that every sub-phase is independently mergeable. `SHOP_ENABLED=false`
everywhere until 2f.

**The wheel comes before the shop.** 2b is not a polish pass bolted onto a payment
feature — it is the product. It ships to the free post-match wheel that is *already live*,
which means it earns its keep before a single dollar moves, gets exercised by real players
at real screen sizes for weeks before anything is charged for, and turns the $5 purchase
into "buy another spin of that thing you like" rather than "buy a color flicker".

**2a — Wheel + payment safety prerequisites** *(backend only, no user-visible change)* —
✅ **shipped 2026-07-25.** Done: `domain/wheels.py` (tables, `draw`, `odds_payload`) ·
`secrets.SystemRandom` in `routes/wheel.py` · spin dispatches on `wheel_items.kind` ·
`GET /wheel/tables` · `db.transaction()` · spin's consume + grant now one commit ·
`token_from_json_body` + rate limits on `/wheel/spin`, `/inventory`, `/inventory/equip`.
See §2.3.
*Exit: a hand-inserted `kind='special'` row spins to a rare skin using CSPRNG ✅, in one
transaction ✅; the odds table exists in exactly one place ✅ and is served over HTTP ✅.*
*Size: small. Was worth doing first — it was also a bug fix for what's already live.*

**2b — The Wheel** *(the centerpiece, §3.5)* — ✅ **shipped 2026-07-25.** See §2.5.
`wheelGeometry.ts` + `wheelPhysics.ts` (both pure, both tested) · `WheelCanvas` ·
`WheelFlapper` · `useWheelAnimation` · `WheelSpinModal` rewritten full-screen · responsive
geometry from 320px to ultrawide · 3D shading, grooves, pegs, brass rim, side vignette ·
flapper spring driven by peg impacts. Changed from the original spec during build: there's
no separate STOP ROLL step — the wheel spins cosmetically from the moment the modal opens,
and Roll both commits the server call and lands the already-spinning wheel on the result
(spin-up → cruise → stopping → settle → result), per product feedback during review. Also
built: motion blur via temporal supersampling keyed to `getQualityTier()`, reduced-motion
and canvas-failure fallbacks.
*Exit: the free post-match wheel spins the real wheel on a phone ✅ (verified live against
the dev backend on a real device) and both tables render true to odds ✅. Not yet verified:
widescreen/ultrawide layout, and no 60fps performance profiling has been done — both still
open before calling this fully exited. This shipped to `new-wheel` ahead of any payment
code, matching the plan.*
*Size: the largest frontend chunk of Phase 2 — and the one worth spending the time on.*
*Verification is by eye as much as by test: check it on a real phone in portrait and
landscape, and on the widest monitor available, before calling it done.*

**2c — Orders + Stripe backend** *(backend only)* — ✅ **shipped 2026-07-25.**
`orders` table + migration · `stripe` dependency · config vars + boot validation (fails to
boot if `SHOP_ENABLED=true` with any Stripe var missing) · `services/payments.py`'s
`PaymentProvider` Protocol (`StripePaymentProvider` + an in-process price cache;
`FakePaymentProvider` in `tests/conftest.py`) · `routes/shop.py` (`/shop/products`,
`/shop/checkout`, `/stripe/webhook`) · `fulfill_order` (atomic, `FOR UPDATE`-locked) ·
region-blocked-at-fulfillment refund path (§9.1) · `revoke_order` (refund/chargeback
revocation, §6.5) · §7.4's `paid_account` toggle guard in `routes/auth.py` · the
pending-order expiry sweeper · rate limits on `/shop/checkout`/`/shop/products` ·
`tests/test_shop_routes.py` + `tests/test_payments.py` (StripePaymentProvider mocked at
the SDK boundary, no real keys).
*Exit, automated-test level (met): same event delivered twice grants exactly once ✅,
region-blocked fulfillment refunds without granting ✅, refund/chargeback revocation
deletes the right rows and resets `equipped_skin` ✅, bad webhook signature grants nothing
✅. Exit, §6.7's manual pass (not yet done -- needs real Stripe test-mode keys, which this
build didn't have): `stripe trigger checkout.session.completed` against a live
`stripe listen`-forwarded webhook, plus the `4000 0000 0000 0341` and
`charge.dispute.created` manual passes. Do this once real Stripe test keys are available,
before flipping `SHOP_ENABLED` for real (2f).*
*Size: the biggest single chunk of backend work in Phase 2.*

**2d — Shop frontend** — 🟡 **partial, shipped 2026-07-26.**
Done: `/shop` (fetches `/shop/products`, renders each product generically by `kind`,
odds table straight from the product's embedded `odds` -- never hardcoded, guards §9.2) ·
`/shop/success` (polls `/inventory` for the item-count change, 60s timeout message,
never claims the payment failed) · `/shop/cancel` · `/terms` + `/refunds` (pulled forward
from 2f -- the checkbox needed somewhere real to link to) · `getShopProducts` /
`postCheckout` + schemas · `ApiError.code` widened generically in `http.ts` (not shop-only)
so every call site can branch on the machine-readable code · the inline email-verification
gate (reuses `claimName`'s existing idempotent resend + `useClaimVerificationPoll`, not a
new component) · `already_owned` duplicate-confirm flow · `region_blocked` inline message ·
inventory wheel labels (`wheelKindLabel`: "Special Wheel" vs "Wheel", not the raw backend
string) + a Shop link and empty-state CTA on the Wheels card · a Shop entry in the home
page's user menu.
Still open: **`WheelSpinModal`'s odds table** -- still its own local copy in
`wheelGeometry.ts`, not fetched from `GET /wheel/tables` (§2.3 item 3's original tail;
both copies are hand-verified byte-for-byte identical today, so this is a maintenance
debt, not a live discrepancy, but it's the one piece of "odds table ... in the wheel
modal" not done here). **A real Stripe test-mode click-through** (§12's own exit
criterion below) -- this build had no real Stripe test keys available; only automated
tests (mocked `ShopProduct`/`ApiError` responses) and a live, unauthenticated smoke check
against the real dev backend (confirms `/shop` correctly shows "not open yet" while
`SHOP_ENABLED=false`) were possible in this environment.
*Exit (automated-test level, met): odds render exactly the served numbers, every error
`code` drives the right UI branch, the success page stops polling and shows the support
message after the timeout. Exit (not yet met): a real test-mode purchase completes
end-to-end from the browser, and the Special Wheel it grants spins on the wheel built in
2b -- do this once real Stripe test keys are available (same gap as 2c).*

**2e — Cherub** *(independent; can move anywhere after 2c)* — 🟡 **in progress, not
shipped** (branch `monetization-2e-cherub-dev`, unmerged by design -- this is a live
art/feel pass, not something to push to production sight-unseen).
Done: `SKIN_MODEL_URLS` exception in `frogSkins.ts` (`cherub_v1` → `/models/cherub-v01.glb`,
not the `frogs/<skin>.glb` pattern) · color (`#fef08a`) + label ("Cherub") · a hover bob in
`PlayerAvatars.tsx` (`cherub_v1` only, disabled while dead) so it reads as flying rather
than standing flat like a frog -- amplitude/speed are two named constants
(`CHERUB_HOVER_AMPLITUDE`/`CHERUB_HOVER_SPEED`) meant to be hand-tuned while watching it
live, not derived from anything · `cherub_v1` granted directly to a dev account (`grant`
source, bypassing the shop) so it can be equipped and taken into a real match without
`SHOP_ENABLED`/Stripe. `fulfillment`/duplicate-confirm/shop-card-preview already came for
free from 2c/2d's generic-by-`kind` handling, not new work here.
Still open: **live scale/rig verification** -- this build's environment has no working
WebGL (confirmed via a real headless-browser pass: the match loads with zero console
errors and the cherub asset serves correctly, but the canvas itself can't paint here), so
the actual look -- size relative to the frogs, whether the rig/pose reads correctly,
whether the hover amplitude/speed feels right -- needs a real browser with a GPU. The
`SpinningModelViewer` preview (shop card, inventory) was deliberately left untouched
(no hover there) pending a decision on whether it should also bob once the in-match look
is confirmed.
*Exit (not yet met): buying Cherub grants `cherub_v1`, it equips, and it renders correctly
in a match -- blocked on the live-eyeball pass above, not on anything left to build.*
*Risk: if the model doesn't work as a player skin, this becomes art work and drops out of
Phase 2 entirely -- still the open question this phase exists to answer.*

**2f — Compliance & launch**
`/terms` + `/refunds` pages · 18+ checkbox + `terms_version` · region gating both layers ·
fraud rules · **VAT registrations obtained and entered into Stripe Tax** (§6.6) · live
Stripe keys · `SHOP_ENABLED=true`.
*The registrations are the long pole here — non-Union OSS has no threshold, so it must be
in place before the first EU sale, not after it.*
*Exit: first real dollar, correctly fulfilled and refundable.*

**Launch checklist (2f):** webhook endpoint registered in the live Stripe dashboard with
the right events · `STRIPE_WEBHOOK_SECRET` is the **live** one (a test-mode secret against
live traffic fails every signature silently) · prices created in live mode and the ids
swapped · a real €/$ purchase made and refunded end-to-end · Sentry alert on any order
older than 10 minutes still in `pending`/`paid` · support email published on the shop
pages.

### Phase 3 — Social login *(on hold, no active work)*

Google OIDC per §7.5, `auth_identities`, account linking. Steam/Discord after. Deliberately
deferred until Phase 2 has shipped and been observed.

### Phase 4 — Ops, tooling & tuning

- **Admin tooling** — `backend/scripts/admin.py`: `grant-skin`, `revoke-order`,
  `inspect-player`, `clear-payment-block`. CLI against the DB (no HTTP surface, no new
  auth to get wrong). Every action logs to `orders.failure_reason` / a note field.
- **Analytics** — a documented SQL set (revenue/day, conversion from `/shop` view to
  fulfilled order, wheels granted vs spun, share of players hitting the bi-weekly cap,
  bling wins) and a small `/admin/metrics` endpoint behind an `ADMIN_TOKEN` if a dashboard
  is wanted.
- **Alerting** — Sentry (already wired in `app.py`) alerts on: stuck orders, webhook
  signature failures, fulfillment exceptions, refund-revocation failures.
- **Drop-cap tuning** — the bi-weekly 4 is a guess; revisit against real data. It's one
  constant (`WHEEL_DROP_CAP`) and one config change.
- **Multi-packs** (3× / 10× Special Wheels) — new Stripe Prices + `orders.quantity`, which
  the schema already carries.
- **Price localization** — Stripe Prices per currency; `/shop/products` picks by the
  request's country.

---

## 13. Decision log

Resolved (2026-07-16 / 07-18, unchanged):

1. **Skin clashes:** identical skins allowed — two players can both appear red (§3.1).
2. **Guests:** wheel drops require a claimed account; guests wear green and see a
   "claim your name to earn wheels" teaser (§3.2).
3. **Green on the normal wheel:** excluded — 6 slices, 1/6 each, duplicates normal (§3.2).
4. **Multi-packs:** single $5 wheel per checkout at launch (§3.3).
5. **Cherub duplicates:** allowed, but warn + explicit confirm (§3.4).
6. **Pity mechanic:** none — independent 1/300 per spin, disclosed (§3.3).
7. **Normal-wheel drop cap:** 4 match-drop wheels per player per global bi-weekly period
   (§3.2).
8. **Reward-claim verification:** link-based, gates wheels *and* relics (§7.1). *Shipped.*
9. **Forgot username:** verified rows only, generic response (§7.3). *Shipped.*
10. **Google OAuth:** on hold, Phase 3 (§7.5).

Added 2026-07-24:

11. **Odds live in `domain/wheels.py` and are served over the API.** The frontend never
    hardcodes them, so the disclosed table cannot drift from the RNG (§3.3, §9.2).
12. **Cherub's skin id is `cherub_v1`**, not `frog_*`, with a `SKIN_MODEL_URLS` exception
    rather than moving the asset (§3.4).
13. **`SHOP_ENABLED` defaults false** and boot fails if it's true with missing Stripe
    config — merging shop code can never open a storefront by accident (§6.1).
14. **The payment provider sits behind a Protocol** so a merchant-of-record swap is a new
    implementation, not a rewrite (§6.2, §6.6).
15. **Region gating is two-layered**, and the authoritative layer is Stripe's collected
    billing country at fulfillment, with auto-refund (§9.1).
16. **Slice count is responsive, not fixed at 300.** Per-color *total angle* is exact at
    any slice count, so N is derived from screen size to keep slices 26–46px at the rim
    (~110 on a phone, ~340 on a monitor). Supersedes the old "300 slices exactly" rule,
    which only existed to force whole-number slice counts (§3.5.3).
17. **The wheel ships before the shop** (Phase 2b, ahead of 2c/2d). It improves the free
    wheel that is already live, gets weeks of real-device exposure before money is
    involved, and makes the $5 purchase worth making (§12).
18. **The wheel modal is full-screen at every breakpoint.** `R = 1.25 × viewport width`
    keeps the visible arc at ~47°–64° everywhere, so a widescreen shows *more of the same
    wheel* rather than a bigger one. The current `max-w-sm` card is retired (§3.5.2).
19. **The flapper is a physics object, not an animation.** A damped spring driven by peg
    impulses, so its chatter slows honestly with the wheel and doubles as the speedometer
    (§3.5.5).
20. **Cruise speed is derived from the ease-out** (`ω_cruise = p·D/T`) so pressing STOP
    ROLL produces no velocity jolt (§3.5.6).
21. **Stripe, with our own VAT registrations — not a merchant of record** (§6.6). An MoR's
    ~5% scales with revenue while two registrations plus an accountant is a flat annual
    cost, so the fixed-cost path wins from the low tens of thousands of revenue upward. An
    earlier draft put that crossover in the six figures, which was wrong and is corrected
    here. The triggers to revisit are behavioural, not numeric: filings that don't happen
    (an ENK's VAT liability is personal and unlimited), or chargeback losses on the $500
    SKU. The `PaymentProvider` Protocol keeps the switch to one file (§6.2).
22. **§9.3's no-cash-out/no-trading rule is load-bearing for payments**, not just
    compliance: it is what keeps a paid randomized item outside the "games of chance for
    prizes of monetary value" category payment processors restrict. Relaxing it later is a
    payments decision, not a product one (§6.6).

Added 2026-07-25, during 2b's build — these supersede the corresponding §3.5 spec text,
which still describes the original design rather than what shipped:

23. **No separate STOP ROLL step.** The wheel spins cosmetically from the moment the modal
    opens; the single **Roll** button both commits the server call and lets the
    already-spinning wheel land on the result the instant it's known — no "Stopping…"
    state, no player-visible stop action. Decision #20's principle (derived cruise speed,
    zero velocity discontinuity) still holds; only the trigger for entering the stopping
    phase changed, from a player press to the server response arriving (§3.5.6).
24. **No auto-stop timer.** The 15s auto-stop in §3.5.6 doesn't exist — the wheel is
    designed to cruise indefinitely (it's already spinning before the player has done
    anything to spend a wheel), so there's nothing to time out.
25. **Cruise speed is ~0.08× the originally-specified `ω_cruise`.** Three rounds of product
    feedback during review ("too fast", then "slow down to 0.33×", then "another 0.5×")
    landed the shipped speed at `nominal × 0.5 × 0.33 × 0.5`. `MIN_LANDING_REVOLUTIONS`
    dropped from 2.5 to 0.05 for the same reason: at the slower cruise speed, the original
    2.5-turn minimum made the stopping ease-out take 30-60s, which read as broken rather
    than dramatic. The idle cruise already runs for however long the player takes to press
    Roll, so the stopping phase doesn't need its own forced extra revolutions to sell "this
    has been spinning" (§3.5.6, §3.5.7).
26. **Odds are not shown on the result splash.** §3.5.8 called for showing the odds of the
    outcome ("Gold — 30%") on win; product feedback during review was "you don't need the
    odds showing anywhere" and it was cut. The odds-disclosure requirement itself (§9.2) is
    unaffected — it just isn't satisfied on this specific screen.
27. **Non-winning slices dim to 32% brightness, not 55%** (§3.5.8's number was a
    placeholder guess; 32% is what shipped after visual tuning).
28. **Only the exact landed slice highlights**, addressed as a bug fix during review (an
    earlier pass briefly highlighted every slice sharing the winning color, which was a
    misreading of feedback, corrected the same day) — matches §3.5.7's "no ambiguity" intent
    but is worth naming since it was a real regression along the way, not just spec
    follow-through.
29. **The Special Wheel's rare skins render on the wheel with skin-specific treatments, not
    flat `skinColor()` hexes**: rainbow is a real multi-hue gradient swept across each
    slice's own width (not anchored to fixed screen coordinates, which was tried first and
    produced a "same color at the pointer every time" bug — see `WheelCanvas.tsx`), and
    bling is a light-green base with scattered silver sparkle glints. Not specified in
    §3.5.4 at all; added because the flat placeholder colors (especially bling's original
    near-black, and rainbow's single flat pale hue) were "very bland" per product feedback.

**Open — needs a decision before 2f can finish:**

- **Which markets to open at launch** (§6.6). Norway + EU is the recommendation: one
  non-Union OSS registration covers all 27 countries. Adding the UK is one more
  registration, whenever UK players are worth it. This choice — not the processor — is
  what determines the tax work.
- **Is $500 for Cherub real, or a statement piece?** It changes the fraud posture
  (manual-review thresholds, Radar rules) more than it changes the code. Assumed real.
