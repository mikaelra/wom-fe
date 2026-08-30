# City Scene Plan — Greece, the Signpost, and the Real Sky

Status: **in progress — steps 1–11 of §13 built** · Scope: `wom-fe` only (no backend,
no protocol change) · Written: 2026-08-30 · Last updated: 2026-08-30

> **Implementation notes.** Steps 1–11 are built on the `city-scene` branch, which
> carries the running work. Building them disproved six things this plan asserted
> — the rotation matrix and lunar parallax in §6.3, the camera model in §5.3, the
> step ordering in §13, and two things about the label text in §7.4–§7.5 — all
> corrected in place and flagged **[corrected]** so the history stays legible.
> Still to come: the dead-code deletion, the Senate model, and the arcs. Two
> unplanned additions carry their own **[added]**/**[corrected]** notes: the
> loading curtain (§5.4) and the temporary tuning instruments — the red ecliptic
> band (§6.5) and the city's time controls (§6.6).
>
> **Viewing another sky.** `?t=` on the city URL overrides the instant, read as
> Athens local time: `/city?id=athens&t=02:00` for tonight's 2am starfield,
> `&t=2026-12-21T02:00` for a winter one. Unparseable values fall back to the
> real sky rather than erroring.
Depends on: `docs/ASPECTS_PLAN.md` (the `Sky` snapshot and aspect maths this reuses
wholesale), `docs/MOBILE_AND_STEAM_PLAN.md` §5.3 (why the route shape is a query
param, not a path segment), `docs/ART_STYLE_PLAN.md` (§0 is amended by this plan —
see §10).

This introduces a **third scene** between the world map and the lobby: the **City
Scene**. It exists to do three jobs at once — give the button layout room to
breathe, push the mythological theme much harder, and make the planets that ring
the globe into something you can stand under and read.

---

## 0. What exists today — read this first

Four facts about the current code shape it, and one of them is a surprise.

**0.1 — There is already a "City Hub", and it is dead code.**
`src/app/page.tsx` has two render branches: the world map (`!selectedCity`) and a
City Hub (`selectedCity`) that renders `HomeOverlay` over a `TempleScene`.
`setSelectedCity` is only reached at the bottom of `handleCityClick`, after every
other city type has returned early — and `CITIES` currently contains exactly two
entries, Athens and New York, **both of which return early**. The Vault and Rules
cities are commented out. So the City Hub branch, `TempleScene`, and
`HomeOverlay`'s `city`/`onBackToMap` props are unreachable in production today.

This is good news: the seam this plan needs already exists and is already wired.
It is not, however, the right implementation to keep — see §3.

**0.2 — `page.tsx` is ~700 lines and carries two near-identical auth popups.**
The Athens bossfight popup and the ranked queue popup are the same three-step
name → email → code flow rendered twice, differing only in colour (`red-700` vs
`blue-700`) and copy. Roughly 200 lines are duplicated. Moving both entry points
into the city scene is the natural moment to extract them (§8.1).

**0.3 — The globe's two swords are the only navigation.**
`CityMarker` hardcodes `isBossfightCity = city.name === 'Athens'` and renders a
"Bossfight" pill; New York renders "Play Ranked" driven by `rankedInfo`.
`RankedZoomRig` in `WorldMap.tsx` zooms the camera onto a module-level
`NEW_YORK_DIR` while the queue searches.

**0.4 — The sky already has a single source of truth.**
`src/lib/astrology.ts` exposes `getSky()`, a session-cached `Sky` snapshot holding
every body's geocentric unit direction, plus `computeAspects(sky)` for conjunction
colour/strength and `separationDeg(sky, a, b)`. `docs/ASPECTS_PLAN.md` §0 records
that this single-source design was adopted *specifically* to stop the maths layer
and the render layer keeping separate copies of a position. **The city scene must
consume that same snapshot, not compute its own** — see §6.3.

---

## 1. Locked decisions

Settled in the design session that produced this document:

1. **One sword on the globe, labelled `GREECE`.** It replaces Athens' "Bossfight"
   pill. **The New York marker is removed** and ranked moves inside the city.
2. **Ranked and Bossfight live inside the city scene**, presented as **pointers on
   a signpost**, with **two buildings** flanking the scene that symbolise them:
   a **Senate** and a **Temple**.
3. **Create Lobby / Join Lobby / lobby-code input stay on the Earth (world map)
   screen.** They do *not* move into the city.
4. **Rules and the profile/user menu stay in the top bar on the city page too** —
   the same chrome the world map has, so the top bar is continuous across scenes.
5. **The city sky is the real sky over Greece.** Real day/night, real planet
   positions from the ephemeris, correct arcs across the night and across the year.
6. **Bodies are named by looking at them, not by a panel.** A label fades in only
   when a body drifts near the centre of the view, and fades out again as you pan
   away — **in both the city scene and the world map**, from one shared
   implementation. Nothing is displayed otherwise. This requires the city camera
   to be freely lookable while the signpost and buildings stay reliably
   clickable (§5.3, §7).

### 1.1 Terminology

**"Bossfight" and "The Well", never "raid".** "Raid" is legacy vocabulary that
meant *both* of them at different times, which is exactly why it had to go: the
backend already renamed `raid_wins` to `well_wins` (migration
`ea153b861903`), so in that sense "raid" meant the Well, while every surviving
frontend use meant the Hades bossfight. The drift was visible in the code — one
lobby string read `Boss-fight starts in {raidMins}m`, copy migrated, variable
name not.

Identifiers were already almost all `bossfight` (`getBossfightLobby`,
`useBossfightCountdown`, `onBossfight`); user-facing copy carried three
spellings ("Boss-fight", "boss fight", "BOSSFIGHT"). Both are now uniformly
**`bossfight`** / **Bossfight**. The one deliberate exception is `isBossFight`,
which mirrors the wire field `boss_fight` (`docs/PROTOCOL.md`) and should keep
tracking the protocol rather than this document.

### 1.1 One open assumption, flagged

Which building maps to which fight was given as "one building in the right and
left ... (senate and temple)". This plan assumes the **thematic** mapping, which is
the stronger reading:

- **Temple (left)** → **Bossfight**. Hades, relics, the sacred bossfight.
- **Senate (right)** → **Ranked**. A contest among peers, a ladder, civic rank.

Both are a one-line constant swap (`CITY_BUILDINGS` in §5.2) if you want them the
other way round. Nothing else depends on the choice.

---

## 2. The three-scene model

```
  WORLD (Earth)                CITY (Athens)                 LOBBY
  ─────────────                ─────────────                 ─────
  globe + planets              ground-level Greece           the table
  ⚔ GREECE sword        ──▶    real sky overhead      ──▶    PvP / bossfight / ranked
  Create Lobby                 ⚔ signpost: 2 pointers
  Join Lobby + code            Temple (L)  Senate (R)
  Rules · Profile              Rules · Profile
                               ← Back to Earth
```

The city is a **hub, not a menu**. The distinction matters for every design call
below: you should be able to arrive, look up, and want to stay a moment. That is
what earns the extra click on the way to a fight.

---

## 3. Routing — a real route, `/city?id=athens`

Do **not** keep this as `page.tsx` state (`selectedCity`). Promote it to
`src/app/city/page.tsx`.

**Why a route:**
- `page.tsx` is already overloaded (§0.2) and would grow a third scene.
- Deep-linkable and back-button-correct for free.
- Code-splits the city's 3D assets away from the globe's.
- Lets the globe's WebGL scene **unmount**. This matters more than it looks:
  `game/docker-compose.yml` already caps the frontend at `mem_limit: 4g` after
  Turbopack's dev cache plus WebGL memory pressure was observed starving the host
  and breaking headless Chromium's context creation. Two live 3D scenes stacked in
  one route is exactly the wrong direction.

**Why the query param and not `/city/[id]`:** `docs/MOBILE_AND_STEAM_PLAN.md` §5.3
already moved `/lobby/<id>` → `/lobby?id=<id>` because a dynamic path segment
cannot be statically exported for the native build (`BUILD_TARGET=native` →
`output: "export"`). A city path segment would hit the identical wall. Use
`/city?id=athens` and keep the native build working by construction.

**Cost, accepted:** returning to the world map re-runs `WorldMap`'s 9-phase
progressive load. Textures come from browser cache so the phases are fast, but the
staggered reveal replays. Mitigate by shortening the stagger when
`document.referrer`/a nav flag indicates a return trip, not a cold start. Do not
solve this by keeping the globe mounted.

---

## 4. World-map changes

### 4.1 `src/lib/cities.ts`
- Athens keeps `lat: 37.9838, lng: -25`. **Do not touch these.** They are the
  *mirrored* globe-texture coordinates (`system_lng = -1.3 - real_lng`), and the
  file's header comment is emphatic about why. §6.2 explains the trap this creates
  for the sky maths.
- Add a `realLat`/`realLng` pair to the `City` interface, carrying the genuine
  geographic position (Athens: `37.9838, 23.7275`). This is what the astronomy
  code consumes, and having both on one record with named fields is what stops the
  two ever being confused again.
- Add `actionLabel` (the marker's call-to-action pill) alongside the existing
  `name: 'Athens'` (the city identity). It starts as `'Bossfight'` — an exact
  match for today's hardcoded label — and becomes `'GREECE'` at step 6, when the
  click actually leads somewhere new. The label is the country; the scene is
  the city.
- **Remove the New York entry — at step 7, not here.** See §13's corrected note.

### 4.2 `src/components/worldmap/CityMarker.tsx`
- Delete `isBossfightCity = city.name === 'Athens'`. Render `city.actionLabel`
  from data instead of a name comparison. A city with no `actionLabel` (New York,
  whose pill is driven by live queue state) renders no static pill.
- Delete `RankedLabelInfo` and every ranked branch (`idle` / `searching` /
  `activeMatch`). Ranked no longer has a globe presence.
- The pill becomes a single, larger `GREECE` label. Keep the hover scale-up and the
  existing sword glow/ring/point-light treatment — that part is good and stays.

### 4.3 `src/components/worldmap/WorldMap.tsx`
- Delete `RankedZoomRig`, `NEW_YORK_DIR`, `RANKED_ZOOM_RADIUS`,
  `RANKED_ZOOM_SECONDS`, and the `rankedSearching` plumbing through `CameraRig`'s
  `paused` prop and `OrbitControls`' `enabled`/`autoRotate`.
- `WorldMapProps` loses `rankedInfo`.

  *Do not simply re-aim the zoom rig at Greece.* Its whole purpose was to make an
  in-place "Searching…" label readable on the globe; with queueing moved into the
  city, there is nothing left to zoom to.

### 4.4 `src/app/page.tsx`
- Delete the entire ranked block: `useRankedQueue`, `activeMatch`,
  `getActiveRankedLobby`, `searchingDots`, `doRanked`, `proceedRanked`,
  `rankedAuthFlow`, `handleRankedClick`, `rankedInfo`, and the ranked popup JSX.
- Delete the Athens bossfight block: `enterAthensRaid`, `proceedAthens`, `authFlow`,
  `athensSceneLoading`, and the bossfight popup JSX.
- Delete the City Hub branch, `TempleScene`, `CameraAnimator`, `PlayersAtTable`,
  `adjustSkyColor`, and the temple scene constants — all of it is either dead
  (§0.1) or superseded by the real city scene.
- `handleCityClick` collapses to: vault → `/vault`, rules → `/rules`, otherwise
  `router.push('/city?id=' + city.id)`.

  This is the single biggest simplification in the plan. `page.tsx` should end up
  well under 200 lines.

### 4.5 `WorldMapOverlay.tsx`
Unchanged. Create Lobby, Join Lobby, the code input, Rules and the user menu all
stay exactly where they are (locked decision 3).

---

## 5. The city scene

### 5.1 Layout

```
┌────────────────────────────────────────────────────────────┐
│ [Rules]                                        [Profile ▾] │   ← same chrome as world
│                                                            │
│        ·      ☿           ♀              ·                 │
│   ☾                ☉                ♃        ·             │   ← REAL sky (§6)
│ ·         ·                    ♄                           │
│ ──────────────────── horizon ──────────────────────────    │
│    ╔═══════╗              ⚔               ╔═══════╗        │
│    ║ TEMPLE║          ╱  ╲                ║ SENATE║        │
│    ║  ▲▲▲  ║      ◄──┤    ├──►            ║  ═══  ║        │
│    ║ │││││ ║    BOSSFIGHT  RANKED         ║ │││││ ║        │
│    ╚═══════╝         signpost             ╚═══════╝        │
│                                                            │
│                                          [← Back to Earth] │
└────────────────────────────────────────────────────────────┘
```

No persistent legend panel. Bodies are identified by **looking at them** — see §7.
Pan the camera up toward Jupiter and its name fades in; pan away and it fades out:

```
      ·        ♃                          ·        ♃
                                                ╭────────╮
   ☾        ☉         ·      ── pan ──▶      ☾  │JUPITER │  ·
                                                ╰────────╯
  · · · · · · + · · · · ·                 · · · · · +· · · · ·
        (view centre)                          (view centre)
```

### 5.2 The signpost and the buildings

The signpost is the **primary** interaction; the buildings are the thematic
anchor and a secondary, larger click target for the same action.

```ts
// src/lib/cityBuildings.ts
export const CITY_BUILDINGS = {
  bossfight: { side: 'left',  building: 'temple', label: 'BOSSFIGHT', model: '/models/temple.glb' },
  ranked:    { side: 'right', building: 'senate', label: 'RANKED',    model: '/models/senate.glb' },
} as const;
```

- **One arm per destination**, pointing at its building. Hovering an arm lights
  both the arm and the building it points to — that pairing is what teaches the
  mapping without a tutorial.
- Arms carry live state as text, replacing what the globe labels used to do:
  `RANKED` → `SEARCHING…` (animated dots) → `MATCH FOUND · 12s`, and
  `BOSSFIGHT` → `RAID IN 4:12` when a scheduled bossfight is pending.
- Clicking an arm or its building triggers the action. Both go through the same
  handler; the building is not a separate code path.
- `temple.glb` **already exists** and is listed in `ART_STYLE_PLAN.md` §5 as a
  keeper. **A Senate model does not exist and must be made** (§9).

### 5.3 Ground, camera, and the click-vs-look problem

Reuse `mountainv1.glb` for the backdrop as the dead `TempleScene` did. The camera
sits low and looks slightly **up** — the opposite of the globe's top-down orbit.
That inversion is the point: on the world map you look down at the Earth with the
planets around it; in the city you stand on that Earth and look up at the same
planets.

**[corrected]** The city camera is the **exact inverse of the world map's**, and
that inversion is the design, not a detail. On the globe you *orbit around* the
Earth looking inward, planets ringing it. In the city you are **pinned to one spot
on that Earth and turn on the spot**, looking outward: full 360° of horizon, all
the way up to the zenith. Same sky, other side of it.

- **Pinned.** The viewer does not travel. `enablePan` and `enableZoom` are both
  **off** — either would slide them off the spot they are standing on.
- **Azimuth: unclamped, a full 360°.** An earlier draft of this plan clamped it to
  ±70° around the signpost to stop players getting lost. That was wrong: being able
  to turn all the way round *is* the feature, and the sky is the reason to do it.
- **Polar:** from just shy of the zenith down to well past the horizon, so the
  ground is visible but the view cannot tip fully upside down.
- **No auto-rotate**, unlike the globe. Here the player drives, because §7's labels
  key off where they aim.
- **Default view holds the signpost and both buildings**, so the way on is the
  first thing you see and turning away is a choice.

**How to rotate in place with OrbitControls.** It always orbits a camera *around a
target*, so the camera sits essentially **on** its own target — a centimetre away.
This is the standard three.js panorama-viewer arrangement: orbiting at that radius
is indistinguishable from turning your head, and it inherits OrbitControls' damping
and touch handling instead of hand-rolling a look controller. `rotateSpeed` goes
**negative** so dragging feels like turning your head rather than spinning an object.

A recentre affordance (double-tap, or a compass) is still worth having now that a
player *can* turn their back on the buildings — but as a convenience, not a cage.

**The click-vs-drag conflict (called out explicitly, because it will bite).**
OrbitControls consumes pointer drags to rotate the camera; the signpost arms and
the buildings need pointer clicks to activate. R3F fires `onClick` on pointer-up
regardless of how far the pointer travelled in between, so a player who starts a
camera drag on top of the Temple and releases still on top of it will **fire the
bossfight**. Solve it once, in a shared helper, not per-object:

```ts
// src/lib/useClickNotDrag.ts
const DRAG_PX = 6;      // movement beyond this is a look, not a click
const HOLD_MS = 400;    // held longer than this is a look, not a click
```

Record `{x, y, t}` on `onPointerDown`; on `onPointerUp` fire the action only if
both thresholds hold. Apply it to every interactive object in the city scene.
Do the same for the `GREECE` sword on the world map, which has the identical
latent problem today against that scene's OrbitControls.

---

### 5.4 The loading curtain — **[added]**

Not in the original plan, and needed the moment the city became a real route.
There are two separate waits between tapping the sword and standing in Athens,
and neither showed anything at all:

1. **On the world map** — the route change plus the city chunk's download, all of
   which happens while the globe is still the page on screen. A tap on the sword
   looked like it had done nothing.
2. **On the city page** — `temple.glb`, the Senate, the mountain and the Milky Way
   texture loading behind a `Suspense fallback={null}`, i.e. an empty dark screen.

`CityLoadingScreen` renders in **both** places, which is what makes the two waits
read as one continuous transition rather than a stall, a flash and a pop. Its
progress bar is drei's `useProgress`, honest about what it knows: a real
percentage only while something is genuinely in three's loading manager, and an
indeterminate sweep otherwise (the world-map half, and any second visit where
every asset is already cached) rather than a fake 100%.

The curtain lifts on the scene's **own** signal, never a timer. `SceneReady` sits
*inside* the buildings' `<Suspense>`, so it cannot mount until they resolve, and
then waits two drawn frames before reporting — Suspense resolving means the models
are parsed, not that the canvas has painted them. A 20s fallback exists purely so
a stalled asset can never leave a working scene behind a permanent curtain.

The art is explicitly temporary, like §6.5's red band.

---

## 6. The real sky — the engineering core

### 6.1 No new library is needed

`astronomy-engine@2.1.19` is **already a dependency** and already used by
`lib/astrology.ts`. Verified present in the installed build, everything this
feature needs:

| Need | API |
|---|---|
| Observer at a real place | `new Astronomy.Observer(lat, lng, elevation)` |
| Equatorial → horizontal (alt/az) | `Astronomy.Horizon(time, observer, ra, dec, refraction)` |
| Same, as a rotation matrix | `Astronomy.Rotation_EQJ_HOR` + `RotateVector` |
| Sunrise / sunset | `Astronomy.SearchRiseSet` |
| Twilight bands | `Astronomy.SearchAltitude` (−6° / −12° / −18°) |
| Sidereal time | `Astronomy.SiderealTime` (already wrapped as `gmstHours`) |
| Moon phase | `Astronomy.Illumination` (already used) |
| Seasonal extremes | `Astronomy.Seasons` |

Do not add a second astronomy package. Introducing one would recreate exactly the
dual-source-of-truth flaw `ASPECTS_PLAN.md` §0 was written to eliminate.

### 6.2 ⚠ The coordinate trap — read before writing any of this

`cities.ts` stores **mirrored** longitude so markers land correctly on a globe
texture that is east/west flipped:

```
system_lng = -1.3 - real_lng      Athens: -1.3 - 23.7275 ≈ -25   ✓ matches cities.ts
```

**Feeding `city.lng` into an `Astronomy.Observer` will silently produce a sky for
the wrong hemisphere.** It will not throw. It will look plausible. Day/night will
be roughly 3 hours off and the arcs will be mirrored.

Mitigations, all three:
1. Add explicit `realLat`/`realLng` fields (§4.1) — never derive one from the other
   at a call site.
2. The topocentric module takes `{ realLat, realLng }`, never a whole `City`.
3. A unit test asserting Athens' sunset on a fixed date matches a known value
   (within a minute), which fails loudly if the mirrored value is ever wired in.

Latitude is unaffected — it is stored real in both cases.

### 6.3 Topocentric transform — reuse the snapshot, do not recompute

The elegant path, and the one that preserves the single-source invariant:

```ts
// src/lib/skyLocal.ts  (new, pure, unit-testable — same shape as astrology.ts)
import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import type { Sky, AspectBody } from '@/lib/astrology';

/** Rotate the SHARED geocentric snapshot into Athens' local horizon frame.
 *  One matrix for all bodies -- the snapshot stays the only source of position. */
export function localFrame(sky: Sky, realLat: number, realLng: number) {
  const observer = new Astronomy.Observer(realLat, realLng, 0);
  const time = new Astronomy.AstroTime(sky.date);
  const rot = Astronomy.Rotation_EQJ_HOR(time, observer);   // J2000 equatorial → horizontal
  return { observer, time, rot };
}

/** altitude in degrees (>0 = above the horizon), azimuth in degrees (N=0, E=90). */
export function horizonOf(sky: Sky, body: AspectBody, frame: ReturnType<typeof localFrame>) { /* … */ }
```

**[corrected]** `Sky.dir[body]` vectors are produced by `raDecToVec3` from
`Astronomy.Equator(..., ofdate=false, aberration=true)` — `ofdate` is **false**, so
they are in the **J2000 (EQJ)** frame, not equator-of-date. The matrix is therefore
`Rotation_EQJ_HOR`, which folds the precession from J2000 to the date in itself;
using the `_EQD_` matrix would have left every body ~0.36° out by 2026. A **single
matrix still rotates every body at once**, and the city and the globe can never
disagree about where a planet is, because they are literally the same vectors.

Note also that `raDecToVec3` lays vectors out Three.js-style (**Y-up**) while
astronomy-engine's equatorial vectors are **Z-up**, so they need unswizzling
(`three.x = astro.x`, `three.y = astro.z`, `three.z = -astro.y`) before its matrices
apply. Measured proof that both of the above are right: rotated-snapshot vs.
from-scratch topocentric agree to **0.002°** for the Sun and all five planets.

> **Parallax note [corrected — now measured].** The shared snapshot is geocentric
> (`Observer(0,0,0)`). Topocentric parallax is negligible for the planets (0.002°,
> i.e. lost in the noise) but measures **0.48°** for the Moon at the test instant —
> the plan originally estimated "~1°". Real enough to see against the horizon, so
> `skyLocal.ts`'s `horizonOf()` renders **the Moon topocentrically and everything
> else from the snapshot**, with `horizonFromSnapshot` / `horizonTopocentric`
> exposed separately. Safe for the aspect maths either way: 0.48° is far inside the
> Moon's 10° orb, so it cannot flip a conjunction verdict, and aspects read the
> snapshot directly rather than going through this module at all.

### 6.4 Day, night, and the twilight bands

Everything follows from the Sun's local altitude — one number:

| Sun altitude | State | Scene |
|---|---|---|
| > 0° | Day | Blue sky, sun visible, no stars, planets hidden |
| 0° → −6° | Civil twilight | Golden→rose gradient, brightest planets emerge |
| −6° → −12° | Nautical | Deep blue, most planets and bright stars |
| −12° → −18° | Astronomical | Near-night, full starfield fading in |
| < −18° | Night | Full dark, everything visible |

Drive the sky gradient, star opacity, ambient light intensity and the buildings'
rim lighting from a single continuous `nightness` scalar derived from that
altitude, rather than switching between discrete states — a smoothstep across the
bands avoids visible popping at the boundaries.

**"When there is night in Greece, there is night in the scene" is then not an
approximation — it is a direct function of the ephemeris.** Use `SearchRiseSet` to
show the actual sunset/sunrise clock times in the legend.

**[added] Light on the water, and where the key light comes from.** The sea was
copied from `SeaAndSky.tsx`, the lobby's, where a `directionalLight` parked at a
fixed `[100, 20, 100]` is harmless because there is no real sun to contradict. Here
it was actively wrong: a `meshStandardMaterial` at `metalness: 0.45` turned that
constant into a bright white column on the water, pointing nowhere in particular
and unrelated to the Sun that was setting 90° away. Reported from a phone, and
obvious once seen.

The sea now has its own material (`lib/seaGlitter.ts` + the `Sea` shader in
`CitySky.tsx`) with the reflection built from the bodies' real positions:

- **The mirror direction.** Each fragment reflects the view ray about the water's
  flat normal and measures the angle to the body. Across a plane that sweeps from
  the horizon down to the viewer's feet, that stretches a point-like body into a
  road along its own azimuth. The path is therefore aligned with the Sun by
  construction rather than by a constant somebody has to keep in sync.
- **Fresnel.** Water reflects ~2% straight down and nearly everything at grazing
  incidence, so the road is bright out by the horizon and fades as it approaches.
  A low Sun laying a long road and a high one making a small hot spot are then the
  *same* rule, not two cases — which is why `seaGlitter` deliberately has no
  falloff with altitude beyond a fade across the first 1.5°.
- **Two bodies.** The Moon gets its own path at roughly a third of the Sun's peak,
  further scaled by its illuminated fraction: a crescent lays down far less light
  than a full Moon.
- **Width is tied to the sprite.** The path's angular half-width is the body's
  drawn angular radius and the water's own slope RMS added in quadrature, so the
  `BODY_SIZE` entry that scales a body's sprite also widens its reflection. A body
  and its glitter cannot be resized independently and end up disagreeing.

The scene's key light now follows the Sun's real compass direction too, clamped at
the horizon so twilight lights the marble horizontally from the correct quarter
rather than from underneath it. With the water's road on the true azimuth, a scene
lit from some other direction reads as an error immediately.

**[added] Bodies are drawn at twice their first-pass size** — the Moon and all
five planets, not the Sun, which is already the brightest thing in frame. From the
ground under a 70° field of view a planet is much further from the eye than it is
on the globe, and at the original sizes the wanderers read as dust.

### 6.5 The arcs — across the night, and across the year

Both fall out of the same call, which is why this is far less work than it sounds.

**Diurnal arc (across the night).** Earth's rotation carries every body along an
arc: rise in the east, culminate on the meridian, set in the west. Sample
`Horizon()` at, say, 15-minute steps from −6h to +6h around the snapshot time and
you have a polyline you can draw as a faint trail through the city sky —
*"the path Mars takes tonight."* Culmination altitude is a function of the body's
declination and Athens' latitude, so the arcs sit high in summer and low in winter
for the Sun, and the planets shift with the ecliptic.

**Annual curve (across the year).** The same body sampled at the same clock time
across successive days traces the seasonal drift — the analemma for the Sun, the
zodiacal march for the planets. `Astronomy.Seasons` gives the solstice/equinox
anchors if you want to label the extremes.

**The ecliptic band.** Draw the ecliptic itself as a great arc across the city sky
and you have the zodiac band — every planet rides it, the Moon strays a little,
and the whole astrological frame of the game becomes visible in one line. This is
the highest theme-per-line-of-code item in the plan. `Rotation_ECL_HOR` gives it
directly.

Ship the arcs as a **toggle**, off by default. A sky full of trails is beautiful
once and noisy on the tenth visit.

**[corrected] The ecliptic band shipped early, in red, as a tuning instrument.**
It was scheduled last (step 14) as the most cuttable item, but it turns out to be
the fastest way to *check* the sky rather than merely decorate it: the Sun sits on
the ecliptic by definition and every planet within a few degrees of it, so a body
drawn far off the line means the placement maths is wrong, visible at a glance and
without reading a single number. That made it worth having while steps 10–11 were
being tuned by eye, not after. It is currently **on by default** and plainly
temporary -- `?ecliptic=0` hides it. Step 14 still owns turning it into the
finished zodiac band, off by default, with a treatment that matches the art.

`Rotation_ECL_HOR` did give it directly, as this section predicted: one matrix,
ecliptic straight to this horizon, no hand-rolled obliquity. `eclipticPolyline`
samples the full circle and lets the sea plane hide the half below the observer,
so the line meets the horizon exactly where the ecliptic really rises and sets.
The tests assert the property that matters -- the band passes through the Sun to
within the sampling resolution -- and, separately, that every planet lies inside
its **geocentric** latitude bound. Note that those bounds are *not* the planets'
orbital inclinations: Earth sits off to one side of the Sun, so a planet at
heliocentric latitude `i` and distance `r` appears at roughly `i · r/Δ`. Saturn
measures 2.65° against an inclination of 2.49°, and an earlier version of the
test failed for exactly that reason.

### 6.6 Time source and freshness

`getSky()` is a deliberately **session-length cached singleton** — frozen so the
sky does not visibly drift mid-session. That is right for the globe and wrong for
a scene whose whole premise is "it is night in Greece right now."

Resolution:
- Recompute the snapshot **on each city-scene mount** (cheap — it is a handful of
  ephemeris evaluations), and keep it frozen *within* a mount.
- Expose it as `getSky({ refresh: true })` or a sibling `freshSky()`, leaving the
  existing singleton semantics untouched for `WorldMap`.
- Do **not** tick the sky per-frame. Beyond wasted work, a drifting sky would
  desync the city from a globe rendered off the older snapshot.

Document the tradeoff in the module: a player who sits in the city across sunset
will not see it fall until they leave and return. That is acceptable; a live
sunset is a later, opt-in feature.

**[corrected] `?t=` alone is not a usable way to look at night.** The parameter
works exactly as specified, but in practice it was repeatedly reported as "the
sky is broken, it is still day" -- three times -- and every report was the URL,
not the sky. It lives on the *city* route, so the bare host is the world map and
has no `?t=` at all; and hand-typing `&t=02:00` on a phone, where the scene is
actually being reviewed, is miserable. Since Athens is in daylight for most of a
working day, the default view is correctly, stubbornly bright.

So the city overlay now carries **temporary time controls** -- `−1h`, `NOW`,
`+1h`, `☾ 02:00` -- which only rewrite the same `?t=` parameter. Nothing about
the sky's defaults changed: locked decision 5 stands, and with no parameter the
scene still shows the real sky over Greece right now. Stepping emits the full
`YYYY-MM-DDTHH:MM` form rather than bare `HH:MM`, so crossing midnight moves to
the next day instead of snapping back to this morning (`formatAthensParam`, the
inverse of `resolveCityTime`, round-trip tested).

---

## 7. Gaze labels — naming what you look at

**There is no always-on legend.** A body is named only when it drifts near the
**centre of the view**, in both the city scene *and* the world map. The sky stays
clean; identification is an act of attention. It also scales for free — adding an
eighth body needs no panel redesign.

### 7.1 The focus test

Per body, per frame, in one `useFrame`:

```ts
const toBody  = bodyWorldPos.clone().sub(camera.position).normalize();
const forward = camera.getWorldDirection(_scratchVec);   // reuse, never allocate per-frame
const angle   = forward.angleTo(toBody);                 // radians from view centre
```

Angle from the view axis, **not** distance from screen centre in pixels: it is
independent of viewport size, aspect ratio and the responsive FOV, so a phone and
a desktop agree on what counts as "looking at it". `angleTo` also returns > π/2 for
anything behind the camera, so the behind-check is free.

Fade with a smoothstep between two thresholds rather than a hard cut:

```
FOCUS_INNER = 4°    fully opaque
FOCUS_OUTER = 11°   fully transparent
opacity = 1 - smoothstep(INNER, OUTER, angle)
```

The gap between the two **is** the hysteresis — a body hovering exactly at one
threshold cannot strobe, because there is no single boundary to sit on. Tune both
against the globe's wide ambient shot first; the city's narrower FOV will want the
same angles, which is the advantage of working in angle space.

### 7.2 Occlusion — do not use drei's `occlude`

On the world map a planet can sit behind the Earth. The obvious fix is drei's
`<Html occlude>`, and **it must not be used**: `CityMarker.tsx` carries a comment
recording that `occlude="blending"` was tried there and *"broke the rest of the
page's rendering on real devices (confirmed on both Safari and Firefox on a
phone), not just caught by headless testing"* — it was reverted, accepting visible
far-side labels as the lesser evil.

Do it manually instead — a ray/sphere test against the globe is a handful of ops:

```ts
// occluded if the globe lies between camera and body
function occludedByGlobe(camera, bodyPos, globeCentre, globeRadius) { /* … */ }
```

In the city scene the equivalent test is simply `altitude > 0` — a body below the
horizon is behind the Earth by definition, and §6.3 already computes its altitude.

### 7.3 Build it on `FreshHtml`, and promote that file

`src/components/lobby/FreshHtml.tsx` is a trimmed, hardened fork of drei's
`<Html>` that already provides everything a gaze label needs: `screenPosition`
projection, `distanceScale`, z-index by depth, and an `isBehindCamera` helper that
is precisely the primitive in §7.1. Its docstring records **two** separately
confirmed production bugs in drei's version — a CSS scale that sticks when FOV
changes without screen position moving, and a one-frame unscaled "ballooning"
flash on remount — both of which a per-frame label on a responsive-FOV camera
would walk straight into.

Therefore:
- **Move `FreshHtml` out of `components/lobby/`** into a shared home
  (`src/components/hud/FreshHtml.tsx`), updating its lobby importers. It is
  already scene-agnostic; only its location says otherwise.
- Build `<GazeLabel>` on it.
- **Migrate `CityMarker`'s existing drei `<Html>`** to it in the same pass, which
  retires the last drei `<Html>` on the world map and the `occlude` comment with it.

### 7.4 One shared component, both scenes

```
src/components/sky/SkyLabels.tsx    // maps over bodies, owns the single useFrame
src/lib/gazeFocus.ts                // pure: focusOpacity(angle), thresholds  (unit-tested)
src/lib/skyLabelText.ts             // pure: what a label SAYS (§7.5)          (unit-tested)
```

**[corrected]** Two changes from the list as first written. `GazeLabel.tsx` was
never a separate file: the label component is ~40 lines and is only ever driven by
`SkyLabels`' own frame loop, so splitting it would have put a component and the
loop that writes to its DOM node in two files for no gain. It lives inside
`SkyLabels.tsx`.

And a fourth file appeared, `skyLabelText.ts`, which this section did not
anticipate. Step 9 put `GLYPH` and `labelDetail()` inside `WorldMap.tsx`; step 11
needed both, and copying them into the city would have left two hand-synced copies
of what a body says about itself — the exact failure §0.4 keeps one `Sky` snapshot
to avoid, one level up. They are now pure functions in `src/lib`, which also makes
the wording assertable (`skyLabelText.test.ts`) without a renderer, per the rule in
`vitest.config.ts`. `SkyLabels.tsx` itself was reused **unchanged**.

`SkyLabels` runs **one** `useFrame` over all seven bodies and writes opacity
imperatively, rather than seven components each with their own hook and their own
React state — the same imperative, allocation-free discipline `CityMarker`'s
`SwordPinFigure` and the `AuraLayers` aura code already follow. Pre-allocate every
scratch `Vector3` at module scope.

The world map and the city pass the same `Sky` snapshot and their own body
positions; everything else is shared. **Implement once.**

### 7.5 What a label says

Short by default — the glyph and the name (`♃ JUPITER`). Then, only at full focus
(inside `FOCUS_INNER`), a second line fades in with the detail:

- altitude + compass direction (city), or constellation (world map)
- `RETROGRADE` when `sky.mercuryRetrograde` applies
- an active conjunction from `computeAspects` / `separationDeg` —
  `☌ ♄ 1.3°` — **zero new maths**, §0.4's snapshot already has it
- moon phase % for the Moon, from `sky.moonPhaseFraction`

Colour the label with the body's `BodyAspect.color` so label, glow shell and aura
all agree by construction.

**[corrected]** The world map shows **no** position line. "Constellation" was
listed as its counterpart to the city's altitude+compass, but `StarEntry`
(`starCatalog.ts`) carries only name, RA/Dec and magnitude — naming the
constellation a body sits in needs IAU boundary polygons the catalogue does not
have and this feature does not justify importing. So `labelDetail()` takes the
horizon position as an *optional* argument: the city passes it and opens with
`24° ESE`, the world map omits it and opens with whatever else is true. The
remaining three notes are common to both scenes, which is the part that mattered.

The Moon's illuminated fraction (`97% LIT`) was specified here but not built in
step 9; sharing the text through `skyLabelText.ts` in step 11 gave it to **both**
scenes at once, which is what this section always asked for.

### 7.6 On the world map, the sky names itself

The globe scene keeps `autoRotate` and `CameraRig`'s slow drift. Combined with
gaze labels that means bodies **drift through focus on their own** — the sky
slowly parades past and introduces itself with no input at all. That is a genuinely
lovely default state for an idle home screen, and it costs nothing extra. Make sure
the fade timing looks right at the ambient drift rate, not just under manual panning.

---

## 8. Refactors this unlocks

### 8.1 Extract `<AuthGatePopup>` — do this first
The Athens and ranked popups in `page.tsx` are ~200 duplicated lines of the same
name → email → code flow over one `useAuthFlow`. Both are moving into the city
scene; extracting them into one component parameterised by `{ title, blurb,
accentColor, submitLabel }` removes the duplication instead of relocating it.
`HomeOverlay` carries a **third** partial copy of the same modal, which should
also collapse into it.

Land this as its own commit **before** the move, so the diff that moves the entry
points is small enough to review.

### 8.2 `HomeOverlay`'s dead city props
`city` / `onBackToMap` and the city-name banner become genuinely unused once §4.4
lands. Delete them rather than leaving a second, half-built city concept next to
the real one.

### 8.3 `deviceQuality`
`isLowQuality()` already gates sword LOD. The city scene should use it for the
starfield density, arc-trail sampling rate, and whether the buildings load HD or
LD models.

---

## 9. Art required

| Asset | Status | Note |
|---|---|---|
| Temple building | **exists** — `public/models/temple.glb` | `ART_STYLE_PLAN.md` §5 lists it as a keeper |
| Senate building | **placeholder built** | `components/city/Senate.tsx` — procedural stepped base, colonnade, entablature and pediment. Deliberately plain so it reads as provisional. Still wants a real GLB; the interaction wrapper does not care what is inside |
| Signpost + arms | **placeholder built** | `components/city/Signpost.tsx` — post, arms and pointed tips from primitives. Same reasoning as the Senate: a stock model would quietly become permanent |
| Sky gradient | procedural | Drive from `nightness` (§6.4); no asset needed |
| Body glyphs (☉☾♀♂♃♄☿) | text | Unicode is fine to start; hand-drawn later per `ART_STYLE_PLAN.md` |
| Gaze label styling | CSS | No frame art needed — a label over the sky should be light; `RopedFrame` would be too heavy here |

`ART_STYLE_PLAN.md` §0 currently reads *"Homepage stays as-is — the temple/mountain/
worldmap home scene and its overlay are not part of this pass."* **This plan
supersedes that line** and it should be amended in the same PR, with a pointer
here, so the two documents do not contradict each other.

---

## 10. What does *not* change

- **The backend.** No new endpoint, no changed payload. Bossfight still goes
  through `getBossfightLobby`, ranked through `useRankedQueue` →
  `/ranked/queue/join`. These are pure client-side navigation changes.
- **`PROTOCOL_VERSION`.** No wire shape moves, so neither `wom-fe`'s nor
  `wom-be`'s constant is bumped, and `docs/PROTOCOL.md` is untouched.
- **`wom-e2e`, almost entirely.** The bossfight and ranked scenarios drive REST
  directly (`lib/rest.ts`'s `getBossfightLobbyRest`, `POST /get_bossfight_lobby`),
  not the home-page UI. `lib/funnel.ts` does click through `/` — but only
  **Join Lobby**, which stays on the world map by locked decision 3. Expected e2e
  impact: **none**, with `scenarios/smoke/health.spec.ts` worth a re-check since it
  loads `/`.

This is a rare frontend-only feature of real ambition. It needs no cross-repo
coordination and no deploy ordering.

---

## 11. Risks

1. **The mirrored-longitude trap (§6.2).** Highest-likelihood real bug in the
   whole plan, and it fails silently — the mirrored value puts Athens' sunset
   **3.25 hours** out without throwing. **Defended:** `skyLocal.test.ts` pins the
   real sunset and asserts the divergence, and the guard was verified to actually
   bite by temporarily wiring `-25` into `ATHENS` (4 tests fail).
2. **A second WebGL scene's memory.** Mitigated by the route split (§3) letting the
   globe unmount. Verify against the 4GB container cap with a long session that
   bounces between scenes; the previous 3.8GB observation is the precedent.
3. **A daytime sky is an anticlimax.** For roughly half of all visits there are no
   planets to look at. Lean into it — a bright marble-and-blue Greek noon should
   look *deliberate*, with the legend still listing what is up there unseen and
   giving a countdown to sunset.
4. **Losing the ranked entry point.** Ranked goes from one globe click to two.
   Mitigate with a "return to match" affordance that survives on the world map when
   `getActiveRankedLobby` reports an active match — a player mid-match must never
   have to hunt through a city to get back to it.
5. **Gaze labels are undiscoverable.** Their whole virtue — nothing on screen —
   is also the risk: a player may never learn that aiming at a light names it.
   Mitigate with a one-time hint on first city visit (`useGuideEnabled` and
   `guideHighlights.ts` already exist for exactly this kind of nudge), and by
   §7.6's ambient drift naming bodies unprompted on the world map before the
   player ever reaches the city.
6. **Click-vs-drag (§5.3).** A camera that must be dragged and objects that must
   be clicked, in the same scene, is a classic source of misfires — and a misfire
   here enters a bossfight. The shared threshold helper is not optional polish.
7. **Scope.** §6.5's arcs and ecliptic band are the most beautiful part and the
   most cuttable. They are deliberately last in the commit sequence.

---

## 12. Acceptance criteria

1. The globe shows exactly one sword, labelled `GREECE`; no New York marker.
2. Clicking it routes to `/city?id=athens`; browser back returns to the globe.
3. Create Lobby, Join Lobby and the code input remain on the world map and work
   unchanged. They are absent from the city.
4. Rules and the profile menu appear in the top bar of **both** scenes.
5. The city signpost has two working arms; Temple and Senate are clickable and
   trigger the same actions. Hovering an arm highlights its building.
6. Ranked queue state (searching / match found / countdown) is legible on the
   signpost arm, and joining a match still routes to `/lobby?id=…`.
7. **The sky matches reality:** at a fixed test date/time, every body's altitude
   and azimuth agree with a from-scratch topocentric computation to within 0.01°
   (the Moon excepted — it goes through the topocentric path precisely because the
   snapshot's 0.48° geocentric parallax is visible), and Athens' sunset matches the
   real one to within a minute. **Met** — `src/lib/__tests__/skyLocal.test.ts`.
8. **No label is visible when nothing is near the view centre**, in either scene.
   Panning a body toward the centre fades its name in and away fades it out, with
   no strobing at the threshold. A body behind the globe, or below the city's
   horizon, shows no label.
9. Dragging the camera across the signpost or a building does **not** trigger it;
   a clean tap does. Same for the `GREECE` sword on the world map.
9a. The city camera is **pinned and turns 360°** — the viewer never translates,
    can face any direction, and can look from the ground up to the zenith. The
    default orientation holds the signpost and both buildings.
10. Gaze labels work in both scenes from **one** shared implementation
    (`components/sky/`), and `FreshHtml` lives in a shared location with no
    remaining drei `<Html>` on the world map. **Met** — `SkyLabels.tsx` is
    consumed unchanged by `WorldMap.tsx` and `CityScene.tsx`, and what a label
    says is shared too (`lib/skyLabelText.ts`, §7.4 [corrected]).
11. The city and the globe never disagree about a body's position or its
    conjunction colour — both read one `Sky` snapshot.
12. Athens' *real* longitude (23.7275°E) reaches the `Observer`; the mirrored −25
    never does. Covered by a test that fails if swapped.
13. `page.tsx` is under 200 lines and contains no auth-popup JSX.
14. `npm run test` and `npm run lint` pass; `BUILD_TARGET=native npm run build`
    still exports (proving the route shape, §3).

---

## 13. Suggested commit sequence

Each step is independently reviewable and leaves the app working.

1. **Extract `<AuthGatePopup>`** from the two `page.tsx` popups and `HomeOverlay`'s
   third copy. Pure refactor, no behaviour change. (§8.1)
2. **`skyLocal.ts` + tests.** Topocentric maths only, nothing rendered: horizon
   coords, `nightness`, sunset/sunrise, the fixed-date Athens guard test. (§6.2–6.4)
3. **`cities.ts`:** add `realLat`/`realLng`/`actionLabel`. **[corrected]** The
   original step 3 also removed New York — but ranked does not reach its new home
   until step 7, so that would have left the ranked queue unreachable for four
   steps and broken this list's own promise that every step leaves the app
   working. **The New York removal moved to step 7.** Step 3 is now purely
   additive plus making `CityMarker` data-driven.
4. **Promote `FreshHtml`** to `components/hud/`, update lobby importers, and
   migrate `CityMarker` off drei's `<Html>`. Pure refactor, no behaviour change.
   (§7.3)
5. **City route skeleton** at `/city?id=athens` — ground, constrained camera,
   `useClickNotDrag`, back button, top bar. No sky, no signpost yet. (§5.3)
6. **Move Bossfight into the city** behind the signpost's left arm + Temple. World
   map's Athens sword now reads `GREECE` and routes to the city.
7. **Move Ranked into the city** behind the right arm + Senate placeholder. **Only
   now remove the New York marker** (moved here from step 3), together with
   `RankedZoomRig`, `NEW_YORK_DIR` and the ranked plumbing in `WorldMap`. Ranked
   never stops being reachable: it has its new home before it loses the old one.
   (§4.3)
8. **`gazeFocus.ts` + tests** — pure focus-angle/opacity maths, nothing rendered.
   (§7.1)
9. **Gaze labels on the world map first.** That scene already has bodies placed
   and an ambient drift to test against (§7.6), so the mechanic can be tuned
   before the city exists to consume it.
10. **Real sky rendering in the city** — bodies placed from `skyLocal`, day/night
    gradient, star opacity driven by `nightness`. (§6.4)
11. **Gaze labels in the city**, reusing step 8–9's component unchanged. Horizon
    occlusion via `altitude > 0`. (§7.2, §7.4) **[corrected]** The occlusion test
    is `visibility > 0` off `useCitySky`'s placements, which is `altitude > 0`
    *and* "not a planet lost in daylight". Both conditions already decide whether
    the sprite is drawn, so reading the same scalar is what guarantees a label can
    never name something that is not on screen — a separate `altitude > 0` here
    would have named planets that daylight had removed. `useCitySky` now also
    returns the `Sky` snapshot and the `LocalFrame` it had already computed, so
    the labels, the sprites and the starfield are provably one instant.
12. **Delete dead code:** `TempleScene`, `CameraAnimator`, `HomeOverlay`'s city
    props, `RankedLabelInfo`. (§8.2)
13. **Senate model** replaces the placeholder. (§9)
14. **Arcs + ecliptic band**, toggle off by default. (§6.5)
15. **First-visit hint** for the gaze mechanic via `guideHighlights`. (§11.5)
16. **Amend `ART_STYLE_PLAN.md` §0**; add a `CHANGELOG.md` entry.
