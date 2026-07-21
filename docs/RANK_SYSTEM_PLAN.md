# Rank & Competitive System Plan

Status: draft for review · Scope: `game/frontend` + `game/backend` · Last updated: 2026-07-21

## 1. Summary

Add a ranked, competitive track on top of the existing free-for-all table game:

- A new **"Find Ranked Match"** auto-matchmaking queue (today, all lobbies are private
  and joined by a 6-ish-character code — there is no matchmaking of any kind).
- Ranked matches are **2-6 players**, the same FFA table game that already exists
  (attack/defend/well/deny), just formed by the matchmaker instead of a join code.
  Ideally matches are 4-6 players; the matchmaker will accept smaller matches under a
  timeout so the queue doesn't stall while the player base is small (see §6).
- A **hidden skill rating** (μ/σ per player, OpenSkill/Weng-Lin model — see §4) drives
  matchmaking quality and rank movement, similar in spirit to how Hearthstone, Overwatch,
  and most modern matchmakers separate "the number that matches you" from "the rank you
  see."
- A **visible rank** — a themed tier ladder (§5) with divisions at most tiers, and a
  numeric **leaderboard placement** at the top tier once a player is good enough to be
  ranked among the server's best, mirroring Hearthstone's Legend rank number.
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
- **Placement matches**: a player's first 5-10 ranked games start from a high-σ prior
  (fast-moving, wide swings) and are not shown as a public rank until placements finish;
  the resulting `μ - 3σ` at that point decides the starting tier. This is the standard
  mitigation for smurfs and brand-new players landing in the wrong bracket.

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
  - Group queued players by closeness in `μ - 3σ`. Prefer forming a 4-6 player match.
  - Widen the acceptable rating band the longer someone waits (standard matchmaker
    behavior — start narrow, loosen over time).
  - After a timeout (e.g. 20-30s) with too few close-rated players to fill a 4-6 match,
    **fall back to forming a smaller match (down to 2 players)** rather than leaving
    players waiting indefinitely — explicitly necessary while the player population is
    small, per your direction. This should be a tunable constant, tightened as the
    population grows.
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
- **Smurfing**: mitigated primarily by wide-σ placement matches (§4) — a smurf's true
  `μ - 3σ` surfaces within ~5-10 games rather than the 25+ games a flatter system would
  need, since uncertainty (and thus rating movement per game) starts high and narrows
  fast.

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

- **Entry point**: a "Find Ranked Match" option alongside the existing create/join lobby
  buttons in `src/components/home/HomeOverlay.tsx`.
- **Queue UI**: searching state with elapsed timer and a cancel button; on the
  `ranked_match_found` socket event, transition straight into the existing lobby-join
  flow (reusing `joinLobby`'s shape in `src/lib/api.ts`) rather than building a new join
  path.
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
- **Cross-size prestige** — does a 6-player ranked win "feel" bigger than a 2-player one?
  OpenSkill's math already accounts for this in the rating math (more players in a match
  = more information per placement), but the *perceived* prestige gap might still be
  worth a cosmetic distinction later (e.g. a small match-size indicator on match history).
- **Mid-season decay** — deliberately excluded from v1 (§3); revisit if top-of-leaderboard
  inactivity turns out to be a real problem.

---

## 12. Phased rollout

1. **Phase 0 (backend, no UI)** — OpenSkill integration, elimination-order tracking
   (§7), new tables, unit tests for the rating wrapper against known OpenSkill test
   vectors.
2. **Phase 1 (backend, shadow mode)** — matchmaking queue + `ranked` lobby flag, full
   integration with the existing game engine, rating computed and stored but not shown
   to players yet (internal dogfooding only).
3. **Phase 2 (frontend, visible rank)** — queue button, rank badge, post-game rank-change
   screen.
4. **Phase 3 (frontend, leaderboard)** — leaderboard page, top-tier numeric placement.
5. **Phase 4 (seasons)** — season table, season-end soft-reset job, cosmetic reward
   delivery tied into the existing skin/wheel system.
