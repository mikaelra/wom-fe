# Planetary Aspects Plan — Conjunctions (Phase 1)

Implementation brief for generalizing the Moon's existing conjunction lighting
into a **mutual, all-bodies aspect system**, starting with conjunctions.
Oppositions, trines and squares come later and this design leaves room for them
(§10) — but **do not implement them in this pass**.

> **Status:** ✅ implemented 2026-08-14, PR open on branch
> `claude/wom-planetary-aspects-m2og56`. All 17 required presets ship at
> `/dev/aspects`; `src/lib/astrology.test.ts` covers §7 in full (25 tests).
> Awaiting product-owner visual review of the tuning constants in §2.4 —
> per §9's suggested commit sequence, that's the expected next round, not
> a sign anything here is unfinished.

---

## 0. What exists today (read this first)

Everything astrology-related lives in one file:
`src/components/worldmap/WorldMap.tsx` (1433 lines). Landed in `0902d6e`
("Give the Moon astrology-driven conjunction lighting", #291).

| Piece | Where | What it does |
|---|---|---|
| `computeMoonAstrology(date)` | `WorldMap.tsx:173` | Loops the 5 classical planets, weights each by angular separation from the **Moon** inside a 10° orb, blends their colors, returns `{ color, strength, phaseFraction }`. **One-directional: only the Moon receives.** |
| `angularSeparationDeg(a, b, time)` | `WorldMap.tsx:139` | Geocentric separation via `Astronomy.Equator` → unit vectors → `angleTo`. |
| `MOON_CONJUNCTION_ORB_DEG = 10`, `_FALLOFF_EXP = 0.62`, `_BOOST = 0.30` | `WorldMap.tsx:134-136` | The weight curve `w = 1 - (sep/orb)^0.62`. |
| `MoonBody` | `WorldMap.tsx:526` | The two-layer effect: a **glowShell** (sphere at `MOON_R * 1.06`, additive, `astro.color`) + an **aura sprite** (`moonAuraTex`, the "fog"). The long comment at `:484-519` explains *why* it is two layers — read it, the reasoning (billboard depth vs. real geometry; radial gradient vs. Fresnel rim) applies verbatim to every planet you are about to give an aura. |
| `moonAuraTex(color, size)` | `WorldMap.tsx:244` | The soft fog gradient: flat to 35%, long fade to transparent. No hot core. |
| `makeMoonFresnelMat(astro)` | `WorldMap.tsx:316` | The globe's moonlight rim shell (`Globe`, `:1196`). |
| `MoonLight` | `WorldMap.tsx:924` | Directional light, `intensity = astro.strength`, colour deliberately **not** tinted — see its comment at `:942-948`. Keep that reasoning. |
| `*Body` components | `:566-758` | Sun, Jupiter, Mercury, Mars, Saturn, Venus. Each is a textured sphere + a **fixed** additive glow shell at `opacity={0.4}` in its own colour. |
| `*Light` components | `:767-916` | One weak directional light per body, fixed colour + intensity. |
| `DEBUG_FORCED_CONJUNCTIONS` / `debugConjunctionPos` | `:47`, `:156` | The current visual-inspection hack: hand-edit a module constant, forcing a body to a fixed separation **from the Moon only**. |
| `DEBUG_NOW` | `:65` | Freeze the clock. Needed because the Moon's *rendered* terminator comes from real Phong shading under `SunLight`, not from any phase number. |

### The structural flaw to fix

`DEBUG_FORCED_CONJUNCTIONS` is consumed in **two independent places** that must
agree by hand: `computeMoonAstrology` (`:192-193`, for the maths) and
`PlanetSprites` (`:991-1029`, for the rendering). Six near-identical
`posXReal` / `forcedX` / `posXDebug` blocks. Adding pairwise aspects to that
shape means every pair needs its own override plumbing — it does not scale.

**Fix:** compute one **sky snapshot** (every body's unit direction) once,
apply preset overrides *to the snapshot*, then derive both the aspect maths
and the rendered positions from it. Maths and rendering then cannot disagree,
by construction, and the six duplicated blocks collapse to one lookup.

---

## 1. Locked design decisions

These were decided with the product owner. Do not re-litigate them.

1. **Aspects are mutual.** In a Venus/Mercury conjunction, Venus glows
   Mercury-coloured *and* Mercury glows Venus-coloured. (Today only the Moon
   receives.)
2. **Each body uses its own orb** — the orb is how far away that body can
   still be *reached*. Jupiter feels Saturn out to 4°, Saturn feels Jupiter
   only out to 3°, so a pair lights up **asymmetrically**. This keeps the Moon
   at 10° toward every planet, so today's Moon behaviour is unchanged.
3. **The effect is the Moon's effect, applied everywhere**: the light source,
   the additive glow shell, and the aura/fog sprite — with the receiving body
   taking the *donating* body's colour.
4. **The Sun donates no colour and receives nothing.** Its effect is pure
   amplification: it intensifies whatever colour a nearby body already has and
   grows its aura. The Sun's own appearance never changes.
5. **The Moon additionally tints purple near the Sun.** This is a named
   per-body `SOLAR_TINT` entry (only the Moon has one today), separate from the
   generic amplification in (4), so it can be extended to other bodies or
   dropped without touching the amplification maths.
6. **Conjunctions only in this pass.** Oppositions/trines/squares are §10.
7. **Zero-aspect invariant:** with no body inside any orb, every frame must
   render **exactly** as it does today. This is an acceptance criterion (§8)
   and the safety net for the whole refactor.

---

## 2. Constants

### 2.1 Orbs (degrees)

| Body | Orb | Notes |
|---|---|---|
| Moon | 10 | Existing `MOON_CONJUNCTION_ORB_DEG`. Unchanged. |
| Mercury | 8 | |
| Venus | 7 | |
| Mars | 5 | |
| Jupiter | 4 | |
| Saturn | 3 | |
| **Sun** | **6** | Amplification orb only — the Sun never donates colour. |

### 2.2 Weight curve

Unchanged from today: `w(sep, orb) = sep >= orb ? 0 : 1 - (sep/orb)^0.62`.

The exponent < 1 is deliberate — it holds near full strength close to 0° and
falls away toward the orb edge, so the *realistically common* few-degree
separations still read as meaningfully close. The comment at `WorldMap.tsx:122-133`
explains this; carry it over to the new module rather than deleting it.

Reference table (weight a body receives at a given separation, using its own orb):

| sep | Moon (10°) | Mercury (8°) | Venus (7°) | Mars (5°) | Jupiter (4°) | Saturn (3°) | Sun (6°) |
|---|---|---|---|---|---|---|---|
| 0° | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| 1° | 0.760 | 0.725 | 0.701 | 0.631 | 0.577 | 0.494 | 0.671 |
| 2° | 0.631 | 0.577 | 0.540 | 0.433 | 0.349 | 0.222 | 0.494 |
| 3° | 0.526 | 0.456 | 0.409 | 0.271 | 0.163 | 0.000 | 0.349 |
| 4° | 0.433 | 0.349 | 0.293 | 0.129 | 0.000 | 0.000 | 0.222 |
| 5° | 0.349 | 0.253 | 0.188 | 0.000 | 0.000 | 0.000 | 0.107 |
| 6° | 0.271 | 0.163 | 0.091 | 0.000 | 0.000 | 0.000 | 0.000 |
| 7° | 0.198 | 0.079 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 8° | 0.129 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 9° | 0.063 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| 10° | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |

Use these numbers as unit-test fixtures (§7).

### 2.3 Colours

Two distinct tables — do not merge them. `DONOR_COLOR` is what a body *gives*
to whatever it conjoins; `BASE_COLOR` is what a body shows with no aspect
active. They differ for Mercury (`0xFFBC03` vs `0xDB9504`), and `BASE_COLOR`
must be the exact literal each `*Body` uses today so the zero-aspect invariant
holds bit-for-bit.

| Body | `DONOR_COLOR` (gives) | `BASE_COLOR` (own shell today) | Source |
|---|---|---|---|
| Moon | `0xcfe3ff` | `0xcfe3ff` | `MOON_BASE_COLOR`, `:137` |
| Mercury | `0xFFBC03` (retro: `0xCE70FF`) | `0xDB9504` (retro: `0xCE70FF`) | `:178`, `:639` |
| Venus | `0xAB9D00` | `0xAB9D00` | `:179`, `:749` |
| Mars | `0xFF0000` | `0xFF0000` | `:180`, `:663` |
| Jupiter | `0x008296` | `0x008296` | `:181`, `:611` |
| Saturn | `0xA16300` | `0xA16300` | `:182`, `:715` |
| Sun | — (donates nothing) | — | |

Mercury's retrograde flip (`isRetrograde`, `:93`) applies to both its donor and
base colours, exactly as today.

`SOLAR_TINT` — per-body, optional: `{ Moon: 0xCE70FF }`. Nothing else has one.
(`0xCE70FF` is the purple already used for retrograde Mercury; reuse it rather
than inventing a second purple.)

### 2.4 Strength / render tunables

Starting values. All are expected to be tweaked after visual review — keep them
as named module constants in one block, not inlined.

| Constant | Value | Meaning |
|---|---|---|
| `STRENGTH_BASE.Moon` | `0.05` | Existing baseline. |
| `STRENGTH_BASE.<planet>` | `0.0` | **Must be 0** — this is what preserves the zero-aspect invariant for planets. |
| `STRENGTH_BOOST.Moon` | `0.30` | Existing `MOON_CONJUNCTION_BOOST`. |
| `STRENGTH_BOOST.<planet>` | `0.15` | Planets are small; less headroom needed. |
| `SHELL_BASE_OPACITY.Moon` | `0.0` | Moon has no glow shell without an aspect today. |
| `SHELL_BASE_OPACITY.<planet>` | `0.4` | The existing fixed `opacity={0.4}`. |
| `SHELL_MAX_OPACITY.Moon` | `0.8` | Existing cap. |
| `SHELL_MAX_OPACITY.<planet>` | `0.85` | |
| `SHELL_GAIN` | `3` | `shellOpacity = base + min(max - base, strength * SHELL_GAIN)`. Moon reduces to today's `min(0.8, strength*3)`. |
| `AURA_GAIN` | `4` | `auraOpacity = min(1, strength * AURA_GAIN)`. Existing Moon value. |
| `MOON_AURA_BASE_SCALE` / `_GROWTH` | `3.2` / `3.4` | Existing; scales with `phaseFraction`. |
| `PLANET_AURA_BASE_MULT` | `3.0` | `auraScale = bodyRadius * (BASE + GROWTH * influence)`. |
| `PLANET_AURA_GROWTH_MULT` | `4.0` | |
| `LIGHT_GAIN` | `2.0` | `intensity = baseIntensity * (1 + LIGHT_GAIN * influence)` for planet lights. |
| `SUN_SATURATION_GAIN` | `0.6` | Colour intensification near the Sun. |
| `SUN_STRENGTH_GAIN` | `1.2` | Multiplicative aura amplification. |
| `SUN_CORONA_FLOOR` | `0.075` | **Additive, not phase-scaled** — see §4.3. |
| `SUN_AURA_GROWTH` | `2.0` | Extra aura scale near the Sun. |
| `SOLAR_TINT_MAX` | `0.85` | Max lerp toward `SOLAR_TINT` at 0° from the Sun. |

---

## 3. New module: `src/lib/astrology.ts`

Move the maths out of `WorldMap.tsx` into a pure, node-testable module. R3F
scene components are explicitly out of scope for unit testing in this repo
(`vitest.config.ts` coverage comments) — extracting the maths is what makes the
behaviour testable at all.

> ⚠️ **Coverage ratchet.** `src/lib/**/*.ts` is inside the coverage `include`
> glob and `vitest.config.ts` carries hard thresholds
> (statements 66 / branches 60 / functions 63 / lines 67). Adding a sizeable new
> `src/lib` file **without** tests will fail CI. The §7 tests are not optional,
> and per the repo convention you must record the observed post-change numbers
> in a `vitest.config.ts` comment (and raise the thresholds if they rise).
> Never lower a threshold to make the build pass.

### 3.1 Types and API

```ts
export type AspectBody = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn';

/** Every body's geocentric unit direction at one instant, plus the scalars
 *  derived from that instant. Positions here are the SINGLE source of truth:
 *  both the aspect maths and the rendered scene positions come from it, so a
 *  preset override can never desync them (the flaw in today's
 *  DEBUG_FORCED_CONJUNCTIONS). */
export interface Sky {
  date: Date;
  dir: Record<AspectBody, THREE.Vector3>;   // unit vectors
  mercuryRetrograde: boolean;
  moonPhaseFraction: number;                // Astronomy.Illumination(Moon).phase_fraction
}

export interface BodyAspect {
  /** Final resolved colour: base → blended toward donors → solar saturation → solar tint. */
  color: THREE.Color;
  /** Combined conjunction weight, 0–1, capped. Drives colour mix and light gain. */
  influence: number;
  /** Drives glow-shell and aura opacity. Includes the solar terms. */
  strength: number;
  /** Sun proximity weight, 0–1. Exposed so render code can grow the aura. */
  sunWeight: number;
}

export function computeSky(date: Date, overrides?: SkyOverride[]): Sky;
export function separationDeg(sky: Sky, a: AspectBody, b: AspectBody): number;
export function conjunctionWeight(sepDeg: number, orbDeg: number): number;
export function computeAspects(sky: Sky): Record<AspectBody, BodyAspect>;
```

`computeSky` builds `dir` from `Astronomy.Equator(body, date, OBSERVER, false, true)`
→ `raDecToVec3(ra, dec, 1)` for all seven bodies, then applies overrides (§6.1).
`raDecToVec3`, `angularSeparationDeg`, `isRetrograde` and `OBSERVER` move here
from `WorldMap.tsx`; re-export or import them back as needed.

### 3.2 Session singleton

Every scene component today independently calls `useMemo(() => debugNow(), [])`.
Keep that shape but point it at one lazily-initialised module singleton:

```ts
let cached: Sky | null = null;
export function getSky(): Sky {           // lazy: reads the URL preset on first call
  if (!cached) cached = computeSky(presetDate() ?? new Date(), presetOverrides());
  return cached;
}
```

Guard preset lookup with `typeof window !== 'undefined'`. `WorldMap` is already
`dynamic(..., { ssr: false })` so `window` exists in practice, but
`src/lib/astrology.ts` may be imported from a server context later.

---

## 4. The maths

For each receiving body **R** (all seven, including the Sun):

### 4.1 Colour and influence — conjunctions between non-Sun bodies

```
donors  = all bodies except R and except the Sun          // Sun donates nothing
for each donor O:
    w_O   = conjunctionWeight(separationDeg(R, O), ORB[R])   // R's OWN orb — decision §1.2
    accumulate DONOR_COLOR[O] * w_O
influence = min(1, Σ w_O)                                 // cap: several conjunctions ≠ runaway
mix       = Σ (DONOR_COLOR[O] * w_O) / Σ w_O              // weighted average
color     = BASE_COLOR[R].lerp(mix, influence)            // no donors → exactly BASE_COLOR
```

This is exactly today's `computeMoonAstrology` body (`:185-209`), generalized
over R. **The Sun is excluded as a receiver here** (it receives nothing) *and*
as a donor (it gives no colour).

### 4.2 Base strength

```
raw = STRENGTH_BASE[R] + STRENGTH_BOOST[R] * influence
strength = raw * (R === 'Moon' ? sky.moonPhaseFraction : 1)
```

The Moon's phase scaling is existing behaviour (`:211-217`): a tight
conjunction at new moon must still read far weaker than one at full. Planets
have no rendered phase, so they are not scaled.

### 4.3 The Sun's amplification — and the trap

```
sunWeight = conjunctionWeight(separationDeg(R, 'Sun'), ORB.Sun /* 6 */)

// (a) intensify the body's own colour — multiply HSL saturation, clamp to 1
color = saturateBy(color, 1 + SUN_SATURATION_GAIN * sunWeight)

// (b) per-body solar tint (Moon only today)
if (SOLAR_TINT[R]) color.lerp(SOLAR_TINT[R], SOLAR_TINT_MAX * sunWeight)

// (c) amplify the aura — multiplicative AND additive
strength = strength * (1 + SUN_STRENGTH_GAIN * sunWeight)
         + SUN_CORONA_FLOOR * sunWeight        // <- additive, NOT phase-scaled
```

> ### ⚠️ Why `SUN_CORONA_FLOOR` must be additive and outside the phase scaling
>
> A body within 6° of the Sun is, for the Moon, *by definition* a new moon.
> Illuminated fraction at those elongations:
>
> | elongation | 0° | 1° | 2° | 3° | 4° | 5° | 6° |
> |---|---|---|---|---|---|---|---|
> | `phase_fraction` | 0.000000 | 0.000076 | 0.000305 | 0.000685 | 0.001218 | 0.001903 | 0.002739 |
>
> Multiply anything by that and it is gone. If the solar term is purely
> multiplicative, **all seven Sun–Moon examples in §6.2 render as identical
> black frames** and the reviewer sees nothing. The additive floor is what makes
> the effect visible, and it is deliberately a departure from the
> "new moon = no moonlight" rule — read it as the corona of an eclipse. Flag
> this explicitly in the PR description; it is the one place this pass knowingly
> breaks physical plausibility, and the product owner should sign it off
> visually.
>
> Because `phase_fraction` is ~0 across the whole 0–6° range, the visible ramp
> in those examples comes *entirely* from `sunWeight`:
> **1.000 → 0.671 → 0.494 → 0.349 → 0.222 → 0.107 → 0.000**. That is the
> monotonic progression the reviewer should see. If the 6° frame is not
> visually identical to "no effect at all", the implementation is wrong.

`saturateBy` — convert via `THREE.Color.getHSL` / `setHSL`, multiply `s`, clamp
to `[0, 1]`. Note this is a no-op on a fully desaturated colour; the Moon's
`0xcfe3ff` has low but non-zero saturation, which is fine because the Moon's
visible change near the Sun is carried by `SOLAR_TINT`, not by (a).

### 4.4 The Sun as receiver

`computeAspects` must still return an entry for `'Sun'`, but it is inert:
`influence = 0`, `strength = 0`, `color = BASE_COLOR.Sun`, `sunWeight = 0`.
Nothing about `SunBody` (`:566`) or `SunLight` (`:767`) changes in this pass.

---

## 5. Rendering changes in `WorldMap.tsx`

### 5.1 Extract the shared aura into one component

Lift `MoonBody`'s two layers into a reusable component, applied to every body:

```tsx
function AuraLayers({ bodyRadius, aspect, auraScale }: {
  bodyRadius: number; aspect: BodyAspect; auraScale: number;
}) // -> <mesh> glow shell at bodyRadius * 1.06 + <sprite> moonAuraTex
```

- **Glow shell:** `sphereGeometry [bodyRadius * 1.06]`, `meshBasicMaterial`,
  `color={aspect.color}`, `blending={AdditiveBlending}`, `depthWrite={false}`,
  `opacity = SHELL_BASE_OPACITY[R] + min(SHELL_MAX[R] - base, strength * SHELL_GAIN)`.
  For planets this **replaces** the existing hard-coded `0.4` shell — at
  `strength = 0` it evaluates to exactly `0.4` in exactly the body's own colour,
  so nothing changes visually with no aspect active.
  ⚠️ Each planet's shell radius today is *not* uniformly `1.06×` its body
  (Jupiter is `0.64/0.5 = 1.28`, Mercury `0.26/0.20 = 1.30`, Venus `0.32/0.25 = 1.28`,
  Saturn `1.30`, Mars `1.28`). **Preserve each body's existing shell radius** —
  pass it in rather than deriving it — or the zero-aspect invariant breaks.
- **Aura sprite:** `moonAuraTex('#' + aspect.color.getHexString())`,
  `opacity = min(1, strength * AURA_GAIN)`, additive, `depthWrite={false}`,
  no manual camera offset. Planets have no aura sprite today; at `strength = 0`
  its opacity is 0, so it is invisible until an aspect fires.
  `auraScale` per body:
  - Moon: `MOON_AURA_BASE_SCALE + MOON_AURA_GROWTH * phaseFraction + SUN_AURA_GROWTH * sunWeight`
    (the phase term is existing behaviour — keep it).
  - Planets: `bodyRadius * (PLANET_AURA_BASE_MULT + PLANET_AURA_GROWTH_MULT * influence) + SUN_AURA_GROWTH * sunWeight`.

  Memoise the texture on `aspect.color` — it allocates a canvas.

The comment block at `WorldMap.tsx:484-519` explains why this is a real sphere
plus a billboard sprite rather than one Fresnel shell or one offset sprite.
**Move that comment onto `AuraLayers`** — its reasoning is now shared by seven
bodies, and re-deriving it later would be expensive.

### 5.2 Per-body wiring

| Component | Change |
|---|---|
| `MoonBody` `:526` | Take `aspect: BodyAspect` instead of `astro: MoonAstrology`; delegate both layers to `AuraLayers`. |
| `MercuryBody` `:624`, `VenusBody` `:738`, `MarsBody` `:652`, `JupiterBody` `:600`, `SaturnBody` `:683` | Accept an `aspect` prop; replace the hard-coded glow-shell `<mesh>` with `<AuraLayers>` (keeping each body's existing shell radius, §5.1). Saturn's rings are untouched. |
| `SunBody` `:566` | **No change.** |
| `*Light` `:794-916` | `intensity={BASE_INTENSITY * (1 + LIGHT_GAIN * aspect.influence)}`. **Do not tint these lights** with `aspect.color` — they are real scene lights targeting the origin, so a tint Phong-shades the *globe* and reads as the planet painting the Earth. `MoonLight`'s comment at `:942-948` states the reasoning; it now applies to all of them. Colour stays each body's own constant. |
| `MoonLight` `:924` | Keep `intensity={aspect.strength}` (already strength-driven). |
| `PlanetSprites` `:961` | Delete the six `posXReal`/`forcedX`/`posXDebug` blocks (`:991-1029`). Positions become `getSky().dir[body].clone().multiplyScalar(BODY_R[body])`. One lookup, no branches. |
| `Globe` `:1146` | `computeMoonAstrology(debugNow())` → `computeAspects(getSky()).Moon`. `makeMoonFresnelMat` keeps taking `{ color, strength }`. The globe rim stays **Moon-only** in this pass — the Earth is moonlit, not Saturn-lit. Revisit later if wanted. |
| `CameraRig` `:1258` | Reads the Sun direction from `getSky().dir.Sun` instead of calling `Astronomy.Equator` directly, so presets move the camera's anti-solar start point consistently. |

### 5.3 Removals

Delete `DEBUG_FORCED_CONJUNCTIONS`, `forcedConjunctionFor`, `debugConjunctionPos`
and `DEBUG_NOW` (`:35-68`). The preset harness (§6) replaces all of them and is
strictly more capable. `computeMoonAstrology` and the `MoonAstrology` interface
go too, subsumed by `computeAspects`.

### 5.4 Draw-order note (expected, not a bug)

Bodies sit at different radii to force front-to-back ordering
(`MOON_BODY_R = 36` … `SATURN_BODY_R = 46`, `:28-33`). At a **0° conjunction the
nearer body partially occludes the farther one** — Mercury (r=38) sits in front
of Venus (r=40). Both auras still render additively and blend. This is correct
and expected; do not "fix" it by moving bodies.

One happy accident worth preserving: the Moon (radius 1.5 at r=36) subtends
~0.0417 rad and the Sun's core (radius 2.0 at r=46) ~0.0435 rad, so at Sun–Moon
0° the Moon's disc very nearly exactly covers the Sun's core — an eclipse, for
free. Do not change `MOON_BODY_R` or the Sun's geometry.

---

## 6. Visual-inspection harness

This is what the product owner reviews. It must exist before tuning starts.

### 6.1 Preset model — `src/lib/astrologyPresets.ts`

```ts
export interface SkyOverride {
  body: AspectBody;        // the body being moved
  relativeTo: AspectBody;  // placed this many degrees from this body's direction
  sepDeg: number;
  sign?: 1 | -1;           // which side; render-only, the maths only sees magnitude
}

export interface AspectPreset {
  id: string;              // URL slug
  label: string;
  note?: string;           // what the reviewer should be looking at
  date?: Date;             // freeze the clock (replaces DEBUG_NOW)
  overrides: SkyOverride[];
}
```

Resolution rules:
- Apply overrides **in array order**; `relativeTo` must already be resolved
  (either a real position or an earlier override). Throw on a forward or
  circular reference — a silent wrong placement is worse than a crash.
- Placement: rotate `dir[relativeTo]` by `sepDeg * sign` around an axis
  perpendicular to it. This is the existing `debugConjunctionPos` maths
  (`:156-160`) and is *exact* — the angle between original and rotated equals
  the rotation angle by construction, unlike a fixed tangential offset. Keep
  its pole fallback (`|y| > 0.999` → use a different reference axis).
- Because the maths reads the **same** `sky.dir`, `separationDeg` recovers the
  requested separation automatically. There is no second place to keep in sync.

### 6.2 Required presets

Ship every one of these. The first six are the product owner's list; the Sun–Moon
sweep is the "all variations" set.

| id | Scenario | Expected (per §2.2) |
|---|---|---|
| `live` | No overrides, real sky, live clock | Default. The zero-aspect regression check. |
| `mars-venus-1` | Mars & Venus 1° apart | Mars 0.631, tinted **Venus** `0xAB9D00`; Venus 0.701, tinted **Mars** `0xFF0000` |
| `jupiter-saturn-1` | Jupiter & Saturn 1° apart | Jupiter 0.577, Saturn 0.494 — visibly asymmetric, the clearest demo of decision §1.2 |
| `venus-saturn-2` | Venus & Saturn 2° apart | Venus 0.540, Saturn 0.222 — strongest asymmetry in the set (orb 7 vs 3) |
| `venus-mercury-4` | Venus & Mercury 4° apart | Venus 0.293, Mercury 0.349 — the weak/subtle end |
| `venus-mercury-1` | Venus & Mercury 1° apart | Venus 0.701, Mercury 0.725 |
| `venus-mercury-0` | Venus & Mercury 0° apart | Both 1.000 — full colour swap, max aura. Note §5.4 occlusion. |
| `sun-moon-0` … `sun-moon-6` | Moon 0°,1°,2°,3°,4°,5°,6° from the Sun (**7 presets**) | `sunWeight` 1.000 / 0.671 / 0.494 / 0.349 / 0.222 / 0.107 / **0.000**. Purple tint and aura scale ramp down monotonically; `sun-moon-6` must be indistinguishable from no effect (the control). See the §4.3 warning. |

Also add, for regression against today's behaviour (cheap, and they are the
only cases with a known-good "before"): `moon-venus-0`, `moon-venus-3`,
`moon-saturn-0`. These must look **exactly** as they do on `master` with the
equivalent `DEBUG_FORCED_CONJUNCTIONS` entry — the Moon's own numbers are
unchanged by this refactor.

For the Sun–Moon presets set `date` to a real new moon (find it with
`Astronomy.SearchMoonPhase(0, ...)`) so the Moon's *rendered* terminator agrees
with its forced position — the disc is Phong-shaded by the real `SunLight`, not
by any phase number. This is the same reason `DEBUG_NOW` existed (`:52-64`).

### 6.3 Access

Two entry points, both client-side only and static-export safe:

1. **`/?astro=<preset-id>`** — the homescreen already mounts `WorldMap`
   (`src/app/page.tsx:360`). `getSky()` reads the param on first call.
2. **`/dev/aspects`** — a plain index page listing every preset as a link to
   `/?astro=<id>`, with its `label`, `note`, and expected weights. Server-render
   safe, no 3D, ~50 lines.

Leave the harness enabled in production builds. It is inert without the query
param and undiscoverable — the same call `0902d6e` made when it left
`DEBUG_FORCED_CONJUNCTIONS` in place ("fully inert by default, to make it easy
to pin a specific combination for future visual tuning"). An unknown preset id
must fall back to the live sky, never crash.

---

## 7. Unit tests — `src/lib/__tests__/astrology.test.ts`

Node project (`environment: 'node'`, `src/**/*.test.ts`). Required by the
coverage ratchet (§3). `three` and `astronomy-engine` both import fine headless
— no WebGL is touched.

**Weight curve**
- `conjunctionWeight(0, orb) === 1` for every orb.
- `conjunctionWeight(orb, orb) === 0` and `conjunctionWeight(orb + 1, orb) === 0`
  (clamped, never negative).
- Strictly decreasing across `0 → orb`.
- Matches the §2.2 table to 3dp for all seven orbs.

**Mutuality and asymmetric orbs** — the core of this pass
- Jupiter/Saturn at 1°: `influence.Jupiter ≈ 0.577`, `influence.Saturn ≈ 0.494`,
  and the two are **not** equal.
- Venus/Saturn at 2°: Venus 0.540, Saturn 0.222.
- Saturn at 3.5° from anything: `influence.Saturn === 0` while its partner is
  still non-zero — per-body orbs, proven.
- At 0°, each body's `color` equals its partner's `DONOR_COLOR` exactly
  (influence 1 → full lerp).

**Zero-aspect invariant** (guards the whole refactor)
- With every body far apart: for each planet `strength === 0`, `influence === 0`,
  `color.getHex() === BASE_COLOR[body]`; for the Moon,
  `strength === 0.05 * phaseFraction` and `color === MOON_BASE_COLOR`.

**Moon regression**
- Moon still uses a 10° orb toward every planet (non-zero at 9°, zero at 10°).
- `strength` still scales with `moonPhaseFraction`.
- Multiple simultaneous donors cap `influence` at 1.

**Sun**
- The Sun donates no colour: a planet at 0° from the Sun has
  `color.getHex() === BASE_COLOR[planet]` after saturation — i.e. hue is
  unchanged, only saturation and strength move.
- The Sun receives nothing: `aspects.Sun.strength === 0` and
  `aspects.Sun.color` is unchanged with planets at 0°.
- Amplification: identical conjunction, one near the Sun and one far →
  `strength` strictly greater near the Sun.
- **Corona floor:** Moon at 0° from the Sun with `moonPhaseFraction = 0` has
  `strength > 0`. This is the test that would have caught the §4.3 trap.
- **Purple ramp:** Moon `color` blends toward `0xCE70FF` monotonically as
  Sun separation goes 6° → 0°, and at 6° is exactly the un-tinted colour.

**Preset resolution**
- For every preset in the registry, `separationDeg(sky, a, b)` recovers the
  requested `sepDeg` within 1e-6 — maths and rendering read the same snapshot.
- `sign: -1` produces the same separation as `sign: 1`.
- Overrides referencing an unresolved body throw.
- An unknown preset id resolves to the live sky.

No RTL/component tests for the R3F scene — out of scope per this repo's
convention (`vitest.config.ts` coverage comments).

---

## 8. Acceptance criteria

1. `npm test`, `npx tsc --noEmit`, and `npm run lint` all pass.
   `react-hooks/exhaustive-deps` is an **error** in this repo — watch the
   `useMemo` deps when swapping `astro` for `aspect`.
2. Coverage thresholds hold, with observed numbers recorded in a
   `vitest.config.ts` comment per repo convention.
3. **Zero-aspect invariant:** with `?astro=live` on a date with nothing inside
   any orb, the scene is pixel-identical to `master`.
4. All 17 presets in §6.2 load (1 live + 6 planet pairs + 7 Sun–Moon + 3 Moon
   regression), and each shows the effect its row describes.
5. `sun-moon-6` is visually indistinguishable from no effect; `sun-moon-0`
   through `sun-moon-5` ramp monotonically. Not all-black (§4.3).
6. `jupiter-saturn-1` and `venus-saturn-2` visibly demonstrate asymmetry.
7. No `DEBUG_*` constants remain in `WorldMap.tsx`.
8. `WorldMap.tsx` gets *shorter* — the six duplicated position blocks and
   `computeMoonAstrology` all leave.

---

## 9. Suggested commit sequence

Each step should build and pass tests on its own.

1. **Extract, no behaviour change.** Create `src/lib/astrology.ts` with
   `Sky`/`computeSky`/`separationDeg`/`conjunctionWeight` and a `computeAspects`
   that only fills in the Moon exactly as `computeMoonAstrology` does. Point
   `WorldMap.tsx` at it. Tests for the extracted maths. Scene unchanged.
2. **Preset harness.** `astrologyPresets.ts`, `getSky()` override plumbing,
   `/dev/aspects`, delete the `DEBUG_*` constants. Verify the Moon regression
   presets match `master`.
3. **Generalize to all bodies.** Per-body orbs, mutual donation, `AuraLayers`,
   the `*Body`/`*Light` wiring. The six planet-pair presets go live here.
4. **The Sun.** Amplification, saturation, corona floor, the Moon's purple
   tint. The seven `sun-moon-*` presets go live here.
5. **Docs.** Update `CHANGELOG.md`; mark this plan's status.

Steps 3 and 4 are where the look is decided — expect a tuning round on the
constants in §2.4 after review, and keep them in one clearly-labelled block so
that round is a one-file edit.

---

## 10. Room for the later aspects (do not build yet)

The design generalizes to oppositions/trines/squares by changing **one line**:
today `conjunctionWeight` measures `sep` from 0°. An aspect is just a target
angle with its own orb and falloff:

```ts
const ASPECT_ANGLES = { conjunction: 0, opposition: 180, trine: 120, square: 90 };
const offset = Math.abs(sep - ASPECT_ANGLES[kind]);
const w = offset >= orb ? 0 : 1 - Math.pow(offset / orb, FALLOFF_EXP);
```

Keep `conjunctionWeight` in that shape (a pure `(offsetDeg, orbDeg)` function)
so adding an aspect kind later means iterating `ASPECT_ANGLES` in
`computeAspects` and giving each kind a strength multiplier — no change to the
snapshot, the render layers, or the preset harness. Open questions to settle
when that pass starts, **not now**:

- Do the per-body orbs shrink for non-conjunction aspects? (Traditionally yes —
  minor aspects get tighter orbs.)
- Does an opposition donate colour the same way a conjunction does, or does it
  do something visually distinct (e.g. both bodies desaturate, or the aura
  elongates along the axis between them)? A conjunction and an opposition
  looking identical would waste the distinction.
- Does the Sun amplify at aspect angles too, or only at conjunction?
