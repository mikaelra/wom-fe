# Merchant Plan

A globe encounter: a `???` appears somewhere on the world map, tied to an
astronomical trigger. Click it and — if the trigger is active and you
haven't already this period — the Merchant offers one item for Hades'
Coins.

Phase 1 (this doc, shipped on branch): **Stone of Vitality**, a relic that
starts the player with 15 HP instead of 10, sold for 5 Hades' Coins, once
per full moon. Phase 2 (not started): the same Merchant sells **Paper**
(`docs/MARKET_PLAN.md` §1B's "Paper → Artifact spread" mechanic) on
**conjunctions** instead, temporarily. Same mechanism, different trigger
and item — that reuse is the point of everything below.

---

## 1. The one idea

The catalog is data, not code. A `merchant_offers` row is
`(merchant, item, cost, trigger_kind)`; adding Paper-on-conjunction later is
a migration, not a new route. `routes/merchant.py` is written generically
over `trigger_kind` for exactly this reason — see its `_TRIGGER_CHECKS`
dict, which Phase 2 extends with one entry.

## 2. What shipped (Phase 1)

**Backend (`wom-be`):**

- `engine/moon.py` — `is_full_moon_window(now)` / `latest_full_moon_at_or_before(now)`,
  a synodic-month approximation (reference full moon + mean synodic month,
  extrapolated by whole cycles). **Interim, explicitly not the real thing**:
  `docs/ASTRAL_TIMERS_PLAN.md` §3 already designs the real answer (the
  frontend's `astronomy-engine` generates a committed instant table; the
  backend does a binary search over it) — that table
  (`domain/astral_gates.py`) doesn't exist yet. `engine/moon.py`'s own
  docstring says not to point anything balance-critical at it; a couple of
  hours' drift a decade out costs nothing for a bonus NPC offer.
- `domain/merchant.py` — `find_active_offer(trigger_kind)` (fresh read of
  the catalog), `vitality_relic_id()` (cached lookup of Stone of Vitality's
  `relics.id`, the same hot-path shape `config.COIN_RELIC_ID` serves for
  Hades' Coin).
- `routes/merchant.py` — `POST /merchant/offer` (is it up, has this player
  already traded this period), `POST /merchant/purchase` (the atomic
  transaction: check not-already-bought, consume 5 Hades' Coin rows, mint
  one Stone of Vitality `relics_players` row, record the `merchant_trades`
  row — same coin-consumption pattern as `routes/market.py`'s `/longoffer`).
- `sockets/utils.py`'s `consume_selected_relics` — Stone of Vitality is
  selected pre-match exactly like Hades' Coin, and applies `p["hp"] += 5`
  at round 0→1, mirroring the coin branch verbatim.
- Migration `c4f9a1e2b7d3` — seeds the `Stone of Vitality` relic
  (`power_category='HEALTH'`, no `boss_id`: merchant-sold, not a boss drop)
  and the `merchant_offers` row, and creates `merchant_offers` /
  `merchant_trades`.

**Frontend (`wom-fe`):**

- `src/lib/merchant.ts` — `merchantMarkerLatLng(periodStartIso)`: a pure
  hash of the trigger period's own identity into a lat/lng in
  `[-60,60]×[-180,180]`. Deterministic and shared, not random-per-viewer:
  every player sees the `???` in the same spot, a refresh doesn't relocate
  it, and it moves to a new spot each full moon with **no coordinates
  stored anywhere** — the backend only ever sends `period_start`.
- `src/lib/useMerchantOffer.ts` — poll-only (60s), unlike
  `useBossfightRoster`'s push+poll: availability changes at most once per
  full moon, so there's no event worth a socket room for.
- `src/components/worldmap/MerchantMarker.tsx` — mirrors `CityMarker.tsx`'s
  position/orientation/hover mechanics, minus the GLTF pin (a glowing
  `???` label is the whole marker — it's meant to read as a mystery, and a
  rare marker doesn't earn a second pin asset).
- `src/components/merchant/MerchantScene.tsx` — **placeholder art, called
  out as such in the file itself**: a CSS repeating-gradient standing in
  for a log wall, a plain gradient div standing in for a wooden crate desk,
  and the real `public/models/merchant_v1.glb` (Meshy-generated, landed on
  `master` via PR #379) rendered through `SpinningModelViewer` — the same
  auto-fit-and-spin component used for relic/skin reveals, so no manual
  camera/lighting placement was needed. `merchant_v1` is wired into
  `src/lib/frogSkins.ts`'s `SKIN_MODEL_URLS`, per that asset commit's own
  note, even though the Merchant isn't a player skin.
- Wired into `src/app/page.tsx`: the marker draws when
  `offer.available === true`; clicking opens `MerchantScene`; a successful
  purchase calls `refresh()` so `already_bought_this_period` flips and the
  marker disappears without waiting for the next poll.

## 3. Open items (deliberately not done here)

1. **Real scene art.** The wall/desk are flat CSS, not modeled or
   textured. Mikael said he'd look at this live before anything merges —
   swap the backdrop for real geometry/texture once there's a design to
   match, without touching `MerchantScene.tsx`'s offer logic.
2. **"Haven't been in this before."** Today's gate is purely
   period-based (`merchant_trades` unique on `(player, offer, period)`) —
   any player can buy Stone of Vitality every single full moon forever.
   Whether a first-time-only variant is wanted for a future offer is an
   open product call, not assumed here.
3. **Phase 2 (Paper / conjunctions)** needs a conjunction-instant
   authority before it can gate correctly — the same frontend-computes /
   backend-stores split `ASTRAL_TIMERS_PLAN.md` §3 designs for the lunar
   and solar gates, generalized to an arbitrary pair of bodies. Until that
   exists, `_TRIGGER_CHECKS` only has `'full_moon'`.
4. **`engine/moon.py` should retire** once `domain/astral_gates.py`
   (`ASTRAL_TIMERS_PLAN.md` §3) ships — swap `latest_full_moon_at_or_before`
   for `astral_gates.latest_lunar_at_or_before` and delete the
   approximation. The function names already match on purpose.

## 4. Tests

Both repos' coverage ratchets are satisfied by new tests, not by
exemption:

- `wom-be`: `tests/test_moon.py`, `tests/test_domain_merchant.py`,
  `tests/test_merchant_flow.py` (offer + purchase, including the
  insufficient-coins/already-bought/not-available rejections, mirroring
  `tests/test_market_flow.py`'s `FakeConn`/`_Result` style), and the
  Stone-of-Vitality cases added to `tests/test_consume_selected_relics.py`.
- `wom-fe`: `src/lib/__tests__/merchant.test.ts`,
  `src/lib/__tests__/useMerchantOffer.test.tsx`,
  `src/components/__tests__/MerchantScene.test.tsx` (SpinningModelViewer
  mocked out, same reasoning `app/__tests__/page.test.tsx` gives for
  mocking `@react-three/fiber`'s `Canvas`), plus the `merchant_v1` case
  added to `src/lib/__tests__/frogSkins.test.ts`. `MerchantMarker.tsx`
  itself is untested directly, same as `CityMarker.tsx` — R3F scene
  components in this repo are verified by eye, not RTL.
