# Art & Texture Plan — Homemade Style Pass

Mapping of every visual surface in the game and what art it needs, so the whole
game can be moved to one unique, homemade hand-drawn style. The reference for
the target style is the existing rope-frame button art
(`public/models/buttons/rope_button-ld-v2.png`, rendered by
`src/components/hud/RopedButton.tsx` / `RopedInput.tsx`).

All art is drawn by hand (no generated/stock assets) — uniqueness is the point.

## 0. Locked decisions

- **Frog skins stay as-is** — the 11 `public/models/frogs/*.glb` models are not
  touched. (They do need 2D *thumbnails*, see §2.3 — the models themselves are
  final.)
- **Homepage stays as-is** — the temple/mountain/worldmap home scene and its
  overlay are not part of this pass.
- **Hades must be regenerated** — `hades_v3` is too close to Disney's
  portrayal. New model + texture required (§3).
- **The Wheel is drawn by hand** — currently a placeholder with no art at all
  (§1).

---

## 1. The Wheel (highest priority — no art exists)

The wheel is the monetization centerpiece and today it is a pure placeholder:
`src/components/WheelSpinModal.tsx` renders a 🎡 emoji and a flat color circle
that cycles through skin colors (the code comments say exactly this — "not a
physically-accurate spinning wheel with slices/pointer").

Art to draw:

| Asset | Used by | Notes |
|---|---|---|
| Wheel disc with 6 slices | `WheelSpinModal.tsx` | Normal Wheel: 6 uniform slices, one per non-green common skin (`NORMAL_WHEEL_SKINS` in `src/lib/frogSkins.ts`). Each slice shows that frog skin's thumbnail/color. |
| Special Wheel disc (weighted slices) | future shop flow | `docs/MONETIZATION_PLAN.md` §3.3: slices sized from the `/shop/products` odds table, odds visibly disclosed (§9 compliance). Easiest if slices are drawn as separate wedge assets composited in code, so odds changes don't require redrawing. |
| Pointer / ticker | `WheelSpinModal.tsx` | Sits at top of wheel; the thing that "lands" on a slice. |
| Hub + outer frame | `WheelSpinModal.tsx` | Rope-frame ring would tie it directly to the RopedButton style. |
| Small wheel icon (~64px) | `WheelClaimNudge.tsx` (two 🎡), `LobbyOverlay.tsx:125` ("You won a Wheel!"), `app/inventory/page.tsx:199` ("Use Wheel" button) | Replaces the 🎡 emoji everywhere. |

The reveal flow itself (spin → settle → result) is in place; the art can slot
into the existing phases.

## 2. Art that is missing entirely (placeholders in code)

### 2.1 Rank tier badges (ranked system, current branch)

`src/components/hud/RankBadge.tsx` is a text+color chip; its own comment says
"no icon art exists yet". Twelve tiers, keyed to backend `RANKED_TIERS`:

- Troll I / II / III
- Djinn I / II / III
- Warlock
- Wizard I / II
- Demi-God
- God
- Principality

Practical approach: 5 tier-family emblems (Troll, Djinn, Warlock/Wizard,
Demi-God/God, Principality) + a numeral/pip system for sub-tiers, rather than
12 unique drawings. Small sizes matter — the badge renders at chip size in
lobby lists and the stats page.

### 2.2 Vault artifact image (broken today)

`src/app/vault/page.tsx:285` renders `/images/artifacts/Elements.svg` — **this
file does not exist in `public/`**, so the vault reward screen shows a broken
image right now. Needs the artifact drawn (up to ~800px wide per the inline
style) or the `<img>` removed.

### 2.3 Frog skin thumbnails

`src/lib/frogSkins.ts` comment: "No pre-rendered 2D thumbnails exist for these
models yet — a flat color swatch stands in." The swatch shows on the inventory
grid (`app/inventory/page.tsx:221`) and the wheel spin reveal. The models are
final; what's needed is one thumbnail per skin (11 total: 7 common + 4 rare) in
the homemade style — either drawn portraits or stylized renders of the GLBs.

### 2.4 Shop art (upcoming, per `docs/MONETIZATION_PLAN.md`)

Not built yet, but the plan commits to art:

- Special Wheel product card art ($5 item).
- Cherub shop thumbnail + any card art ($500 skin — `public/models/cherub-v01.glb`
  exists but is referenced nowhere yet).
- Shop page chrome, `/shop/success` and `/shop/cancel` pages.

Drawing these alongside the wheel keeps the whole monetization surface in one
style.

## 3. Hades regeneration

Active model: `public/models/hades/hades_v3-ld.glb`, used as the boss avatar in
`src/components/lobby/PlayerAvatars.tsx:204` (preloaded at `:499`). An HD
variant `hades_v3-hd.glb` exists on disk but is currently unreferenced.

- Redesign away from the Disney look (blue flame hair / grey skin / dark robe
  combo is the recognizable part), remodel + hand-painted texture.
- Deliver at least the LD variant (the one the game loads); decide whether the
  HD variant is still wanted before making it.
- Legacy versions on disk that nothing references: `hadesv01.glb`,
  `hades_v2.glb`, `hades_v2_draco.glb` — delete when v4 lands.

## 4. Generic UI chrome → homemade style

Everything below is plain Tailwind (dark cards, emoji glyphs) with no art. This
is where the rope/parchment identity can spread through the whole game. Two
existing homemade anchors to build on: the rope frame
(`rope_button-ld-v2.png`) and parchment (`public/images/parchment.png`,
currently used only on the rules pages).

### 4.1 In-game HUD (highest-visibility UI)

`src/components/SceneOverlay.tsx` + `ResourceCard.tsx`:

- Resource cards: HP (❤), Coins (💰), ATK (⚔) — black translucent rounded
  cards. Need drawn frames + drawn icons for heart / coin / sword.
- DEFEND button (🛡, `SceneOverlay.tsx:696` and `PlayerAvatars.tsx:311`) —
  drawn shield icon; could become a RopedButton.
- Crown glyph 👑 (winner markers, `SceneOverlay.tsx:598,675`,
  `LobbyOverlay.tsx`) — a drawn crown icon (a 3D crown model already exists;
  a matching 2D icon keeps it consistent).
- Kill-witness banner (`LobbyScene.tsx:933`): "💀 X got a kill! 🔥" — drawn
  skull/flame or a styled banner strip.
- Coin/relic marker 🪙 (`RelicSelectionPopover.tsx:140`,
  `LobbyOverlay.tsx:224`) — drawn coin icon (match the gold-coin GLB).

### 4.2 Modals & nudges

All share the same generic `bg-gray-900 border-amber-500/40 rounded-xl` frame:
`WheelSpinModal`, `WheelClaimNudge`, `BossSignupNudge`, `RelicSelectionPopover`,
`Toast`, the relic list + auth modals in `HomeOverlay` (homepage overlay itself
is otherwise locked as-is). One reusable drawn modal frame (parchment panel +
rope border, nine-slice or stretched) would restyle all of them at once.

### 4.3 Guide

`src/components/lobby/GuideBubble.tsx` / `InGameGuide.tsx` — white rounded
speech bubble, plain buttons. Candidate: parchment scroll bubble. A wizard
mascot already exists (`public/images/wizard.png`, only used on `/rules`) —
reusing it as the guide's portrait would tie the guide to existing art.

### 4.4 Menu / account pages

`login`, `signup`, `settings`, `stats` (leaderboard + rank badges),
`inventory`, `vault`, `forgot_username`, `verify_email` — all generic Tailwind.
Decide per page: full homemade treatment (inventory + stats are player-facing
showpieces) vs. leaving utilitarian pages (auth forms) plain. Minimum: shared
drawn page header/frame so they don't feel like a different product.

### 4.5 Buttons

`RopedButton`/`RopedInput` currently only appear in `WorldMapOverlay`.
Spreading them (or size variants of the rope frame) to `StartGameButton`, lobby
ready/leave buttons, and modal buttons is mostly a code change once the art
variants exist (e.g. small/square rope frames, a red "danger" rope variant).

## 5. 3D scene materials (procedural colors today)

- **Sea & sky** (`src/components/lobby/SeaAndSky.tsx`): sea is a flat
  `#3b7fb5` standard material on a 6000×6000 plane; sky is drei's procedural
  `<Sky>`. A hand-painted water texture (+ simple normal/roughness) and/or a
  painted sky gradient would carry the homemade style into the whole lobby
  scene background.
- **Vault scene** (`src/components/vault/VaultScene.tsx`): flat blue/gold
  icosahedron — stylistically fine as abstract geometry; texture optional.
- **Effects** (`ExplosionEffect`, `KillFireEffect` `#ff6b35`, `WellGlowEffect`,
  `InstakillBurstEffect`, `DenyRingEffect`): procedural particles/rings.
  Optional: hand-drawn sprite sheets (flame lick, smoke puff, sparkle) to make
  VFX match the drawn style. Low priority — colors can be tuned to the palette
  first.
- **Existing homemade GLBs** (keep, restyle only if they drift from the final
  palette): `temple.glb`, `mountainv1.glb`, `well/wellv02.glb`, `playerv1.glb`,
  crowns (`crown_ld_v1`, `well_crown_v1`), swords, shields, well reward models
  (gold/health/sword/instakill/deny/info), `lost_soul_v2.glb`, `turtlev01.glb`.

## 6. Uniqueness risks — stock assets currently shipped

These are the places where the game visibly uses non-unique, widely-recognized
free assets:

1. **World map planet textures** (`public/textures/…` — earth, moon, sun,
   mars, jupiter, saturn + rings, mercury, venus, Milky Way skybox): this is
   the classic free planet-texture set used by countless three.js demos.
   `src/components/worldmap/WorldMap.tsx` loads all of them. Hand-painting
   these (even at 1k) is the single biggest "unique look" win outside the
   lobby. The homepage is locked as-is for now, so this is a later pass —
   but it should be on the list, because it's the most recognizable stock art
   in the game.
2. **HDRI** `public/hdri/venice_sunset_1k.hdr` — stock environment map, used
   for lighting only (not directly visible). Fine to keep; swap only if
   lighting mood should change.
3. **Next.js starter SVGs** in `public/` (`next.svg`, `vercel.svg`,
   `globe.svg`, `file.svg`, `window.svg`) — unused cruft, delete.
4. **Logo**: `public/wom.svg` + `src/app/icon.svg` — confirm these are
   original; the favicon/logo should get the homemade treatment too.

## 7. Unused art to prune (or consciously revive)

Nothing in code references these; deleting them (or moving to an archive)
keeps the asset folder honest while restyling:

- `public/images/buttons/attack|defend|well|resource|rope*.png` (all of them —
  only `models/buttons/rope_button-ld-v2.png` is used)
- `public/models/buttons/*-hd.glb` (attack/defend/resource/rope/well HD button
  models)
- `public/models/hadesv01.glb`, `hades_v2.glb`, `hades_v2_draco.glb`
- `public/models/well/wellv01.glb`, `well/well-hd.glb`
- `public/models/crowns/crown_hd_v1.glb`, `crown_hd_v1_draco.glb`
- `public/models/frogs/frogv01.glb`, `frog_rainbow_v1.glb` (v2 is the live one)
- `public/models/ghost.glb`, `energy_potion-hd.glb`, `red_arrow_v1.glb`
- `public/models/cherub-v01.glb` — *keep*: reserved for the $500 shop skin
- `public/models/hades/hades_v3-hd.glb` — unreferenced; superseded by the v4
  regeneration (§3)

## 8. Suggested drawing order

1. **Wheel** (§1) — monetization centerpiece, zero art today, on the current
   branch.
2. **Rank badges** (§2.1) — ranked is the other current branch; 5 emblems + pips.
3. **Vault artifact** (§2.2) — fixes a broken image.
4. **Modal frame + core icons** (§4.1–4.2) — one drawn panel + heart / coin /
   sword / shield / crown / skull / wheel icons replaces every emoji glyph and
   restyles all modals; biggest bang-for-effort in perceived quality.
5. **Frog thumbnails** (§2.3) — 11 small portraits, unlocks a proper inventory
   grid and wheel slices.
6. **Hades v4** (§3) — model + texture regeneration.
7. **Sea/sky + guide + menu chrome** (§4.3–4.5, §5) — spread the style.
8. **World map repaint** (§6.1) — later pass, homepage currently locked.

## 9. Practical asset conventions

- UI art: transparent PNG, drawn at 2× display size (the rope button renders at
  ~170×70, so ~340×140 source); keep a consistent line weight across icons.
- Icons: one square canvas size (e.g. 128×128 source, displayed 24–64px) so
  they can swap in for emoji glyphs without layout changes.
- Wheel: separate layers (disc, slices, hub, pointer, frame) so code can rotate
  the disc independently and compose Special Wheel odds dynamically.
- Model textures: keep the current GLB workflow (Draco-compressed variants for
  LD where size matters — the frog preload comment notes ~92 MB when eager).
