# Rank & Competitive System Plan

Status: draft for review · Scope: `game/frontend` + `game/backend` · Last updated: 2026-07-21

## 1. Summary

Add a ranked, competitive track on top of the existing free-for-all table game:

- A new **"Find Ranked Match"** auto-matchmaking queue (today, all lobbies are private
  and joined by a 6-ish-character code — there is no matchmaking of any kind).
- Ranked matches are **2-6 players**, the same FFA table game that already exists
  (attack/defend/well/deny), just formed by the matchmaker instead of a join code. Once
  2 players are matched, a **60-second countdown** holds the lobby open for more
  matched players to join (up to 6); filling to 6 early collapses the countdown to 6
  seconds, and the countdown expiring with fewer than 6 still starts the match rather
  than stalling the queue (see §6).
- A **hidden skill rating** (μ/σ per player, OpenSkill/Weng-Lin model — see §4) drives
  matchmaking quality and rank movement, similar in spirit to how Hearthstone, Overwatch,
  and most modern matchmakers separate "the number that matches you" from "the rank you
  see." **Bigger matches carry more weight** — an explicit match-size multiplier scales
  up the rating swing on top of what the model already extracts from more players'
  worth of evidence (§4).
- A **visible rank** — a tier ladder (§5) with divisions at most tiers, and a numeric
  **leaderboard placement** at the top tier once a player is good enough to be ranked
  among the server's best, mirroring Hearthstone's Legend rank number.
- The first **10 ranked games** are volatile **placement matches**: the hidden rating
  moves fast and freely, but the *visible* rank is capped at a fixed ceiling until all
  10 are done, then the cap lifts and the true rank is revealed (§5).
- Grinding out games — even at a break-even win rate — **naturally, slowly nudges the
  visible rank upward over time** toward a player's true rating, with no separate
  mechanism needed (§4).
- **Seasons** with a soft rating reset and a cosmetic reward tied to peak rank, feeding
  into the existing skin/wheel inventory system (`MONETIZATION_PLAN.md`).

This document covers rating design, tiers, matchmaking, data model, API/socket
contract, frontend work, anti-abuse, and a phased rollout. It spans both repos because
the feature cannot be built frontend-only — matchmaking, rating, and match-result
persistence are backend concerns; this doc is the shared plan the way
`MONETIZATION_PLAN.md` is.

---

## 2. Current state (what exists today)

**Lobbies** — `backend/services/lobby_service.py`, `backend/config.py`:

- `lobbies: LobbyRepository = InMemoryLobbyRepository()` — lobbies live in the backend
  process's memory, not the database. There is exactly one backend instance today
  (self-hosted on one Hetzner VM), so this has never needed to be distributed.
- The only existing "auto-formed" lobby is the scheduled **boss fight** (`routes/bossfight.py`,
  `ensure_bossfight_lobby`/`find_active_bossfight`): a single shared lobby on a timer that
  players poll a REST endpoint (`get_bossfight_lobby`) to join. This is the closest
  existing precedent for matchmaking, and its poll-then-join shape is worth reusing.
- Regular PvP lobbies are created via `POST /create_lobby` and joined via a socket
  `join_lobby` event using a join code — fully private, no rating or skill matching
  involved.

**Match results** — `backend/engine/combat.py` (`_record_stats`, around line 140):

- On game end, **only if no bot was present in the lobby**, per-player stats
  (`played_games`, `wins`, `kills`, `well_wins`) are written to the `players` table and a
  row is appended to `game_player_stats` (`pvp_won`, `boss_won`, `kills`, `well_wins`).
- Only `winner` (the single last-player-standing name) and each player's final `alive`
  boolean are known at game end. **There is no persisted elimination order** — the
  engine's `on_elimination` hook (`engine/phases/attacks.py`) fires per kill but nothing
  records *when* each non-winner died. A placement-based rating system needs a full
  finishing order (1st, 2nd, ... last), not just winner/not-winner, so this is a real gap
  for ranked matches — see §7.
- Bot presence today unconditionally skips all stat recording. This is convenient for
  ranked: **ranked matches must never include bots**, and that exclusion already exists
  as a side effect of this code path (needs to become an explicit, deliberate rule rather
  than an accidental one, since ranked will care about it directly).

**AFK/idle tracking** — already exists and is reusable for leaver penalties (§8):
`Player.idle_rounds` (`backend/domain/player.py`), incremented in
`engine/phases/idle.py`, surfaced to the frontend as `idle_rounds` on the wire
(`src/types/game.ts`).

**Rank/rating/leaderboard code** — none exists anywhere in either repo today. This is a
net-new system.

---

## 3. Goals / non-goals

**Goals**

- Give players a persistent, meaningful measure of skill and progress across matches.
- Matchmaking that produces fair, close matches from a small-to-growing player pool.
- A visible rank that's legible at a glance and exciting to climb (tiers, divisions, a
  numeric placement at the top).
- Seasonal structure that gives players a reason to keep coming back.
- Reuse the existing game engine untouched — ranked is a different *way to form a
  lobby*, not a different game.

**Non-goals (v1)**

- Party/premade queuing (queueing as a group of friends into the same ranked match) —
  flagged as a future addition in §11, not in scope now.
- Team-based ranked (this game is inherently FFA; no 2v2-style ranked planned).
- Mid-season rating decay for inactive players — only an end-of-season soft reset (§9).
  Simpler, and avoids punishing casual players mid-season.
- Precise tier population percentages (e.g. "top 1% reaches the top tier") — cutoffs
  need real population data to calibrate sensibly, and there is no player base to
  measure yet. Ship with reasonable starting thresholds (§5) and revisit once there's
  data (§11).

---

## 4. Rating system: hidden skill rating

**Recommendation: OpenSkill, implementing the Weng-Lin Bayesian rating model.**

Why not the more familiar options:

- **Elo** is pairwise by nature (it only knows "A beat B"). A 6-player free-for-all
  match has to be decomposed into pairwise comparisons and averaged, which is a common
  workaround but double-counts correlated outcomes and has no native notion of per-player
  uncertainty.
- **Glicko-2** improves Elo with a per-player confidence interval (RD) and inactivity
  decay, but is still fundamentally a 2-player comparison model — same FFA workaround
  needed as Elo.
- **TrueSkill** (Microsoft, built for Xbox Live matchmaking — Halo, Gears of War) is the
  standard reference algorithm for exactly this scenario: N players in one match, ranked
  by finishing place, updating a Gaussian belief (μ, σ) per player. It's the closest
  thing to an industry-standard answer here. The catch is Microsoft's patent on the
  algorithm — a legal shadow worth avoiding for a game with real monetization plans.
- **OpenSkill** implements the same underlying math (Weng-Lin model) under an MIT
  license, with no patent exposure. It's a small, dependency-light Python package,
  natively supports 2-6+ player matches ranked by placement (and ties), and needs no
  pairwise decomposition hack.

**How it works, applied to this game:**

- Every player has a belief distribution `(μ, σ)`: μ is the estimated skill, σ is the
  system's uncertainty about that estimate. New players start with a high σ (wide
  uncertainty) that narrows as they play games.
- At the end of a ranked match, every player is assigned a **finishing place** (1st
  place = last one standing / round winner, then ranked by how long the rest survived —
  requires the elimination-order tracking flagged in §7). OpenSkill's `rate()` call takes
  the whole match's player list plus their places and returns updated `(μ, σ)` for
  everyone in one call — no per-pair loop needed.
- A conservative display value, typically `μ - 3σ`, is used anywhere the game needs "a
  single number" (matchmaking search, initial tier placement) — this is standard OpenSkill
  practice, and self-corrects a new/uncertain player's rank quickly as σ narrows.
- **Placement matches**: a player's first **10** ranked games start from a high-σ prior
  (fast-moving, wide swings). The visible rank during this window is additionally capped
  at a fixed ceiling regardless of how well the player is doing (§5) — a separate,
  deliberate display rule, not a rating-engine change. Once all 10 are played, the cap
  lifts and the visible rank jumps straight to wherever `μ - 3σ` actually lands. This is
  the standard mitigation for smurfs and brand-new players landing in the wrong bracket,
  with the added benefit of a satisfying "reveal" moment at game 10.
- **Grinding slowly raises visible rank, without a separate mechanism.** σ shrinks a
  little after every game regardless of outcome (more evidence = more certainty), and
  since the visible rank is the *conservative* estimate `μ - 3σ`, a shrinking σ alone
  makes that number creep upward over time even across a stretch of break-even results —
  converging toward the player's true `μ`. This is bounded (it can't climb past their
  actual skill estimate, and it plateaus once σ is already small), which is exactly the
  property that keeps this from corrupting the number matchmaking uses: a high-volume,
  average player still can't out-rank a genuinely-better low-volume player, they just
  reach *their own* ceiling a bit faster than pure win/loss variance alone would produce.
  No extra "loyalty bonus" needed — this is inherent to the rating engine already
  described above.
- **More players in the match → more sway in the rating.** OpenSkill's own math already
  extracts more information from a bigger match (a 6-player finishing order is more
  evidence than a 2-player one), but on top of that, apply an explicit **match-size
  multiplier** to the raw `μ` delta OpenSkill returns before applying it to a player's
  stored rating: `final_delta = openskill_delta * multiplier(N)`, where `multiplier(N)`
  is a small increasing curve (e.g. 1.0x at 2 players up to somewhere around 1.5-2x at 6
  players — exact curve TBD/tunable, same bucket as tier thresholds). This is applied
  only to the μ delta; σ's own shrinkage is left as OpenSkill computes it natively, since
  "more players = more certainty" is already the correct behavior there and doesn't need
  amplifying. The net effect: a 6-player ranked win/loss matters noticeably more to your
  rank than a 2-player one, on top of what the model already does for free — directly
  rewarding playing (and winning) the bigger, more chaotic matches the game is designed
  around.

---

## 5. Visible rank: tiers and the top-rank leaderboard number

Tier names and theming are yours to decide — not covered by this doc. Structurally, the
proposal is:

- A fixed ladder of **N tiers** (exact count and names TBD by you), each with divisions
  (e.g. III → I) except the top tier.
- Each division has a fixed rating-point band (calibrated later against real population
  data, §3). Winning a ranked match (finishing 1st, or top-half in a larger lobby) earns
  rating; finishing near the bottom loses it — the underlying `μ - 3σ` movement from §4
  mapped onto a visible point bar within the division.
- **Promotion/demotion** between divisions and tiers happens as the visible rating
  crosses a boundary. **Floor protection per tier** (can't be demoted below the tier you
  most recently reached) — the standard Hearthstone/League-style mitigation for the
  frustration of yo-yoing across a boundary.
- **Top tier**: uncapped, no divisions. Once a player's rating crosses into it, they stop
  seeing divisions/stars and instead see **their numeric leaderboard placement**
  (e.g. "#42"), recalculated live as ratings shift — directly mirroring Hearthstone's
  Legend rank number. This is naturally free real estate for the leaderboard page in
  §10.

**Placement cap (first 10 ranked games).** The hidden `(μ, σ)` engine is left completely
alone during placements — it needs to move freely and fast to converge on an accurate
skill estimate. The cap only applies to what's *shown*:

```
if ranked_games_played < 10:
    visible_tier = min(tier_from(μ, σ), PLACEMENT_CAP_TIER)
else:
    visible_tier = tier_from(μ, σ)   # cap lifted, true tier revealed
```

`PLACEMENT_CAP_TIER` is a config constant (exact value TBD by you, alongside tier
naming). A player who's actually far better than the cap the whole time has an
accurate, uncapped `μ` behind the scenes (so matchmaking treats them correctly even
during placements); they just don't *see* it until game 10, at which point their visible
rank can jump straight up to reflect it.

Exact division counts and point thresholds are a starting proposal, not final — easy to
retune since they're just config once the rating engine underneath is in place.

---

## 6. Matchmaking: the ranked queue

- New **"Find Ranked Match"** entry point (frontend, §10) starts a REST-based queue join,
  following the existing boss-fight poll pattern (`get_bossfight_lobby`) rather than
  inventing a new shape:
  - `POST /ranked/queue/join` — enters the queue.
  - `POST /ranked/queue/leave` — cancels.
  - Match found is pushed via a **socket event** (`ranked_match_found` with `lobby_id` +
    session token) rather than polled — sockets are already the game's real-time channel
    and a push avoids queue-status polling entirely once joined.
- **Matchmaking logic** (backend, in-memory like the existing `InMemoryLobbyRepository`
  — no new persistence needed since there's a single backend process):
  - Group queued players by closeness in `μ - 3σ` into a **forming** ranked lobby (not
    yet playing — still accepting joiners). Widen the acceptable rating band the longer
    the forming lobby waits (standard matchmaker behavior — start narrow, loosen over
    time), so later joiners can be somewhat further off in rating than the first two.
  - **Start countdown**: once a forming lobby reaches its **minimum of 2 players**, a
    **60-second countdown** begins before the game actually starts. While it runs, more
    matched players can keep joining the same lobby, up to the max of **6**.
  - **Countdown collapses once full**: if the lobby fills to 6 players before the 60s
    elapses, the remaining countdown immediately drops to **6 seconds** (or keeps
    whatever time was already left, if that's already under 6s — i.e. `remaining =
    min(remaining, 6)`) rather than resetting to a full 6s. This gives a short, consistent
    "match found, starting shortly" beat in the UI even for a full lobby, instead of an
    instant, jarring start.
  - **Timeout fallback**: if the 60s countdown expires with fewer than 6 players (as few
    as the 2-player minimum), the match **starts anyway** with whoever is present. This
    is what guarantees a ranked match actually starts within a bounded wait — at most a
    minute — even while the player population is small and 4-6 players aren't always
    available; the rating-band widening above and this fixed countdown work together
    toward the same goal (maximize lobby size within a bounded wait, per your direction
    that the match format should ideally be 4-6 but must not stall the queue).
  - All of the above (countdown length, collapse threshold, min/max players) are tunable
    constants — the 60s/6s/2/6 figures here are your specified starting values, not
    hardcoded assumptions.
- **No bots in ranked matches, ever** — enforced at match-formation time (the matchmaker
  never adds one), and doubles up naturally with the existing bot-presence stat-skip in
  `combat.py` (§2) as a second, independent guard.
- Once matched, **the existing lobby/game engine runs completely unmodified** — ranked is
  just a flag on the lobby (`ranked: true`) that changes what happens *after* the game
  ends (rating update, no join-by-code UI), not how the game itself plays.

---

## 7. Backend data model additions

**New: elimination-order tracking (prerequisite for placement-based rating).**
Today only `winner` and per-player `alive` are known at game end — nothing records the
order in which the rest of the lobby died. Needed:
- Track an ordered elimination list on the `Lobby` domain object as `on_elimination`
  fires (`engine/combat.py`/`engine/phases/attacks.py`), e.g. append `(player_name,
  round_number)` each time someone dies; the winner is simply whoever's left when the
  list is complete. This becomes the `places` input list OpenSkill's `rate()` needs.

**`players` table** — add:
- `rating_mu`, `rating_sigma` (floats) — OpenSkill's belief state.
- `current_tier`, `current_division` (or derive on read from `rating_mu`/`rating_sigma` —
  cheaper to derive than to keep in sync, recommend deriving).
- `peak_tier_this_season`, `peak_division_this_season` — drives the season-end reward
  (§9).
- `ranked_games_played` — to gate placement-match logic (§4).

**New `ranked_match_results` table** (or extend `game_player_stats`, which already has a
`game_id`/`name`-keyed shape) — one row per player per ranked match:
- `game_id`, `name`, `placement` (1st..Nth), `mu_before`, `sigma_before`, `mu_after`,
  `sigma_after`, `season_id`.
- This is what a rank-history UI and the season-end reward job read from.

**New `seasons` table**:
- `id`, `name`, `starts_at`, `ends_at`, `reward_config` (e.g. which skin/wheel per peak
  tier, tying into the existing `MONETIZATION_PLAN.md` inventory system).

**Matchmaking queue itself**: in-memory (mirrors `InMemoryLobbyRepository`), not
persisted — a queue is inherently ephemeral, and there's precedent for in-memory-only
game state already.

**Live online-player count** (for the world-map "Play Ranked" button, §10): also
in-memory, not persisted — a running counter of connected sockets (or players in an
active lobby), broadcast to clients on change. No new tables needed, just server-side
state alongside the existing `lobbies` dict.

---

## 8. Anti-abuse

- **No bots in ranked** — see §6, enforced twice over.
- **Leavers/AFK**: `idle_rounds` already exists and is tracked per-round today. Proposal:
  an AFK player in a ranked match is treated as **eliminated at the point they went
  idle** for placement purposes (not "last place unconditionally" — someone who
  disconnects at round 8 of 10 still beat whoever died at round 3), which flows naturally
  through the same elimination-order mechanism from §7 with no special-casing needed.
- **Queue-dodging**: repeatedly cancelling right after a match is found (to avoid a bad
  matchup, or to snipe a good one) gets a short escalating queue-ban, standard practice
  in most matchmakers.
- **Smurfing**: mitigated primarily by the wide-σ placement window (§4) — a smurf's true
  `μ - 3σ` surfaces within the 10 placement games rather than the 25+ games a flatter
  system would need, since uncertainty (and thus rating movement per game) starts high
  and narrows fast. The placement cap (§5) adds a second layer: even a smurf stomping
  every placement match can't display above the cap until game 10 anyway.

---

## 9. Seasons and rewards

- **Monthly seasons** — a new season starts every calendar month.
- **Season-end soft reset**: compress each player's `μ` toward the population mean (e.g.
  by 30-40%, standard soft-reset practice) rather than a hard reset to zero — preserves
  relative standing while giving everyone room to climb again. `σ` is widened somewhat
  too, so the new season effectively starts everyone with a shorter placement phase
  (server retains a prior, unlike a truly new player).
- **Reward**: cosmetic tied to `peak_tier_this_season`, delivered through the existing
  skin/wheel inventory system from `MONETIZATION_PLAN.md` (e.g. a season-exclusive skin
  variant, or a guaranteed Wheel scaled by tier reached) — reuses existing plumbing
  rather than inventing a new reward-delivery path.

---

## 10. Frontend work (this repo)

- **Entry point**: a **"Play Ranked"** button over the 3D world map itself, in
  `src/components/worldmap/WorldMapOverlay.tsx` — the same overlay that already hosts
  the "Join Lobby"/"Create Lobby" bottom controls on the home page (`src/app/page.tsx`),
  so it sits alongside them rather than being buried in the city-hub menu
  (`HomeOverlay.tsx`, which is a level deeper, inside a city).
- **Live "currently playing" count next to the button**: a running total of players
  active on the server right now, shown beside the Play Ranked button as social proof /
  to reassure players a match will actually be found. **This doesn't exist yet in either
  repo** — needs a small new backend surface: the simplest option is a count of
  currently-connected Socket.IO clients (or players currently seated in any lobby, a
  slightly narrower but more meaningful definition of "playing"), pushed to all
  connected clients as a broadcast socket event whenever it changes, mirroring how
  `state_update` already pushes lobby state rather than being polled. Exact scope
  (all connected sockets vs. players in an active game) is a small product call to make
  alongside the tier naming/thresholds, not a technical blocker either way.
- **Queue UI**: a "searching" state with a cancel button while waiting for the first
  match; once matched (`ranked_match_found`), transition into the existing lobby-join
  flow (reusing `joinLobby`'s shape in `src/lib/api.ts`) and show the **60s hold-open
  countdown** alongside a live "X/6 players joined" readout, so players can see both the
  clock and whether the lobby is still filling — this is new UI state without a direct
  precedent in the existing private-lobby flow, since today's lobbies don't auto-start.
- **Rank badge component**: tier icon + division (or, at the top tier, the numeric
  leaderboard placement) — used in the HUD (`SceneOverlay.tsx`), a player's profile, and
  the post-game screen.
- **Post-game rank-change summary**: e.g. "+18 rating · Tier X-II → Tier X-I" appended
  to the existing game-over flow (`LobbyState.gameover` already exists and is the
  natural hook).
- **New leaderboard page** (`src/app/leaderboard/` or similar): top-N players, search by
  name, season countdown — the natural home for the top-tier numeric-placement list.
- **Types**: extend `src/types/game.ts` with new zod schemas (`RankedProfile`,
  `LeaderboardEntry`, `Season`, ranked flag on `LobbyState`), following the existing
  wire-schema-as-source-of-truth pattern already used for `Player`/`LobbyState`/`Relic`.

---

## 11. Open questions / future work

- **Party/premade ranked queue** — queueing as a group of friends into the same match.
  Deliberately out of scope for v1; revisit once solo ranked is live and stable.
- **Exact tier/division point thresholds** — placeholders until there's real rating
  distribution data to calibrate against (§3). Plan to revisit after the first season or
  two.
- **Match-size multiplier curve** (§4) — resolved in direction (bigger matches swing
  rating more) but the exact `multiplier(N)` values are a tuning call, same bucket as
  tier thresholds; a cosmetic match-size indicator on match history could reinforce this
  further later, but isn't required for v1.
- **Mid-season decay** — deliberately excluded from v1 (§3); revisit if top-of-leaderboard
  inactivity turns out to be a real problem.
- **Scope of the "currently playing" count** (§10) — all connected sockets vs. only
  players currently seated in an active lobby. Not a technical blocker either way, just
  needs a decision.
- **Countdown/lobby-size constants** (§6) — the 60s hold-open window, 6s collapse
  threshold, and 2/6 min/max players are your specified starting values; revisit once
  there's real queue-time data.
- **`PLACEMENT_CAP_TIER` value** (§5) — which tier placement matches are capped at is a
  tuning call, same bucket as tier naming/thresholds.

---

## 12. Phased rollout

1. **Phase 0 (backend, no UI)** — OpenSkill integration, elimination-order tracking
   (§7), new tables, unit tests for the rating wrapper against known OpenSkill test
   vectors.
2. **Phase 1 (backend, shadow mode)** — matchmaking queue + `ranked` lobby flag, full
   integration with the existing game engine, rating computed and stored but not shown
   to players yet (internal dogfooding only).
3. **Phase 2 (frontend, visible rank)** — "Play Ranked" button + live online-count on the
   world map, rank badge, post-game rank-change screen.
4. **Phase 3 (frontend, leaderboard)** — leaderboard page, top-tier numeric placement.
5. **Phase 4 (seasons)** — season table, season-end soft-reset job, cosmetic reward
   delivery tied into the existing skin/wheel system.
