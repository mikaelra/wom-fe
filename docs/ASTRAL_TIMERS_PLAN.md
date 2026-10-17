# Astral Timers Plan

Binding the game's two recurring resets to real astronomical events, and drawing
the gate each reset is waiting on into the sky.

- **Wheel drop cap** (4 match-drop Wheels per period) resets at **every new and
  full moon**.
- **Ranked season** resets at **every solstice and equinox**.
- Both get a **line in the sky** marking the position the Moon / the Sun must
  cross before the timer fires.
- Seasons are named **Spring / Summer / Autumn / Winter `<year>`**, and a new
  **Hall of Records** on the stats page archives the ranks a player held in each.
- The ranked ladder is **renamed** (Peasant → Scrub → Initiated → Adept → Master →
  Magi → Ordeus) and gains **rank floors** at Initiated, Master and Ordeus.

Cross-repo: backend work in `wom-be`, rendering in `wom-fe`. Written here
alongside `RANK_SYSTEM_PLAN.md` and `CITY_SCENE_PLAN.md` because it touches both
and leans hard on the sky code that already exists in this repo.

---

## 1. The one idea

Both timers are the same primitive:

> **A body must reach a marked ecliptic longitude.**

| Timer | Body | Gate longitude | Period |
|---|---|---|---|
| Wheel cap | Moon | the Sun's longitude (new) and its antipode (full) | ~14.76 days |
| Ranked season | Sun | 0° / 90° / 180° / 270° | ~91.3 days (89.0–93.7) |

That is not a metaphor, it is literally the definition of both events: a new moon
*is* the Moon reaching the Sun's ecliptic longitude; the vernal equinox *is* the
Sun reaching longitude 0°. So one module computes gates, one visual vocabulary
draws them, and the two features are one feature with two configurations.

The difference worth noticing early: **the solar gates are fixed and the lunar
gate drifts.** The Sun's four gates sit at the same four points on the ecliptic
forever. The Moon's gate slides ~0.99°/day because it is defined relative to the
Sun — the Moon closes on it at ~12.2°/day rather than its own 13.2°. This is a
gift for the visualization: the lunar gate line visibly creeps, and the Moon
visibly chases it.

---

## 2. What already exists (and why this is cheap)

This repo already has a real ephemeris layer, which is most of the hard part:

| Piece | Where | Gives us |
|---|---|---|
| `Sky` snapshot — every body's unit direction at one instant, single source of truth | `src/lib/astrology.ts` (`computeSky`, `getSky`) | Sun/Moon positions the renderer already agrees with |
| Topocentric horizon frame | `src/lib/skyLocal.ts` (`localFrame`, `horizonOf`) | Where a body sits over a given city |
| **Ecliptic → horizon, and a sampled ecliptic polyline** | `src/lib/skyLocal.ts` (`eclipticToHorizon`, `horizonOfEclipticLon`), `src/lib/citySkyGeometry.ts` (`eclipticPolyline`) | **The gate line is a one-longitude special case of code that already ships** |
| Gaze labels | `src/components/sky/SkyLabels.tsx` | Naming the gate without adding a legend |
| Globe scene | `src/components/worldmap/WorldMap.tsx` (Sun/Moon meshes, `MoonLight`, `SunLight`) | The world-map home for both gates |
| City scene | `src/components/city/CitySky.tsx` | The horizon-level home for whichever gate is up |
| `astronomy-engine` | already a dependency | `SearchMoonPhase`, `MoonPhase`, `Seasons`, `SearchSunLongitude` — all present, all verified working |

`docs/CITY_SCENE_PLAN.md` §6.5 already draws the ecliptic band; `horizonOfEclipticLon`
already turns a single ecliptic longitude into a horizon position. **The gate line
needs no new maths, only a new reason to draw one meridian instead of the whole
circle.**

Current state of the two timers:

- `wom-be/engine/combat.py:45-59` — `WHEEL_DROP_CAP = 4`, `WHEEL_DROP_PERIOD_DAYS = 14`,
  a global clock anchored to `2001-01-01` so every player resets on the same
  alternating Monday 00:00 UTC. `_current_wheel_drop_period_start()` is the single
  function that decides the window; `_deliver_wheel` calls
  `count_recent_match_drops(player_id, period_start)`.
- `wom-be/config.py:279-282` — `RANKED_SEASON_LENGTH_DAYS = 60`, explicitly labelled
  *"Placeholder pending product input — real quarterly/solstice-aligned season
  scheduling is Phase 4 work"*. `engine/ranked_result.py:68` `get_or_create_active_season()`
  bootstraps a fixed-length season off it.
- `RANK_SYSTEM_PLAN.md` §9 already **specifies** solstice/equinox seasons. This plan
  is the implementation of that bullet, not a change of direction.

So the wheel side is a one-function swap, and the ranked side is a scheduled item
finally getting built.

---

## 3. Authority: who computes the gate

Two repos, two languages, one ephemeris — this is the only genuinely tricky
decision here, and getting it wrong reintroduces exactly the class of bug
`ASPECTS_PLAN.md` §0 exists to prevent (two copies of one computation drifting).

**Decision:**

- **The backend is the authority on *when*.** It owns a committed table of gate
  instants and exposes them. Nothing about a player's Wheel cap or season depends
  on a client's clock or a client's ephemeris.
- **The frontend is the authority on *where*.** It draws the gate line from its
  own `Sky` snapshot — the same vectors that place every other body — so the line
  cannot disagree with the sky around it.
- **They are tied together by the instant, not by the answer.** The backend sends
  `next_gate_at` (ISO 8601); the frontend computes the gate's ecliptic longitude
  *at that instant*. One number crosses the wire, and both sides derive from it.
  There is no second ephemeris answer to keep in sync — only a timestamp.

**How the backend gets the instants.** Do *not* add a Python ephemeris
(`skyfield` pulls a large binary kernel; `ephem` is a second implementation to
disagree with). Instead:

- A generator script in this repo, `scripts/gen-astral-gates.mjs`, runs
  `astronomy-engine` over a long horizon and emits a JSON table:

  ```json
  {
    "generated_from": "astronomy-engine@<version>",
    "lunar":  ["2026-09-11T03:27:28Z", "2026-09-26T16:49:32Z", ...],
    "solar":  [
      {"at": "2026-09-23T00:05:38Z", "lon": 180, "gate": "autumn_equinox",  "opens": "Autumn 2026"},
      {"at": "2026-12-21T20:50:22Z", "lon": 270, "gate": "winter_solstice", "opens": "Winter 2026"},
      {"at": "2027-03-20T20:24:43Z", "lon":   0, "gate": "spring_equinox",  "opens": "Spring 2027"},
      ...
    ]
  }
  ```

- The table is committed into `wom-be` as `domain/astral_gates.json` and read at
  import time. Generate **through 2040** — it is a few hundred KB, it removes a
  runtime dependency entirely, and a table that outlives the game is cheaper than
  a fallback path nobody tests.
- Backend lookup is a binary search over a sorted array. That is the whole
  runtime cost.
- A backend test asserts the table is monotonic, gap-bounded (lunar 13.5–16.0
  days, solar 88–94 days), covers `now + 5 years`, and that every solar entry's
  name is unique (`seasons.name` has a `UNIQUE` constraint — see §5).

Verified against the installed `astronomy-engine`:

```
next new moon   2026-09-11T03:27:28Z
next full moon  2026-09-26T16:49:32Z
2026 solar gates  Mar 20 14:45Z · Jun 21 08:25Z · Sep 23 00:05Z · Dec 21 20:50Z
half-lunation gap  min 13.94 d · max 15.58 d · avg 14.76 d
```

---

## 4. Feature 1 — Wheel cap on the lunar gate

### Backend (`wom-be`)

`engine/combat.py`: replace `_current_wheel_drop_period_start()`'s arithmetic with
a lookup — *the signature and every call site stay identical*, which is the point.

```python
def _current_wheel_drop_period_start(now: datetime | None = None) -> datetime:
    """The most recent new or full moon at or before `now`."""
    return astral_gates.latest_lunar_at_or_before(now or datetime.now(timezone.utc))
```

`WHEEL_DROP_PERIOD_DAYS` and `_WHEEL_DROP_CAP_ANCHOR` are deleted. `WHEEL_DROP_CAP = 4`
and `WHEEL_DROP_CHANCE = 0.25` are untouched. Update the docstrings in
`_roll_wheel_drop` and the module header that currently promise "alternating
Mondays at 00:00 UTC" — they are the only prose that goes stale.

**Balance consequence, stated plainly:** the period goes from a flat 14 days to
13.94–15.58 days, averaging **14.76** — a **+5.4%** longer window on average, so
the effective Wheel faucet slows by ~5%. That is inside noise for a 25%-chance
cosmetic drop and needs no compensating tuning. The variance is new, though: the
cap window is no longer a constant, so any copy that says "every two weeks"
becomes "every new and full moon."

**Cutover safety.** `count_recent_match_drops` counts drops since `period_start`.
If the first lunar `period_start` lands *earlier* than the Monday boundary in
force at deploy, players who already claimed 4 this fortnight would be counted
against a window that reaches back before their reset — silently over cap through
no fault of their own. Guard it:

```python
_LUNAR_CUTOVER = datetime(2026, 10, 1, tzinfo=timezone.utc)  # set at deploy; delete after one lunation
period_start = max(astral_gates.latest_lunar_at_or_before(now), _LUNAR_CUTOVER)
```

One constant, one comment saying it is removable after the first gate passes.

### API

`GET /inventory` (`routes/wheel.py`) currently returns
`{equipped_skin, equipped_cosmetic, skins, wheels, artifact}`. Add:

```json
"wheel_cap": {
  "cap": 4,
  "used": 2,
  "period_start": "2026-09-11T03:27:28Z",
  "next_gate_at": "2026-09-26T16:49:32Z",
  "next_gate_kind": "full_moon"
}
```

It is the same session-authenticated call the inventory screen already makes, and
`count_recent_match_drops` is already computed on the drop path — no new query
shape, no new endpoint.

### Frontend

- **World map (globe).** A thin meridian arc on the celestial sphere at the gate
  longitude, drawn with the same `raDecToVec3` path the bodies use. The Moon
  visibly closes on it. Colour it off the Moon's existing `BodyAspect.color` so it
  belongs to the Moon rather than reading as UI chrome.
- **City scene (horizon).** Same line through `horizonOfEclipticLon` — one
  longitude instead of `eclipticPolyline`'s 360 samples, clipped by the sea plane
  exactly as the ecliptic band already is. **Note the asymmetry:** the *full*-moon
  gate sits at the antisolar point, so it is high in the night sky and looks
  great; the *new*-moon gate sits **on the Sun**, so at night it is below the
  horizon and invisible. That is correct, not a bug — the globe carries the
  new-moon gate, the city carries the full-moon one. Do not fake a visible line
  for the new-moon half.
- **Readout.** Gaze label on the gate line via `SkyLabels.tsx` — `NEW MOON` /
  `FULL MOON` with the countdown as the second (full-focus) line, matching the
  existing label contract. Plus a small "Wheels this moon: 2/4" line wherever
  inventory is shown.
- **Progress is an arc, not a clock.** `1 − (elongation to gate) / 180` gives a
  progress fraction straight off the same numbers driving the line. Use it for
  any bar; it stays honest when the period length varies.

---

## 5. Feature 2 — Ranked season on the solar gate

### Backend (`wom-be`)

`engine/ranked_result.py:68` `get_or_create_active_season()` currently invents a
60-day season. Replace with a table lookup:

```python
def get_or_create_active_season() -> dict:
    now = datetime.now(timezone.utc)
    active = _season_repo.get_active_season(now)
    if active:
        return active
    with _season_bootstrap_lock:
        active = _season_repo.get_active_season(now)
        if active:
            return active
        gate = astral_gates.current_solar_window(now)   # -> {name, starts_at, ends_at}
        season_id = _season_repo.create_season(
            gate["name"], gate["starts_at"], gate["ends_at"], reward_config=None,
        )
        return {"id": season_id, "name": gate["name"]}
```

`RANKED_SEASON_LENGTH_DAYS` is deleted from `config.py` along with its placeholder
comment. `seasons.starts_at`/`ends_at` already exist and `get_active_season` already
does the `starts_at <= now < ends_at` window query — **the schema needs no
migration**, only different values going in.

**Season names (decided).** A season is named for the **season it opens**, not
the gate that ends it:

| Season | Runs from | To | Example |
|---|---|---|---|
| `Spring <year>` | spring equinox | summer solstice | Spring 2027 |
| `Summer <year>` | summer solstice | autumn equinox | Summer 2027 |
| `Autumn <year>` | autumn equinox | winter solstice | Autumn 2027 |
| `Winter <year>` | winter solstice | spring equinox | Winter 2027 |

**The year is the year the season starts.** That matters for exactly one case:
**Winter straddles the year boundary** — `Winter 2026` runs 21 Dec 2026 →
20 Mar 2027. Taking the start year keeps names unique, monotonic, and derivable
from the opening gate alone, which is what the generator has in hand. The
consequence to design around: *`Winter 2026` is immediately followed by
`Spring 2027`*, so **anything listing seasons must sort by `starts_at`, never by
name** — a string sort would file `Winter 2026` before `Spring 2027` correctly by
luck and `Winter 2026` before `Summer 2026` incorrectly. Say it once, here, and
enforce it in the Hall of Records query (§6).

`seasons.name` is `UNIQUE` and this scheme satisfies it by construction: one
(season word, year) pair can only ever be produced by one gate. The generator
emits the name alongside the instant so backend, API and UI copy cannot disagree.

**Balance consequence:** seasons go from 60 days to **~89.0–93.7 days**, averaging 91.3 (+52%). That
is a real product change, not a rounding difference — but it is exactly what
`RANK_SYSTEM_PLAN.md` §9 already asked for ("roughly 3 months"), and §9's hard
reset was designed around that length. Worth re-checking the §9 reward tiers
against a 52%-longer grind before the first real season ships.

**Season rollover is a job, not a lazy bootstrap.** `get_or_create_active_season`
only creates a season when a ranked match happens to be resolved with none active
— fine for bootstrap, wrong for a hard reset that must archive every player's
rank. The rollover job (`RANK_SYSTEM_PLAN.md` §9: archive to `season_rank_history`,
reset every `(μ, σ)`, deliver rewards) is Phase 4 work already on the roadmap; this
plan only fixes *when* it is triggered — at the solar gate instant. Note the gates
are UTC instants at arbitrary times of day (Dec 21 **20:50** UTC), not midnight.
If the job runs on a cron, it must fire on the *next tick after* the gate and use
the gate instant — not the tick time — as the season boundary.

### API

Extend `GET /ranked/profile/<name>` (`routes/ranked.py:48`) with the active season:

```json
"season": {
  "name": "Autumn 2026",
  "starts_at": "2026-09-23T00:05:38Z",
  "ends_at": "2026-12-21T20:50:22Z",
  "gate": "winter_solstice"
}
```

### Frontend

- **The Sun's gate line** on the globe, drawn identically to the Moon's but at a
  fixed cardinal longitude and coloured off the Sun. Because it does not drift, it
  reads as architecture — a standing pillar the Sun grinds toward — where the
  Moon's reads as a chase. Lean into that difference rather than styling them the
  same.
- **A four-gate ring.** All four cardinal points marked on the ecliptic, with the
  next one lit and the other three faint, makes the year legible at a glance and
  costs three more line draws. Strongly recommended: it turns "when does the
  season end" into a thing you can *see* instead of a countdown you read.
- **Season header** on the leaderboard and rank badge (`src/components/hud/RankBadge.tsx`):
  the season name plus days remaining, from the backend payload.

---

## 6. Hall of Records (stats page)

The archive of every rank a player has held, season by season. It lives on the
existing stats page (`wom-fe/src/app/stats/page.tsx`, which already renders
**Ranked / Overview / Well** cards) as a fourth card.

This belongs in *this* plan rather than `RANK_SYSTEM_PLAN.md` because the seasons
are its index: the Hall's rows are named by §5's scheme and created by a job that
fires at a solar gate. **The Hall is the ledger of the sky** — what the gate line
on the globe is counting down to is the next row in it. Worth making that legible
in the UI rather than leaving it as an implementation coincidence.

### It needs no migration — the schema is already waiting for it

Both tables exist and one is already accumulating rows in production:

| Table | Holds | Written by | Status |
|---|---|---|---|
| `season_rank_history` | `season_id`, `name`, `final_tier`, `peak_tier_this_season`; UNIQUE `(season_id, name)` | the season-end rollover job | **table exists, job does not** |
| `rank_discoveries` | `name`, `season_id`, `tier`, `discovered_at`, `game_id`; UNIQUE `(name, season_id, tier)` | `engine/ranked_result.py` on every visible rank | **already being written today** |

`rank_discoveries`' own docstring in `models.py` says it exists "to feed a future
stats page listing a player's full rank history for a season, not just where they
ended up." That is this feature, and the rows have been piling up for it.

**This matters for what the Hall can show.** `season_rank_history` alone gives two
tiers per season (final, peak). `rank_discoveries` gives the **whole set of tiers
the player ever visibly held that season** — which is what "the ranks the player
has had every season" actually means. Because those rows are insert-only and
season-scoped, they survive the hard reset intact, so the full trail stays
reconstructible for every past season forever.

**One honest limitation to note now.** `rank_discoveries` records each tier the
*first* time it is ever shown, so it is a **set of halls entered**, not a
timeline. A player who fell from Adept II to Scrub I and climbed back has one
`Scrub I` row, not two, and nothing marks the dip. That is the better record for a
"Hall of Records" — it reads as achievements, not as a stock chart — and it is
free. A true rank-over-time graph is reconstructible from `ranked_match_results`
(it stores per-match `mu`/`sigma` and `season_id`), but that is a heavier query
and a different feature; do not conflate them.

**Do not add division columns.** `RANK_SYSTEM_PLAN.md` §7 mentions
`final_division`/`peak_division`, but the shipped schema deliberately has none —
`models.py` states tiers hold the combined string (`"Djinn II"`) and "there is no
separate division column anywhere in this schema." Keep it that way.

### The sequencing trap, and how to dodge it

`season_rank_history` gets its **first row at the first rollover** — which, on a
solar calendar, could be up to three months after the Hall ships. Build the card
naively and it is an empty box for a quarter with no way to tell "no seasons yet"
from "broken".

So: **the Hall renders the current, in-progress season from live data**, above the
archived ones and marked as running —

- final tier → `effective_tier(...)` (what `/ranked/profile` already returns),
- peak → `players.peak_tier_this_season`,
- trail → this season's `rank_discoveries` rows,
- footer → the season's own countdown, the same `ends_at` the Sun's gate line is
  drawing.

That makes the card useful on day one, gives the season-end gate something
tangible to be counting down *to*, and means the rollover job's only visible
effect is a row freezing and a new one opening beneath it — which is exactly what
a hall of records should look like.

### API

One new endpoint, `GET /ranked/history/<name>` in `routes/ranked.py`. Public and
read-only, matching the trust level `ranked_profile` and `player_profile` already
set (no auth, no raw `mu`/`sigma` — §5's hidden-rating rule holds here too).

```json
{
  "seasons": [
    {
      "name": "Winter 2026",
      "starts_at": "2026-12-21T20:50:22Z",
      "ends_at":   "2027-03-20T20:24:43Z",
      "in_progress": true,
      "final_tier": "Adept I",
      "peak_tier": "Adept II",
      "rank_floor": "Initiated",
      "tiers_held": [
        {"tier": "Peasant III", "discovered_at": "2026-12-28T19:02:11Z"},
        {"tier": "Scrub I",     "discovered_at": "2027-01-04T21:40:55Z"}
      ]
    }
  ]
}
```

Implementation notes that are easy to get wrong:

- **`ORDER BY seasons.starts_at DESC`, never by `name`.** §5's naming makes a
  string sort actively wrong: it files `Summer 2026` before `Winter 2026`
  alphabetically when Winter is the later season. This is the single most likely
  bug in the feature and it is silent.
- **Two queries, not N+1.** Fetch the joined `season_rank_history` rows, then all
  of the player's `rank_discoveries` in one go, and group by `season_id` in
  Python. Not one discovery query per season.
- Both tables key on `name` (Text), consistent with `ranked_profile` and the
  `players_name_key` unique constraint — no player-id join to introduce.
- A player with no ranked history gets `{"seasons": []}` plus whatever the current
  season contributes, never a 404 — same shape-always contract `player_profile`
  already follows.

### Frontend

A fourth card on the stats page, below **Ranked**, reusing the existing
`bg-black/40 … rounded-xl` card styling verbatim so it reads as part of the page
rather than a bolt-on.

- One row per season, newest first. Season name as the row heading, date range
  beneath it in the muted `text-white/50` the page already uses.
- **Peak and final as two `RankBadge`s** (`src/components/hud/RankBadge.tsx`),
  labelled — peak is the achievement, final is the record, and showing only one
  loses half the story.
- **The trail** as a horizontal ladder of the season's `tiers_held`, ordered by
  the tier ladder in `config.RANKED_TIERS` (not by `discovered_at` — the ladder
  order is the meaningful one, and a player can discover out of order after a
  hot streak). Dim the ones below peak, light the peak.
- **The gate mark.** Give each season row the glyph of the gate that opened it,
  matching whatever mark the four-gate ring uses on the globe (§5). One shared
  symbol set makes the connection between the sky and the archive without a word
  of explanatory copy.
- The in-progress season carries a countdown instead of an end date, and visually
  reads as unfinished (no border-seal, lower contrast on the final badge).
- Empty state for a player who has never queued: reuse the existing placement
  copy (`Play 10 matches to get your rank.`) rather than inventing a second voice.

---

## 7. Rank ladder overhaul

Renaming the twelve ranked tiers, and generalising the season rank floor from one
tier to three.

### 7.1 The new ladder

| # | Old | New | Divisions | Floor? |
|---|---|---|---|---|
| 0–2 | Troll I / II / III | **Peasant I / II / III** | yes | |
| 3–5 | Djinn I / II / III | **Scrub I / II / III** | yes | |
| 6 | Warlock | **Initiated** | no | **floor** |
| 7–8 | Wizard I / II | **Adept I / II** | yes | |
| 9 | Demi-God | **Master** | no | **floor** |
| 10 | God | **Magi** | no | |
| 11 | Principality | **Ordeus** | no | **floor** (already built) |

**Point bands do not change.** `RANKED_TIERS`' widths (2/2/3, 2/2/3, 4, 4/4, 12,
12, uncapped) were calibrated by simulation in
`backend/docs/experimentation/RANKED_TIER_CALIBRATION_2026-08-16.md`. This is a
rename of the `name` field only — every threshold, the placement cap position, and
the Ordeus games gate keep their calibrated values. Say so in the commit, because
"we changed the ranks" is otherwise a reasonable thing to assume invalidated the
calibration doc.

**The names are more coherent than the old ones, and that pays off in 7.2.** The
old ladder mixed creatures with an angelic hierarchy (Troll → Djinn → Warlock →
Wizard → Demi-God → God → Principality). The new one is a single initiatory
progression: two ranks of the un-initiated (Peasant, Scrub), then the grades of an
order (Initiated, Adept, Master, Magi) topped by Ordeus. That is why the floors sit
where they do — see next.

### 7.2 Rank floors: one mechanism, not three booleans

> **When a player reaches Initiated, they can never be displayed below Initiated
> for the rest of the season. Same at Master. Same at Ordeus.**

The floors are not arbitrary rungs — they are the **thresholds of initiation**:
admission to the order (Initiated), mastery within it (Master), and the summit
(Ordeus). The in-world rule writes itself: **you cannot be un-initiated.** A grade,
once conferred, is yours until the season resets. That is worth stating in the
plan because it is also the argument for *not* putting floors on Scrub or Adept —
those are progress within a grade, not the crossing of one.

**This already exists, once.** `players.reached_principality_this_season` is a
sticky boolean doing exactly this for Principality/Ordeus, and
`engine/rating.py`'s `effective_tier` applies it. The mistake to avoid is adding
`reached_initiated_this_season` and `reached_master_this_season` beside it. Three
booleans for one concept, three places to forget to reset, three arguments to
`effective_tier`.

**Generalise to a single stored floor:**

```python
# config.py -- the rungs that, once shown, cannot be fallen below.
RANK_FLOOR_TIERS: list[str] = ["Initiated", "Master", "Ordeus"]
ORDEUS_MIN_GAMES = 50        # was PRINCIPALITY_MIN_GAMES; value unchanged
```

```python
# engine/rating.py
def floor_from(tier: str, ranked_games_played: int) -> str | None:
    """The highest floor tier at or below `tier` that this snapshot earns.

    At-or-below, not equality: a player shown Adept II has self-evidently
    crossed Initiated, and must hold that floor even though they never sat
    on the rung itself.
    """
    earned = [f for f in RANK_FLOOR_TIERS if tier_rank(f) <= tier_rank(tier)]
    # Ordeus keeps its extra games gate (the calibration doc's Experiment 3);
    # unqualified, the player falls back to the next floor down, not to none.
    if earned and earned[-1] == "Ordeus" and ranked_games_played < ORDEUS_MIN_GAMES:
        earned.pop()
    return earned[-1] if earned else None


def effective_tier(
    ranked_games_played: int, mu: float, sigma: float, rank_floor: str | None,
) -> str | None:
    tier = visible_rank(ranked_games_played, mu, sigma)
    # Placements hide the rank outright -- a floor must never reveal one early.
    if tier is None or rank_floor is None:
        return tier
    return tier if tier_rank(tier) >= tier_rank(rank_floor) else rank_floor
```

`tier_rank()` already exists for exactly this kind of ladder-position comparison,
so the clamp is a position `max`, never a string comparison.

**Schema:** replace `players.reached_principality_this_season` (Boolean) with
`players.rank_floor_this_season` (Text, nullable, holding the tier name). One
Alembic migration, with the data carried across before the old column drops:

```sql
UPDATE players SET rank_floor_this_season = 'Ordeus'
 WHERE reached_principality_this_season;
```

`qualifies_for_principality` is deleted; `floor_from` replaces it, and callers
write the returned floor whenever it ranks above the stored one (monotonic within
a season — it only ever climbs).

**Three consequences to keep straight:**

1. **Floors are display-only.** The hidden `(μ, σ)` keeps moving freely and
   matchmaking searches on the ordinal, not the shown tier — so a floored player
   who has genuinely declined still gets matched at their real strength. Match
   quality is untouched. This is the same separation §5's hidden-rating rule
   already relies on.
2. **This reverses a documented decision.** `visible_rank`'s docstring currently
   ends *"Game 11+: uncapped `tier_from()` — ordinary promotion/demotion, **no
   floor protection on demotion (per your note)**."* That note is now superseded
   at three rungs. Update the docstring in the same commit rather than leaving the
   code contradicting itself.
3. **The season-end rollover must clear it.** `models.py` already notes the sticky
   boolean resets with `rating_mu`/`rating_sigma`/`ranked_games_played` at the hard
   reset. `rank_floor_this_season` inherits that obligation — add it to the
   rollover job in §10's Phase 10, or floors become permanent by accident.

**Nice symmetry worth preserving:** `RANKED_PLACEMENT_CAP_TIER` is `"Warlock"` —
i.e. Initiated is *already* the ceiling a debuting player is capped at on game 10.
It now becomes the floor they can never fall below once earned. The same rung is
the most a newcomer can be granted and the least an initiate can be reduced to.
That is a good rank to build the badge art around.

### 7.3 The rename is not a find-and-replace

Tier names are **stored as text**, not as enum ordinals, in four places. Rename the
config without migrating them and every historical rank becomes an unrecognised
string.

| Column | Holds | Note |
|---|---|---|
| `players.peak_tier_this_season` | `"Wizard I"` | live |
| `rank_discoveries.tier` | `"Warlock"` | **already accumulating rows today** |
| `season_rank_history.final_tier` | | empty until first rollover |
| `season_rank_history.peak_tier_this_season` | | empty until first rollover |

One Alembic data migration with a twelve-row mapping, applied to all four columns,
preserving the division suffix (`'Troll I' -> 'Peasant I'`). Check the row counts
first — the system is still in shadow mode, so this may well be a no-op in
production — but **write the migration regardless**: it is a dozen `UPDATE`s, and
`rank_discoveries` is being written to right now.

**The silent frontend failure.** `RankBadge.tsx`'s `TIER_COLORS` is keyed by the
exact backend strings and resolves misses with `TIER_COLORS[tier] ?? UNRANKED_COLOR`.
Rename the backend without updating that map and every badge in the game silently
renders **grey, with no error** — the page still works, the ranks just quietly stop
having colours. (The file's own comment claims a mismatch would be "visibly obvious
rather than silently falling back"; the `??` makes that not quite true. Worth
fixing the comment, or better, adding the test in §11 that asserts the map's keys
equal the backend ladder.)

**Full blast radius**, measured:

- **wom-be** — `config.py` (`RANKED_TIERS`, `RANKED_PLACEMENT_CAP_TIER`,
  `PRINCIPALITY_MIN_GAMES`), `engine/rating.py`, `models.py` comments + the column
  swap, and `tests/test_rating.py`, `tests/test_ranked_result.py`,
  `tests/test_repositories.py`.
- **wom-fe** — `RankBadge.tsx`, and fixtures in `RankBadge.test.tsx`,
  `stats/__tests__/page.test.tsx`, `LobbyOverlay.test.tsx`, `api.test.ts`.
- **Docs** — `RANK_SYSTEM_PLAN.md` (21 mentions), the calibration doc (19),
  `ART_STYLE_PLAN.md` (8), and this file's own examples.

### 7.4 Do it before the emblem art

`ART_STYLE_PLAN.md` §"no icon art exists yet" plans **five tier-family emblems**
(Troll, Djinn, Warlock/Wizard, Demi-God/God, Principality) plus a numeral system
for sub-tiers. **None of it is drawn.** The new names map onto the same
five-family structure — Peasant, Scrub, Initiated/Adept, Master/Magi, Ordeus — so
the rename costs nothing on the art side *today* and gets more expensive with
every asset produced. It also improves the brief: "Initiated / Adept / Master /
Magi" is a legible progression of one order's regalia, where "Warlock / Wizard /
Demi-God / God" needed four unrelated silhouettes.

The colour ladder in `TIER_COLORS` transfers as-is (stone → sky → purple → indigo
→ amber → gradient); only the keys change. Whether `Scrub` still wants sky-blue is
a judgement call for whoever does the art pass, not a blocker.

---

## 8. Shared module (both repos)

**`wom-fe/src/lib/astralGates.ts`** — pure, node-testable, no React, no THREE
beyond what `skyLocal` already returns:

```ts
export type GateKind = 'new_moon' | 'full_moon'
                     | 'spring_equinox' | 'summer_solstice'
                     | 'autumn_equinox' | 'winter_solstice';

/** Ecliptic longitude the gate sits at, at instant `at`. Fixed for solar
 *  gates; tracks the Sun for lunar ones. */
export function gateLongitude(kind: GateKind, at: Date): number;

/** Fraction 0..1 of the way from the previous gate to `next`. */
export function gateProgress(kind: GateKind, at: Date, next: Date): number;

/** Gate longitude -> a polyline in the same scene space eclipticPolyline uses. */
export function gateMeridian(lonDeg: number, frame: LocalFrame, steps?: number): [number, number, number][];
```

`gateMeridian` is `eclipticPolyline` with one longitude and a varying latitude
instead of the reverse — it should live next to it in `citySkyGeometry.ts` and
share its sampling and clipping conventions rather than growing a parallel set.

**`wom-be/domain/astral_gates.py`** — loads the JSON, binary-searches it:
`latest_lunar_at_or_before(now)`, `next_lunar_after(now)`, `current_solar_window(now)`.
Pure, no Flask, no SQL — the same layer as `domain/wheels.py`.

---

## 9. Edge cases worth deciding now

1. **Gate instant lands mid-match.** Resolve the match against the season/period
   active at **match start**, not at result-write. Otherwise a player's last game
   of the season silently counts toward the next one. `ranked_match_results` already
   stores `season_id` per row, so this is a matter of capturing it early.
2. **Clock skew / client ahead of server.** The frontend must never decide a gate
   has passed. It renders `next_gate_at` and, when it elapses, refetches rather
   than assuming — the backend's answer is the only one that changes state.
3. **Table exhaustion.** If `now` runs past the table's horizon, the backend must
   **fail loud** (log an error, refuse to invent a window) rather than silently
   falling back to fixed-length periods. A CI test that fails when the table has
   under 2 years of runway left turns a 2040 outage into a build failure years
   earlier.
4. **Southern-hemisphere framing — decided, accept it.** `Winter 2026` arrives in
   a Melbourne player's July sunshine. The northern names are the game's mythic
   frame (as the Mythos tier ladder already is) and stay. Worth knowing it is a
   deliberate call rather than an oversight, because it becomes permanent the
   moment the first `season_rank_history` row is written.
5. **Leap-second / timezone hygiene.** Everything UTC, everything ISO 8601 with an
   explicit `Z`, all backend datetimes timezone-aware — matching what
   `_current_wheel_drop_period_start` already does.

---

## 10. Phasing

| Phase | Work | Repo | Ships alone? |
|---|---|---|---|
| **0** | Generator script + committed JSON table + table tests | fe → be | yes |
| **1** | Wheel cap on lunar gates (`_current_wheel_drop_period_start` swap + cutover guard) | be | yes — invisible, pure logic |
| **2** | `wheel_cap` on `/inventory` + "2/4 this moon" readout | be + fe | yes |
| **3** | Gate line on the globe (Moon first) + gaze label | fe | yes |
| **4** | Season table lookup replaces `RANKED_SEASON_LENGTH_DAYS` | be | yes |
| **5** | Sun gate + four-gate ring + season header | fe | yes |
| **6** | City-scene gate lines (full moon high, new moon correctly absent) | fe | yes |
| **7** | Tier rename + data migration, backend and frontend **in lockstep** | be + fe | **no — must deploy together** |
| **8** | Rank floors generalised (`rank_floor_this_season` replaces the sticky boolean) | be | yes |
| **9** | `GET /ranked/history/<name>` + Hall of Records card, **current season only** | be + fe | yes — useful before any rollover exists |
| **10** | Season rollover job (archive + hard reset, incl. clearing `rank_floor_this_season`) | be | yes — rewards can follow separately |

**Phases 7–10 must run in that order**, and each dependency is a real one:

- **7 before everything.** Renaming is cheapest before emblem art exists (§7.4)
  and before the first rollover writes permanent `season_rank_history` rows. Every
  later phase either stores or displays tier strings.
- **8 before 9.** Floors change `effective_tier`'s signature, and the Hall's
  in-progress season row calls it. Doing 9 first means writing that call twice.
- **9 before 10.** The Hall ships reading live data, so it is populated and useful
  immediately; the rollover job then only has to freeze a row and open the next
  one. The other order ships an empty card and waits a quarter to discover whether
  the query works.

**Phase 7 is the only entry in this plan that cannot ship one side at a time.**
Backend-first turns every badge grey (§7.3); frontend-first shows names the server
never sends. Deploy both together, or hold the rename behind the mapping until
both are out.

Phase 1 is the highest value-per-line in the list: it is a single function body,
it makes the feature *true* before it is visible, and everything after it is
decoration on a system that already works.

---

## 11. Tests

CI on both repos fails on new source without tests (wom-fe coverage ratchet over
the `src/lib` glob; wom-be `pytest --cov=.`), so this is not optional — and both
new modules are pure, so it is cheap.

**`wom-fe`** — `src/lib/__tests__/astralGates.test.ts`:
- `gateLongitude('winter_solstice', …)` is 270 at every instant.
- `gateLongitude('new_moon', at)` equals the Sun's ecliptic longitude at `at`;
  `'full_moon'` equals that + 180 (mod 360).
- At a known new moon, the Moon's ecliptic longitude sits within a small orb of
  its gate — **an assertion with a real right answer**, in the spirit of
  `citySkyGeometry`'s "does the drawn band pass through the Sun" test.
- `gateMeridian` passes through the body at the gate instant.
- Golden fixture of ~20 gate instants matching the committed backend table, so
  cross-repo drift fails a test rather than a season.

**`wom-be`** — `tests/test_astral_gates.py`:
- Table monotonic, gap-bounded, unique solar names, ≥5 years of runway.
- `latest_lunar_at_or_before` is exact on both sides of a known gate instant.
- `_current_wheel_drop_period_start` returns the known new moon for a `now` just
  after it, and honours `_LUNAR_CUTOVER` while it is set.
- `current_solar_window` spans exactly gate→gate with no gap and no overlap.
- Season naming: the gate opening 21 Dec 2026 yields `"Winter 2026"` (start year,
  not end year), and four consecutive gates yield four distinct names.

**`wom-be`** — `tests/test_ranked_history.py`:
- **The ordering trap, explicitly:** a fixture of `Summer 2026`, `Winter 2026`,
  `Spring 2027` comes back in that chronological order. A name sort fails this,
  which is the whole point of writing it.
- Discoveries group onto the right season and no season triggers its own query
  (assert the query count, not just the payload).
- A player with no ranked history gets `{"seasons": []}`, never a 404.
- No `mu`/`sigma` anywhere in the response — the §5 hidden-rating rule.

**`wom-fe`** — `src/app/stats/__tests__/page.test.tsx` (the file already exists):
- The Hall renders the in-progress season when `season_rank_history` is empty.
- `tiers_held` renders in `RANKED_TIERS` ladder order, not `discovered_at` order.
- Never-queued player sees the placement copy, not an empty card.

**`wom-be`** — `tests/test_rating.py` (extend the existing file):
- `floor_from("Adept II", 20)` is `"Initiated"` — at-or-below, not equality.
- `floor_from("Ordeus", 20)` is `"Master"`, not `"Ordeus"` — under the games gate
  it falls back one floor rather than to none.
- `floor_from("Ordeus", 50)` is `"Ordeus"`.
- `effective_tier` with a floor of `Initiated` and a live tier of `Scrub II`
  returns `Initiated`; with a live tier of `Master` it returns `Master`.
- **A floor never reveals a rank during placements**: `ranked_games_played = 4`
  with a stored floor still returns `None`.
- The old sticky-Principality behaviour survives translation: floor `"Ordeus"`
  pins the display no matter how far `(μ, σ)` drifts.

**Cross-repo ladder test** — the one that would have caught the grey-badge bug:
- **`wom-fe`** `RankBadge.test.tsx`: `Object.keys(TIER_COLORS)` equals the twelve
  backend tier names, in ladder order, as a checked-in fixture. Any rename that
  updates one repo and not the other fails a test instead of shipping grey chips.

---

## 12. Open product calls

1. **Does `Initiated` get divisions?** The brief said *"when a person has become
   Initiated I"*, but `Warlock` — the rung it replaces — has no divisions, and
   neither do Master, Magi or Ordeus. Recommendation: **keep Initiated
   divisionless** and read "Initiated I" as shorthand. The divisionless rungs are
   exactly the threshold rungs, which is what makes the floors legible; splitting
   Initiated into I/II/III would also mean re-cutting its calibrated 4-point band
   into three, which is the one change here that *would* invalidate the
   calibration doc. The floor mechanism in §7.2 is keyed on the tier name and
   works either way, so this is a naming/balance call, not a blocker.
2. Do the `RANK_SYSTEM_PLAN.md` §9 ranked rewards need retuning for a 52%-longer
   season?
3. Should the wheel cap number itself change now that the window averages 14.76
   days instead of 14? Recommendation: **no** — a 5% faucet change is not worth
   the churn, and "4 per moon" is better copy than "4 per fortnight" anyway.
