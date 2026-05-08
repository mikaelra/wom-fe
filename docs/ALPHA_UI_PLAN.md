# World of Mythos — Alpha UI Plan

This document is the overarching design plan for the **World of Mythos Alpha** release. It covers UI, game systems, distribution, and the work required across both the frontend (`wom-mid`) and backend (`tjuvpakk-backend`).

---

## 0. Immediate Alpha Priorities

> **Goal: Ship something playable.** Before pursuing world maps, cities, DLC, and distribution, the following must be done first. Everything else is post-alpha.

### Must-have for Alpha

1. **Change email in settings** — On the Settings page, show the player's current email at the top (`Your email: <your@email.com>`). Below it, a white **"Change email"** button. Clicking it turns the email into a text input with **"Confirm"** (green) and **"Cancel"** (grey) buttons under it. Confirm persists the new email to the database (and updates `localStorage.playerEmail`); Cancel reverts to the display state. If the player has **always-verify-email** turned on, clicking "Change email" shows a red message: *"You must turn off email verification to change email"* and does not open the input. Requires a backend `change_email` endpoint that accepts `{ name, current_email, new_email }`. ❌ **Not started**
2. **Password security** — Players with a claimed account (email on file) can set and change a password. On the Settings page, show a **"Set password"** button (or **"Change password"** if one is already set). The flow uses a current-password + new-password + confirm-password form; passwords are hashed server-side (bcrypt). Login with password becomes an alternative to email-code verification — when a password is set, the player can authenticate with `{ name, password }` instead of going through the email verification flow. Requires backend endpoints: `set_password` and `change_password`. If the player forgets their password, they can reset it via the email verification flow. ❌ **Not started**
3. ~~**Character model** — Angel-cherub 3D model replaces placeholder; sits at table during lobby, dies on death.~~ ✅ **Done** — Cherub, Turtle, Ghost, and PlayerV1 models all integrated via `useGLTF`; positioned around the table.
4. ~~**Table-based lobby UI** — Characters sit around the table. All game actions are triggered by clicking on 3D elements or buttons anchored to characters — no flat menu panels.~~ ✅ **Done** — 3D table with players seated at slots; overlay action buttons on top of 3D canvas.
5. **Combat animations** — Polished enough to feel satisfying: attack, defend, raid, death, victory. This is a priority. ⚠️ **In progress** — Explosion particle effects (`ExplosionEffect.tsx`) and floating damage messages are live. Attack/defend have visual feedback. Death, victory, and raid-specific animations still missing. **Alpha animation spec is now defined** — green lock-in aura (bright blink + 30% lingering), red last-player and ≤10s blinks, timer compression to 15s when one player remains, sword-swipe attack with reflect bounce-back, defender shield/smash/reflect animations, well-winner splash, and resource sprites (heart / coin / crossed swords at 61% of button width) rising over each resource button. See [§8.11 Combat Animations — Choice Phase, Lock-In & Action Resolution](#811-combat-animations--choice-phase-lock-in--action-resolution).
6. ~~**Lobby chat** — Players can text each other inside a lobby before and during a match.~~ ✅ **Done** — Full text chat integrated into `SceneOverlay.tsx`; collapsible 2-line panel (click to expand); 3D speech bubbles above player heads (4s duration); chat history polled from backend.
7. ~~**All in-game button labels are in English.**~~ ✅ **Done**
8. **Email service** — Email verification on signup, optional email-based login auth, username retrieval via email. Uses Resend as the mail provider. ❌ **Not started** — Emails are collected at signup but no verification or Resend integration exists.
9. **Invite link from lobby** — Players can invite friends directly from the lobby using a simple shareable link. ⚠️ **Partial** — Lobby ID is displayed in the waiting room (`LobbyOverlay.tsx`). Players can manually share the code, but there is no copy-to-clipboard button or shareable URL. Still needs a one-click copy/share button.
10. **Raid boss relic claiming** — When a player defeats a raid boss and earns a relic, they must choose: claim it by providing an email address (relic stored on account), or decline (no relic awarded). This encourages account creation for rare rewards. ❌ **Not started**
11. **Claimed name protection** — When a name is claimed (player has email on file), guests cannot use that name. They must either log in with the correct email or choose a different name. ❌ **Not started** — Currently any player can enter any name regardless of whether it's claimed.
12. **Session tokens for verified login** — Today the backend trusts whatever `{name, email}` the client sends, and both values live in `localStorage`. That's fine for the no-email and email-without-verification tiers (the player has opted into a low-friction tier), but it leaves the **always-verify-email** tier weaker than it should be: anyone who learns a streamer's name + email (doxx, breach, public profile) can impersonate them from any browser as long as the real player has verified "recently." The fix: when a player completes `/verify_code`, the backend generates a cryptographically random session token (e.g. `secrets.token_urlsafe(32)`), inserts a row into a `sessions` table `(token, player_id, created_at, expires_at)`, and returns it to the client. The frontend stores it as `localStorage.playerToken` and sends it alongside `{name, email}` on `/log_in`, `/create_lobby`, `join_lobby`, `claim_relic`, `change_email`, etc. The backend rejects any request from a verification-required account whose token is missing, expired, or doesn't match the row in `sessions`. To avoid hitting the DB on every action mid-game, the lobby loads the token once on join and caches it in lobby memory; subsequent in-lobby actions are validated against the cached copy. Tokens expire after ~30 days and `expires_at` bumps on use so active players don't get logged out. A "Log out everywhere" button in Settings deletes all rows for the player (forces re-verification on every device). Tiers stay opt-in: no-email and email-without-verification accounts work exactly as today, the token only becomes mandatory when always-verify-email is on. Known limitation: `localStorage` tokens are still readable by JS, so XSS or a malicious browser extension can still steal a session — same risk surface as today's name+email, but the token defends against the doxx-from-another-browser attack, which is the realistic threat. ❌ **Not started**

### Not required for Alpha (post-alpha)

- ~~World map and city system~~ ✅ **Done early** — 3D globe with city markers, Earth textures, Fresnel atmosphere, orbit controls, and city-specific overlays already built.
- City chat
- Matchmaking queues
- DLC — Road to Olympus
- Per-city themed arenas
- App Store / Steam distribution
- Purchasable stages

### Already built (not originally in alpha must-haves)

- ✅ **World map** — 3D globe with all 10 city markers, Earth textures (specular, bump, city lights, clouds), Fresnel atmosphere, orbit camera, starfield background.
- ✅ **Gremlin fight mode** — Dedicated forest scene with procedural gremlin model, cherub opponent, mushrooms/rocks/trees environment, and wooden signpost victory animation.
- ✅ **Multiple character models** — Cherub, Turtle, Ghost, PlayerV1 with smooth position interpolation.
- ✅ **Overlay theme system** — Themed UI overlays for lobby, home, world map, and gremlin mode.
- ✅ **Lobby chat** — Text chat in `SceneOverlay.tsx` with collapsible panel, 3D speech bubbles, and backend-polled message history.

---

## Table of Contents

1. [Vision & Current State](#1-vision--current-state)
2. [World Map — "The World That Meets You"](#2-world-map--the-world-that-meets-you)
3. [Cities & Locations](#3-cities--locations)
4. [Random Pop-Up Events](#4-random-pop-up-events)
5. [Stats System — Per-City & Per-Account](#5-stats-system--per-city--per-account)
6. [Matchmaking — Battle Royale & Team-Based](#6-matchmaking--battle-royale--team-based)
7. [DLC — "Road to Olympus"](#7-dlc--road-to-olympus)
8. [Combat Screen Overhaul](#8-combat-screen-overhaul)
9. [Chat System](#9-chat-system)
10. [Purchasable Stages (Merch)](#10-purchasable-stages-merch)
10A. [Skin Inventory, Trading & Friend System](#10a-skin-inventory-trading--friend-system)
11. [Distribution — App Stores & Steam](#11-distribution--app-stores--steam)
12. [Technical Architecture Changes](#12-technical-architecture-changes)
13. [Email Service](#13-email-service)
14. [Implementation Phases](#14-implementation-phases)

---

## 1. Vision & Current State

### Current State *(updated 2026-03-29)*

**Frontend (wom-mid):**
- Next.js 16 + React 19 + React Three Fiber web app (Turbopack)
- 3D world map (interactive globe with sacred city markers, Earth textures, atmospheric glow)
- Table-based lobby with multiple character models (Cherub, Turtle, Ghost, PlayerV1)
- Gremlin fight mode with dedicated forest scene, procedural gremlin model, and victory animation
- PvP lobby and boss raid modes
- **Socket.IO for real-time multiplayer** — state updates, action submission, and chat are all pushed via WebSocket (no polling)
- Overlay-based UI on top of 3D canvas with theme system
- Full lobby chat with 3D speech bubbles above player heads
- Leaderboard page (monthly + all-time)
- Vault unlock system
- Login/signup authentication
- Deployed on Netlify
- Web-only, no mobile or desktop distribution

**Backend (tjuvpakk-backend):**
- Modularized Flask server with Socket.IO support and Supabase
- In-memory lobby system with 40-second rounds
- Socket.IO event handlers for all in-game actions (state updates pushed to clients)
- Player accounts, stats (wins/kills/games/raid wins), relics, artifacts
- Leaderboards (monthly + all-time), but no city-level granularity
- No matchmaking — manual lobby creation/join only

### Alpha Vision

The alpha transforms the game from a single-scene lobby experience into a **living world** with 10 real-world sacred and mythological cities, each with its own identity, events, and stat tracking. Players navigate a world map, encounter gremlin events that teach game mechanics, queue for matches, and can purchase the **"Road to Olympus"** DLC story campaign. The combat screen becomes cinematic. The game ships on **iOS, Android, and Steam**.

---

## 2. World Map — "The World That Meets You"

The world map is the new home screen. Instead of landing on a temple with a table, the player enters a stylized 3D globe that they can navigate.

### 2.1 World Map UI

```
┌─────────────────────────────────────────────────────┐
│  [Player Avatar + Name]         [Settings] [Relics] │
│                                                      │
│              ~~~ MYTHOS WORLD MAP ~~~                │
│                                                      │
│                 Oslo 🏔️                              │
│                                                      │
│     Mecca 🕋          Jerusalem 🏛️    Xi'an 🏯      │
│                Athens 🏛️                             │
│                  (Crete: 💀 Styx)                    │
│                        Varanasi 🕉️     Tokyo ⛩️     │
│                                                      │
│     Cusco 🏔️                          Uluru 🪨      │
│                                                      │
│          🔥 House of Hades (Underworld) 🔥           │
│                                                      │
│  ┌──────────────────────────────────────────┐       │
│  │ 🔔 EVENT: A Gremlin has appeared in      │       │
│  │    Athens! Defeat it to learn the ropes. │       │
│  │                        [Go Now]          │       │
│  └──────────────────────────────────────────┘       │
│                                                      │
│  [Matchmaking]  [DLC: Road to Olympus]  [Leaderboards]│
└─────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

- **3D world map** rendered with React Three Fiber — stylized globe with city markers at real geographic positions
- Cities are clickable 3D landmarks (buildings, temples, glowing portals)
- Camera orbits the world; tapping a city zooms into it
- The map feels alive: clouds drift, water moves, ambient particles float
- Player avatar is shown on the map at their current "home city"
- Gremlin event banners pop up as toast notifications or floating markers on the map
- **Styx** stands on the coast of Crete — a ghostly Grim Reaper figure — as the entry point for the "Road to Olympus" DLC

### 2.3 Navigation Flow

```
World Map (home)
  ├─→ Tap City → City Hub Screen
  │     ├─→ Find Match (BR or Team)
  │     ├─→ City Leaderboards
  │     ├─→ City Events (active gremlin pop-ups)
  │     └─→ Back to Map
  ├─→ Tap Styx on Crete → DLC: Road to Olympus
  ├─→ Matchmaking Button → Queue Screen
  ├─→ Profile → Account Stats, Relics, Settings
  └─→ Event Banner → Jump to Gremlin Event
```

### 2.4 Frontend Components Needed

| Component | Description |
|-----------|-------------|
| `WorldMap.tsx` | Top-level 3D world map scene (globe with city markers) |
| `WorldMapOverlay.tsx` | UI layer: player info, nav buttons, event toasts |
| `CityMarker.tsx` | 3D clickable city on the map (building/portal model) |
| `StyxMarker.tsx` | DLC entry point — Styx character on the coast of Crete |
| `EventBanner.tsx` | Pop-up notification for gremlin events |
| `WorldMapCamera.tsx` | Orbit + zoom-to-city camera controller |

---

## 3. Cities & Locations

Each city is a real-world sacred or mythological location already stored in Supabase. Each has its own visual theme, lobby arena, and local leaderboard.

### 3.1 Cities (from Supabase)

| city_id | City | Country | Visual Style |
|---------|------|---------|-------------|
| 1 | **Mecca** | Saudi Arabia | Desert sands, golden minarets, warm light |
| 2 | **Jerusalem** | Israel | Stone walls, ancient gates, amber sunlight |
| 3 | **Athens** | Greece | White marble columns, open agora, blue sky |
| 4 | **Varanasi** | India | River ghats, temple steps, orange dawn |
| 5 | **Xi'an** | China | Terracotta guardians, red lanterns, mist |
| 6 | **Uluru** | Australia | Red desert, sacred rock, starry sky |
| 7 | **Cusco** | Peru | Mountain ruins, Incan stonework, thin air |
| 8 | **Oslo** | Norway | Viking longhouses, fjords, northern lights |
| 9 | **Tokyo** | Japan | Shinto gates, cherry blossoms, neon glow |
| 10 | **House of Hades** | Underworld | Cavern, river Styx, ghostly flames |

### 3.2 City Hub Screen

When a player taps a city on the world map, they zoom into its **City Hub**:

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Map                ATHENS                 │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ ⚔️ Find Match │  │ 🏆 City      │                │
│  │  (BR / Team) │  │  Leaderboard │                │
│  └──────────────┘  └──────────────┘                 │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ 🎪 Events    │  │ 📊 My City   │                │
│  │  (1 active)  │  │  Stats       │                │
│  └──────────────┘  └──────────────┘                 │
│                                                      │
│  [ 3D scene: Athens marble columns + agora ]         │
│                                                      │
│  Active Event: Gremlin — 2 players fighting          │
│                          [Join Event]                │
└─────────────────────────────────────────────────────┘
```

### 3.3 Frontend Components Needed

| Component | Description |
|-----------|-------------|
| `CityHub.tsx` | City-level hub with 3D preview + overlay |
| `CityScene.tsx` | Per-city 3D environment (reusable base with theme variants) |
| `CityLeaderboard.tsx` | City-scoped leaderboard display |
| `CityStats.tsx` | Player's stats in this specific city |
| `CityEventList.tsx` | Active gremlin events in this city |

### 3.4 Backend Requirements

- Existing `cities` table in Supabase with the 10 cities above
- Lobbies gain a `city_id` foreign key — every match belongs to a city
- `game_player_stats` gains a `city_id` column for per-city stat aggregation
- New endpoint: `GET /cities` — list all cities with active event counts
- New endpoint: `GET /cities/<city_id>/leaderboards` — city-scoped leaderboards
- New endpoint: `GET /cities/<city_id>/stats/<player_name>` — player stats in city

---

## 4. Random Pop-Up Events

For alpha, **two event types exist**: the Gremlin (tutorial encounter) and the **Hades Raid** (a real challenge).

### 4.1 Event Types (Alpha)

| Event | Description | Players | Duration | Reward | Purpose |
|-------|-------------|---------|----------|--------|---------|
| **Gremlin** | Solo or co-op fight vs a Gremlin | 1–4 | 5 min | Coins, small relic chance | Teaches attack/defend/resource mechanics |
| **Hades Raid** | Fight against Hades himself in the Underworld | 1–4 | ~10 min | Gold, exclusive Hades relic | Alpha's first real boss encounter — hard solo, trivial with friends |

The event system is built generically so more event types can be added later via Supabase.

### 4.2 Event Lifecycle

```
1. Backend scheduler picks a random city from the 10
2. A gremlin event is created with a start_time and expiry_time
3. All players on the world map see the event notification
4. Players in that city see it prominently in their City Hub
5. Players can join until the event starts or reaches max players
6. Event plays out using existing gremlin combat engine
7. Rewards distributed; event removed from active list
```

### 4.3 Event Spawn Rules

- Gremlins spawn on a randomized timer (e.g., every 5–15 minutes, random city)
- Max 1 active event per city at a time
- Events that aren't joined by anyone expire silently
- The existing `/create_gremlin_lobby` + `GremlinScene` is the foundation — wrap it in the event system

### 4.4 Backend Requirements

- New `events` table: `id`, `city_id`, `event_type`, `status` (pending/active/completed/expired), `start_time`, `expiry_time`, `lobby_id`, `max_players`, `reward_config`
- Background scheduler (timer thread) to spawn gremlin events in random cities
- New endpoints:
  - `GET /events/active` — all active gremlin events across all cities
  - `GET /cities/<city_id>/events` — active events in a specific city
  - `POST /events/<event_id>/join` — join a gremlin event (creates/joins its lobby)
- Events reuse the existing lobby + gremlin combat engine; the `lobby` row just has `event_id` set

### 4.5 Frontend Components Needed

| Component | Description |
|-----------|-------------|
| `EventToast.tsx` | Pop-up notification on world map |
| `EventDetail.tsx` | Event info + join button (works for both gremlin and Hades Raid) |
| `EventTimer.tsx` | Countdown to event start/expiry |
| `EventRewards.tsx` | Post-event reward summary |

---

### 4.6 Hades Raid *(Alpha — required)*

The Hades Raid is the alpha's signature encounter. It spawns in the **House of Hades** city and pits players against Hades — the god of the Underworld. Hades is a **fixed opponent**: his stats do not change based on how many players join. The difficulty difference between solo and co-op emerges naturally from having more players contributing attacks each round.

#### Starting conditions

- **Each player:** 10 HP, 1 weapon, 0 gold — the same as any other match
- **Hades:** 8 HP, 2 attack damage (fixed, regardless of player count)

There is no artificial scaling. More players win more easily simply because they deal more combined damage.

#### Hades AI

For alpha, Hades uses the **existing rule-based boss AI** — the same system used by all bosses. He always attacks the strongest living player and upgrades his attack when he has enough gold. This is sufficient for a playable alpha experience.

A trained AI (self-play, win-rate targets) is a post-alpha consideration and requires significant ML infrastructure that is out of scope for the initial release.

#### Scene

The Hades Raid uses the **House of Hades arena** — the Underworld cavern with river Styx, ghostly flames, and stalactites. Hades appears as a large figure across the table where other players normally sit.

#### Reward

Defeating Hades grants:
- A gold reward
- Chance to earn the **Hades Relic**
- `raid_wins` stat increment (already tracked in backend)

#### Spawn rules

- Spawns exclusively in **House of Hades** city
- Spawns less frequently than Gremlins (e.g., once every 30–60 minutes)
- Max 1 active Hades Raid globally at a time
- Distinct visual treatment in world map notifications (red/purple, skull icon) to set it apart from Gremlin events

---

### 4.7 Raid Boss Relic Claiming

When a player defeats a raid boss (Hades or any future boss) and earns a relic drop, the relic is **not automatically awarded**. Instead, a dialog prompts the player to choose:

#### Claim Relic Dialog

```
┌──────────────────────────────────────────┐
│                                           │
│  🏆 RELIC EARNED!                        │
│                                           │
│  You have earned the Hades Relic!        │
│  "Forged in the flames of the Underworld"│
│                                           │
│  To keep this relic, claim your name     │
│  with an email address:                  │
│                                           │
│  ┌──────────────────────────────┐        │
│  │ your.email@example.com       │        │
│  └──────────────────────────────┘        │
│                                           │
│  [Claim Relic]     [No Thanks]           │
│                                           │
└──────────────────────────────────────────┘
```

**Behaviour:**
- Shown immediately after a raid boss is defeated, if a relic was dropped
- **"Claim Relic"**: player enters an email address → `POST /claim_relic` → relic stored on account. If the player doesn't have an account yet, one is created (name + email).
- **"No Thanks"**: dialog closes, no relic is awarded, player continues as guest
- This creates a natural incentive for players to claim names / create accounts

#### Frontend Components

| Component | Description |
|-----------|-------------|
| `ClaimRelicDialog.tsx` | Modal shown after raid boss defeat when a relic is available; email input + claim/decline buttons |

### 4.8 Claimed Name Protection

When a player has claimed a name with an email address, that name is reserved. If another player tries to use a claimed name without logging in, they are blocked.

#### Name Taken Dialog

```
┌──────────────────────────────────────────┐
│                                           │
│  ⚠️ NAME TAKEN                           │
│                                           │
│  The name "Spartan99" has already been   │
│  claimed by another player.              │
│                                           │
│  If this is your name, log in with       │
│  your email to continue.                 │
│                                           │
│  [Go to Login]    [Choose Another Name]  │
│                                           │
└──────────────────────────────────────────┘
```

**Behaviour:**
- Shown when a player tries to join a lobby, create a lobby, or perform any action with a name that exists in the database with a non-null email
- **"Go to Login"**: navigates to the login page, pre-fills the name field
- **"Choose Another Name"**: returns to the name entry screen so the player can pick a different name
- The backend returns `{ error: "name_claimed" }` which the frontend interprets to show this dialog

#### Frontend Components

| Component | Description |
|-----------|-------------|
| `NameTakenDialog.tsx` | Modal shown when a claimed name is used without authentication; offers login or name change |

---

## 5. Stats System — Per-City & Per-Account

### 5.1 Current State

The backend tracks:
- **Per-account (global):** wins, kills, games_played, raid_wins in the `players` table
- **Per-game:** individual game records in `game_player_stats` with timestamps

### 5.2 Alpha Design

Stats are tracked at **three levels**:

```
Account Level (global)
  ├─ Total wins, kills, games, raid wins
  ├─ Total relics collected
  ├─ DLC progress (Road to Olympus chapters completed)
  └─ Achievements

City Level (per city — across all 10 cities)
  ├─ Wins in this city
  ├─ Kills in this city
  ├─ Games played in this city
  ├─ Raid wins in this city
  ├─ Gremlin events completed in this city
  └─ City rank (derived from city stats)

Game Level (per match)
  └─ (already exists — add city_id)
```

### 5.3 Leaderboard Views

| View | Scope | Description |
|------|-------|-------------|
| **Global All-Time** | All cities, all time | Existing leaderboard |
| **Global Monthly** | All cities, current month | Existing leaderboard |
| **City All-Time** | One city, all time | New — top players in that city |
| **City Monthly** | One city, current month | New — monthly city rankings |

### 5.4 Backend Changes

- Add `city_id` column to `game_player_stats`
- Add `city_stats` table (or compute from `game_player_stats` with city_id filter):
  - `player_name`, `city_id`, `wins`, `kills`, `games_played`, `raid_wins`, `events_completed`
- Update `/leaderboards` endpoint to accept `?city_id=X` filter
- New endpoint: `GET /players/<name>/city_stats` — all city breakdowns for a player
- Ensure all lobby creation endpoints accept and store `city_id`

### 5.5 Frontend Components

| Component | Description |
|-----------|-------------|
| `GlobalLeaderboard.tsx` | Full leaderboard with city filter dropdown |
| `CityLeaderboard.tsx` | City-scoped leaderboard (reuse from City Hub) |
| `PlayerProfile.tsx` | Player stats overview — global + per-city breakdown |
| `StatCard.tsx` | Reusable stat display (wins, kills, etc.) |

---

## 6. Matchmaking — Battle Royale & Team-Based

### 6.1 Current State

There is no matchmaking. Players manually create lobbies and share codes, or join the scheduled boss raid.

### 6.2 Alpha Matchmaking Design

Two queue types, both city-aware:

#### Battle Royale (Free-for-All)
- Queue up in a city
- System groups 4 players into a lobby
- Same combat rules as current PvP lobbies
- Match takes place "in" the queued city (city_id assigned)

#### Team-Based (2v2)
- Queue up with or without a partner
- System creates 2v2 lobbies
- Teams share information and coordinate
- New combat rules: team HP pool or shared targeting

### 6.3 Matchmaking Flow

```
Player opens Matchmaking (from city hub or world map)
  → Selects mode: Battle Royale / Team Battle
  → (Team Battle only) Invite friend or queue solo
  → Enters queue with city preference
  → Backend groups players when enough are queued
  → Lobby created, all players redirected
  → Match plays out in the chosen city's arena
```

### 6.4 Queue UI

```
┌─────────────────────────────────────────────────────┐
│  MATCHMAKING                              [Cancel]   │
│                                                      │
│  Mode: [⚔️ Battle Royale]  [🛡️ Team Battle]         │
│                                                      │
│  City: [Any] [Mecca] [Jerusalem] [Athens] [Varanasi] │
│        [Xi'an] [Uluru] [Cusco] [Oslo] [Tokyo]       │
│        [House of Hades]                              │
│                                                      │
│  ┌──────────────────────────────────────────┐       │
│  │    Searching for opponents...            │       │
│  │    ████████░░░░░░░░  2/4 players         │       │
│  │    Estimated wait: —                     │       │
│  └──────────────────────────────────────────┘       │
│                                                      │
│  (Team Battle) Your team:                            │
│    • You (ready)                                     │
│    • [Invite Friend] or [Fill with random]           │
└─────────────────────────────────────────────────────┘
```

### 6.5 Backend Requirements

**New matchmaking system** (can start simple):

- **Queue storage**: In-memory dict keyed by `(mode, city_id)` → list of waiting players
- **Matcher loop**: Background thread checks queues every 2–3 seconds
  - BR: when 4+ players in a queue → create lobby, notify
  - Team: when 4+ players (2 teams) → create lobby, assign teams
  - "Any city" players can be matched into any city queue that needs them
- **Team assignment**: New field on player object in lobby: `team` (1 or 2)
- **Team combat rules**: Players on the same team cannot attack each other; last team standing wins

**New endpoints:**
- `POST /matchmaking/join` — join queue (body: `mode`, `city_id`, `team_partner` optional)
- `POST /matchmaking/leave` — leave queue
- `GET /matchmaking/status` — check queue position, matched lobby id
- Lobby state gains `teams_enabled` boolean and player objects gain `team` field

**New DB requirements:**
- `game_player_stats` gains `mode` column (`ffa` / `team`) for leaderboard filtering

### 6.6 Frontend Components

| Component | Description |
|-----------|-------------|
| `MatchmakingScreen.tsx` | Mode selection, city filter, queue status |
| `QueueStatus.tsx` | Animated waiting indicator with player count |
| `TeamInvite.tsx` | Invite friend / fill with random UI |
| `TeamIndicator.tsx` | In-lobby team assignment display |

---

## 7. DLC — "Road to Olympus"

### 7.1 Concept

On the world map, a ghostly character called **Styx** stands on the coast of **Crete** (near Athens, but separate from any city marker). Styx looks like the Grim Reaper. If the player has purchased the DLC, Styx carries them across the sea to a **tower rising from the water**.

**Motivation**: Styx tells the player he can help save the world — inside the tower, the goddess **Hera** can transport them to **Zeus** at the top. But the player must climb the tower themselves.

### 7.2 Tower Structure

The DLC is a linear tower climb with encounters and narrative between them:

```
┌─────────────────────┐
│     ⚡ ZEUS ⚡       │  ← Final Boss: Zeus at the summit
│   (Tower Summit)    │
├─────────────────────┤
│   Hera transports   │  ← Hera moves you from mid-tower to the top
│   you upward        │
├─────────────────────┤
│   🎭 JANUS 🎭       │  ← Mid-Boss: Two-faced God (CO-OP REQUIRED)
│   (Mind Tricks)     │     Fight revolves around deception mechanics
├─────────────────────┤
│   Lower Tower       │  ← Encounters + narrative as you ascend
│   (Climb begins)    │
├─────────────────────┤
│   💀 STYX 💀        │  ← Entry: Styx carries you here from Crete
│   (Tower Base)      │
├─────────────────────┤
│   🌊 Sea 🌊         │
└─────────────────────┘
```

### 7.3 Boss: Janus (Mid-Tower) — Co-op Required

Janus is the two-faced God of transitions, doorways, and duality. This fight **requires a friend** (2-player co-op mandatory).

**Mind Trick Mechanics:**
- **Hidden choices**: Both players choose actions simultaneously, but Janus can mirror or swap their targeting
- **Deception rounds**: What's displayed on screen may not match the actual action that executes
- **Mirrored actions**: Janus can cause one player's action to affect the other player instead
- **Two faces**: Each face has different weaknesses — players must coordinate which face to attack

This fight teaches players coordination, trust, and the importance of communication.

### 7.4 Boss: Zeus (Summit) — Final Boss

Zeus awaits at the top of the tower. Uses the existing boss combat engine with unique mechanics (lightning-themed). Details TBD — to be defined when boss mechanics are designed.

### 7.5 Usable Rewards

DLC relics from bosses grant passive bonuses in **regular matches** (not just DLC):

| Relic | Source | Effect |
|-------|--------|--------|
| TBD | Janus | TBD — related to deception/duality |
| TBD | Zeus | TBD — related to lightning/power |

- Only **one relic** can be equipped at a time for balance
- Relics are usable in all game modes (PvP, events, boss raids)

### 7.6 DLC UI

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Map         ROAD TO OLYMPUS              │
│                                                      │
│  [ Atmospheric illustration: tower in the sea,      │
│    Styx's boat approaching from Crete ]              │
│                                                      │
│  🏗️ Tower Progress:                                  │
│  ┌────────────────────────────────────────┐          │
│  │ ⚡ Zeus (Summit)              🔒 Locked │          │
│  │ 🏛️ Hera's Transport          🔒 Locked │          │
│  │ 🎭 Janus (Co-op Required)    🔓 Next   │          │
│  │ 🗡️ Lower Tower               ✅ Done   │          │
│  │ 💀 Styx's Crossing            ✅ Done   │          │
│  └────────────────────────────────────────┘          │
│                                                      │
│  ┌──────────────────────────────────────────┐       │
│  │ Next: Janus — The Two-Faced God         │       │
│  │                                           │       │
│  │ "Two faces watch from the shadows.       │       │
│  │  You cannot face this alone..."          │       │
│  │                                           │       │
│  │ ⚠️ Requires 1 friend to proceed          │       │
│  │                                           │       │
│  │ [Invite Friend]  [Continue Solo ✗]       │       │
│  └──────────────────────────────────────────┘       │
│                                                      │
│  YOUR DLC RELICS:                                    │
│  (None yet — defeat bosses to earn relics)           │
└─────────────────────────────────────────────────────┘
```

### 7.7 Backend Requirements

- New `dlc` table: `id`, `title`, `description`, `price_cents`
- New `dlc_chapters` table: `id`, `dlc_id`, `chapter_number`, `title`, `narrative_text`, `encounters` (JSON), `requires_coop` (boolean)
- New `dlc_progress` table: `player_name`, `dlc_id`, `chapter_number`, `completed`, `completed_at`
- New `dlc_relics` table: `id`, `name`, `dlc_id`, `effect_type`, `effect_value`, `flavour_text`
- New `equipped_relic` column on `players` table (nullable FK to relic)
- Janus encounter: lobby must have 2+ players (co-op enforced server-side)
- **Janus mind trick action system**: hidden choices revealed simultaneously, mirrored/swapped targeting, deception rounds where displayed actions may not match actual actions
- Combat engine updated: check equipped relic and apply passive effect at round start
- New endpoints:
  - `GET /dlc/<dlc_id>` — DLC info + player progress
  - `POST /dlc/<dlc_id>/chapter/<num>/start` — start encounter (creates lobby with DLC boss config)
  - `POST /dlc/<dlc_id>/chapter/<num>/complete` — mark chapter done, award relic
  - `POST /players/<name>/equip_relic` — equip a DLC relic
  - `GET /players/<name>/equipped_relic` — check equipped relic
- Purchase verification: for alpha, a simple `dlc_owned` boolean on `players` table (real IAP validation comes later)

### 7.8 Frontend Components

| Component | Description |
|-----------|-------------|
| `DLCScreen.tsx` | DLC overview — Styx illustration, tower progress, chapter list |
| `TowerProgress.tsx` | Visual tower climb progress indicator |
| `NarrativePanel.tsx` | Story text display between encounters |
| `RelicEquip.tsx` | Relic selection and equip UI |
| `DLCBossScene.tsx` | Custom 3D boss environments (Janus arena, Zeus arena) |

---

## 8. Combat Screen Overhaul

### 8.1 Current State

The combat (lobby) screen is functional but static:
- Players are shown as small 3D models standing at a table
- Actions are submitted via overlay buttons
- Results are shown as text messages
- No attack animations, no VFX on hit, no dynamic camera

### 8.2 Alpha Combat Vision

The combat screen should feel **alive and cinematic**.

### 8.3 Visual Improvements

| Element | Current | Alpha Target |
|---------|---------|-------------|
| **Player models** | Static, same model | Idle animation loop, distinct skins per city |
| **Attack** | Text message only | Slash VFX + camera shake + damage number popup |
| **Defend** | Text message only | Shield dome VFX + block sound cue |
| **Raid** | Text message only | Glowing raid circle + energy beam to boss |
| **Taking damage** | Text message only | Red flash on player model + knockback |
| **Death** | Model grays out | Death animation + dissolve particles |
| **Win** | Crown emoji in overlay | Victory pose + spotlight + confetti particles |
| **Round transition** | Instant | Brief "Round X" title card with swoosh |
| **Timer** | Overlay text | 3D floating timer above table, pulses red when low |
| **Boss entrance** | Instant appear | Camera pan + boss intro animation + name title |

### 8.4 Camera System

```
Default: Fixed angle slightly above and behind "your" player
Round start: Brief zoom-out to show all players
Attack happens: Quick cut to attacker → target (like a fighting game)
Boss attack: Camera shakes
Game over: Slow orbit around winner
```

### 8.5 Execution Phase — Blackout

When **all players have submitted their choices**, the scene cuts to black before the results play out. This is the moment between choosing and seeing what happens.

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│                                                      │
│                   ████████████                       │
│                   (full black)                       │
│                                                      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Screen fades to **full black** — no HUD, no characters, no buttons
- **Audio plays in the background**: sounds of what's happening (slash, impact, shield clang, death thud, etc.) play sequentially as the actions are resolved server-side
- The sequence of sounds gives the players a sense of what happened before they see it
- After the audio sequence (~1.5–3 seconds depending on how many events occurred), the screen fades back in
- The scene is updated to reflect the round results: HP changes, dead characters in death pose, etc.
- A brief round summary or floating damage numbers confirm what happened

**Audio sequence during blackout (example):**
```
Round submitted by all →
  [fade to black]
  → slash sound (attack)
  → impact sound (hit)
  → shield clang (defend)
  → low thud + echo (death)
  [fade back to scene]
  → round log updates + damage numbers float
```

This creates suspense and makes the resolution feel dramatic rather than instant.

### 8.6 Audio Cues (Minimum Viable)

| Event | Sound |
|-------|-------|
| Round start | Drum beat |
| Attack | Slash/impact |
| Defend | Shield clang |
| Death | Low thud + echo |
| Victory | Fanfare |
| Timer low | Ticking |
| Event popup | Chime |

### 8.7 Combat HUD Redesign — Table-Centric Interaction

**Core principle:** There is no separate action menu panel. All choices are made by clicking on 3D elements in the scene. Buttons float as overlays anchored to characters and the table.

#### Layout during the choice phase

```
┌─────────────────────────────────────────────────────┐
│                 Round 3    ⏱ 0:24                   │
│                                                      │
│      [P2 name]                    [P3 name]          │
│       ❤ 5  ⚔ 3                    ❤ 3  ⚔ 1         │
│   ┌──────────┐                ┌──────────┐           │
│   │ CHERUB   │                │ CHERUB   │           │
│   │  (sits)  │                │  (sits)  │           │
│   └──────────┘                └──────────┘           │
│  [  Attack  ]                [  Attack  ]            │
│   (on P2)                     (on P3)                │
│                                                      │
│                  ╔══════════╗                        │
│                  ║  THE     ║                        │
│                  ║  WELL    ║  ← click = Raid        │
│                  ╚══════════╝                        │
│                                                      │
│   ┌──────────┐                                       │
│   │ CHERUB   │  ← your character                     │
│   │  (sits)  │                                       │
│   └──────────┘                                       │
│  [  Defend  ]  ← button on your own character        │
│  [Get Life] [Get Gold] [Upgrade Strength]            │
│   ↑ secondary actions, in a row below Defend         │
│                                                      │
│      [P4 name]                                       │
│       ❤ 8  ⚔ 2                                      │
│   ┌──────────┐                                       │
│   │ CHERUB   │                                       │
│   └──────────┘                                       │
│  [  Attack  ]                                        │
│                                                      │
│  [Round log — collapsible, bottom edge]              │
└─────────────────────────────────────────────────────┘
```

#### Interaction rules

| What you click | Action triggered |
|----------------|-----------------|
| **"Attack" button on an enemy character** | Selects that player as your attack target and submits Attack |
| **"Defend" button on your own character** | Submits Defend |
| **The Well (center of table)** | Submits Raid |
| **"Get Life" (below Defend)** | Submits resource choice: HP |
| **"Get Gold" (below Defend)** | Submits resource choice: Gold |
| **"Upgrade Strength" (below Defend)** | Submits resource choice: Attack power |

- During the choice phase, **Attack buttons appear on all living enemy characters**
- **Defend** and the three **secondary action** buttons appear below your own character only
- **The Well** is always visible in the center of the table; it is the Raid button
- Once you have submitted a choice, all buttons grey out until the next round
- Dead characters show no buttons; their model plays the death animation and stays visible

#### Button language
All button labels are in **English** regardless of the player's language.

### 8.8 Per-City Themed Arenas

Each of the 10 cities has a distinct arena environment:

| City | Arena Theme |
|------|-------------|
| Mecca | Desert sands, golden pillars |
| Jerusalem | Ancient stone walls, warm amber light |
| Athens | Marble columns, open-air agora |
| Varanasi | River ghats, temple backdrop |
| Xi'an | Terracotta army, red pillars |
| Uluru | Red desert, sacred rock formation |
| Cusco | Mountain ruins, Incan stonework |
| Oslo | Viking longhouse, aurora backdrop |
| Tokyo | Shinto shrine, cherry blossoms |
| House of Hades | Cavern, ghostly flames, river Styx |

### 8.9 Frontend Components

| Component | Description |
|-----------|-------------|
| `CombatScene.tsx` | New arena 3D scene (per-city themed) |
| `PlayerModel.tsx` | Angel-cherub model with idle/sitting/attack/defend/death animations |
| `PlayerButtons.tsx` | Overlay buttons anchored to a character (Attack / Defend + secondaries) |
| `TheWell.tsx` | 3D well in the center of the table; clickable Raid button |
| `SlashVFX.tsx` | Attack visual effect (particle slash arc) |
| `ShieldVFX.tsx` | Defend visual effect (translucent dome) |
| `DamageNumber.tsx` | Floating damage number that pops up and fades |
| `RoundTitle.tsx` | "Round X" title card with animation |
| `CombatHUD.tsx` | Minimal HUD: round, timer, round log |
| `CombatCamera.tsx` | Cinematic camera controller with attack cuts |
| `DeathEffect.tsx` | Dissolve/shatter particle effect |
| `VictoryEffect.tsx` | Confetti + spotlight for winner |

### 8.10 Character Model — Angel Cherub

> **Status: Done.** Multiple character models are integrated: Cherub (`cherub-v01.glb`), Turtle (`turtlev01.glb`), Ghost (`ghost.glb`), and PlayerV1 (`playerv1.glb`). Models are loaded via `useGLTF` and positioned around the table. Animations (sitting, attack, death, victory) are still needed.

#### Model specifications

| Property | Detail |
|----------|--------|
| **Base model** | Angel-cherub (3D generated) |
| **Alpha skin** | Same model for all players in alpha; skins/cosmetics post-alpha |
| **Idle / lobby** | Sitting animation — character sits at the table during lobby and choice phases |
| **Death** | Death animation — plays when player is eliminated; model stays visible at table (greyed / slumped) |
| **Attack** | Attack animation — plays when this player's attack resolves |
| **Defend** | Block/brace animation — plays when defend resolves |
| **Victory** | Victory pose — plays for the winning player at game over |

#### Integration

- Model loaded via React Three Fiber / `@react-three/fiber` + `@react-three/drei` (`useGLTF` or `useFBX`)
- Animations driven by `AnimationMixer`; state machine maps game events → animation clips
- Positioned around the table using fixed seat positions (same as existing `PlayersAtTable` layout)
- HTML overlay buttons (`PlayerButtons.tsx`) are positioned in screen space relative to each character's 3D position using `Html` from `@react-three/drei`

### 8.11 Combat Animations — Choice Phase, Lock-In & Action Resolution

This section specifies the animations required for the alpha. They are split into three groups:

1. **Lock-in feedback** (choice phase) — auras around players as they submit/withhold choices.
2. **Action animations** (resolution) — what plays when Attack / Defend / Raid (the well) resolves.
3. **Resource animations** (resolution) — what plays on the resource buttons when Get HP / Get Gold / Upgrade is chosen.

All animations are **visible to every player** (not only the acting player), unless explicitly stated.

#### 8.11.1 Lock-in aura (player has chosen both resource and action)

A player must select two things to be considered "locked in":
- **Resource** — Get HP, Get Gold, or Upgrade Weapon
- **Action** — Attack, The Well (Raid), or Defend

When both are selected and submitted:

| Phase | Visual |
|-------|--------|
| **Initial blink** | A bright **green aura** flashes around the player |
| **Lingering aura** | After the blink, a **weak green aura at ~30% of the initial strength** remains around the player for the rest of the choice phase |

This aura is shown to **all players**, so everyone can see who has already locked in.

#### 8.11.2 Last-player red aura (everyone except one is locked in)

When **all players except one** have locked in both choices, the remaining player is highlighted with a red aura, on every player's screen:

| Phase | Visual |
|-------|--------|
| **First blink** | A **strong red aura blink** around the unlocked player (one-time emphasis pulse) |
| **Subsequent blinks** | Continues to blink at **~50% of the original strength** until that player locks in |

#### 8.11.3 Low-time red aura (≤10 seconds left)

When a player still has not locked in and the round timer is at **10 seconds or less**, the same red blinking aura is shown around that player. **The strong initial blink is omitted** — only the recurring 50%-strength blinks play.

If both conditions trigger (last-player and low-time), the strong initial blink is only used once — for the last-player trigger.

#### 8.11.4 Timer compression on last-player

When all players except one have locked in their actions:
- **The round timer immediately drops to 15 seconds** if the current value is higher than 15.
- If the timer is already at or below 15, it is **left untouched**.

This is a one-shot adjustment at the moment the second-to-last player locks in.

#### 8.11.5 Action animations (start of resolution)

These play at the start of the turn resolution for any player whose action was Attack, The Well, or Defend.

##### Attack

Played on the **target's** position:

1. A **sword appears next to the target** and performs a **swipe** animation.
2. **If the attack lands** (no successful block, no reflect):
   - The target **blinks red**.
   - **Blood squirts** from the target.
3. **If the target defends and successfully blocks**:
   - A **shield pops up** in front of the target (block-success animation).
4. **If the target defends and reflects**:
   - The sword **bounces off the shield** and travels back onto the **attacking player**, who then takes the hit (red blink + blood squirt on the original attacker).

##### The Well (Raid)

- The **winner of the well** sees a **splash from the well** play on their screen (and on all other players' screens, since well winners are public).
- Losers/non-winners do not get the splash.

##### Defend

Played on the **defending player's** position. One animation pass per incoming attacker:

1. A **sword for each attacker** swipes onto the defender's **shield**.
2. **If the attack goes through** (block failed):
   - The defender **blinks red** and **blood squirts**.
3. **If the attack is blocked**:
   - A **smash animation of the sword on the shield** plays.
4. **If the attack is reflected**:
   - The sword **flies back to the attacker**, who then takes the hit.
   - **Frontend dependency:** the frontend must know **who the attacker was** for every reflect, so the sword can return to the correct character. The lobby/round payload must include attacker identity on every reflect outcome (currently this information is not always exposed to the defender — backend/payload change required).

#### 8.11.6 Resource animations (resolution)

Each resource animation plays as a sprite/GIF that **rises out of the corresponding button**, simultaneously **shrinking and fading away**.

| Resource | Sprite | Notes |
|----------|--------|-------|
| **Get HP** | Small heart | Appears at the bottom of the **Get Life** button, rises up over the button, shrinks and fades simultaneously |
| **Get Gold** | Coin | Same animation as the heart, on the **Get Gold** button |
| **Upgrade Weapon** | Two crossed swords (GIF: the front and back swords swap places on each frame) | Same animation, on the **Upgrade Strength** button |

##### Sprite sizing

- **Width:** **61% of the button width**
- **Height:** equal to the width (i.e. **same as the heart's height = 61% of the button width**) — applies to **all three** resource sprites (heart, coin, swords)

##### Animation curve

- Sprite spawns at the **bottom edge** of its button at full opacity and full size.
- It travels **upward across/over the button**, while **scale shrinks toward 0** and **opacity fades to 0** simultaneously.
- The animation finishes when the sprite is fully transparent (and effectively zero-sized) above the button.

#### 8.11.7 Scope statement

> **This is sufficient animation work for the alpha.** Death dissolves, victory confetti, boss intros, etc. listed in §8.3/§8.9 are still desired but are not blockers for the alpha if 8.11 is implemented.

---

## 9. Chat System

> **Alpha priority:** Only **lobby chat** is required for alpha. City chat requires the city system (post-alpha) and should be deferred. Lobby chat must be shipped with the playable alpha.

Two chat scopes exist in the full plan: **city chat** (global per city) and **lobby chat** (per match).

### 9.1 City Chat *(post-alpha — requires city system)*

Every city has a persistent, scrolling text chat visible in the **City Hub**. This is how players in the same city communicate, coordinate events, find teammates, and socialise.

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Map                ATHENS                 │
│                                                      │
│  ┌──────────────────────────────────────────┐       │
│  │ CITY CHAT                        [Hide]  │       │
│  │                                           │       │
│  │ Spartan99: anyone up for a gremlin?      │       │
│  │ MythosKing: gg last match                │       │
│  │ You: omw to the event                    │       │
│  │                                           │       │
│  │ [Type a message...]            [Send]     │       │
│  └──────────────────────────────────────────┘       │
│                                                      │
│  [Find Match]  [Events]  [Leaderboard]  [Stats]     │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Messages are scoped to the city — only players currently in or viewing this city see them
- Recent message history loaded on entering the city (last 50 messages)
- Messages auto-scroll; player can scroll up to read history
- Collapsible / hideable so it doesn't dominate the screen
- Simple text only (no images, no links) for alpha
- Basic spam prevention: rate limit (e.g., 1 message per 2 seconds per player)

### 9.2 Lobby Chat *(Alpha — required)*

Every active lobby has its own chat. The chat is accessed via a **corner button** that opens an overlay — it does not live permanently in the HUD. When a player sends a message, a **speech bubble appears above their 3D character** in the scene so other players can see it without opening the overlay.

#### Corner button + overlay

```
┌─────────────────────────────────────────────────────┐
│                 Round 3    ⏱ 0:24         [💬]      │  ← corner button
│                                                      │
│    (3D scene — characters, well, action buttons)    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

When [💬] is tapped, a chat overlay slides in **without covering the action buttons**:

```
┌─────────────────────────────────────────────────────┐
│                 Round 3    ⏱ 0:24         [💬 ✕]   │
│                                                      │
│  (3D scene still visible behind overlay)            │
│                                                      │
│                        ┌──────────────────────────┐ │
│                        │ CHAT               [✕]   │ │
│                        │                           │ │
│                        │ P1: attacking P3          │ │
│                        │ P2: I'll defend           │ │
│                        │ You: raiding the boss     │ │
│                        │                           │ │
│                        │ [Type...] [To: All▼][Send]│ │
│                        └──────────────────────────┘ │
│                                                      │
│  [  Defend  ]   [Get Life] [Get Gold] [Upg. Str.]   │ ← still reachable
└─────────────────────────────────────────────────────┘
```

- The overlay is **anchored to one side** (e.g., right edge) so it never covers your own character's action buttons
- The overlay can be closed with [✕] or by clicking outside it
- The corner button shows a **notification dot** when new messages arrive while the overlay is closed

#### Speech bubbles in 3D

When a player sends a message, a speech bubble appears above their character in the scene — visible to everyone without opening the overlay:

- Bubble fades out after ~3 seconds
- Shows the first ~30 characters; longer messages are truncated with "…"
- Whispers do NOT show as speech bubbles (they are private)
- `SpeechBubble.tsx` rendered using `Html` from `@react-three/drei`, anchored above each character

**Behaviour:**
- Messages are scoped to the lobby — only players in this match see them
- Chat persists for the duration of the match; cleared when lobby is destroyed
- Especially important for **team battles** (2v2) and **DLC co-op** (Janus fight)
- In team mode, an option to toggle between "team only" and "all" chat

### 9.3 Whisper (Free-for-All)

In free-for-all lobbies, players can **whisper** — send a private message to one specific player that nobody else in the match can see. This enables secret alliances, betrayals, and tactical coordination.

```
┌──────────────────────────────────────────┐
│ LOBBY CHAT                    [All ▼]    │
│                                           │
│ P1: anyone want to team up?              │
│ [whisper from P2]: let's hit P3 together │
│ You → P2: deal, I'll attack P3           │
│                                           │
│ [Type a message...]  [To: All ▼] [Send]  │
└──────────────────────────────────────────┘
```

**Behaviour:**
- Player selects a target from a dropdown: "All" (default) or a specific player name
- Whisper messages are only visible to the sender and the recipient
- Whispers are styled differently (e.g., italic, different colour) so they stand out
- Other players have no indication that a whisper was sent
- Adds a social/strategic layer to free-for-all: make temporary alliances, coordinate attacks, or bluff

### 9.4 Chat Modes Summary

| Mode | Scope | Visibility | Available in |
|------|-------|------------|-------------|
| **City chat** | Per city | All players in that city | City Hub |
| **All chat** | Per lobby | All players in the match | All lobby types |
| **Team chat** | Per lobby | Only your team | Team Battle (2v2) |
| **Whisper** | Per lobby | Only you and one target player | Free-for-All |

### 9.5 Frontend Components

| Component | Description |
|-----------|-------------|
| `ChatToggleButton.tsx` | Corner button (💬) that opens/closes the chat overlay; shows notification dot on new messages |
| `ChatOverlay.tsx` | Slide-in chat panel anchored to one screen edge; never covers action buttons |
| `ChatMessage.tsx` | Single message row (player name + text + timestamp + whisper styling) |
| `ChatInput.tsx` | Text input with target selector dropdown (All / specific player) and Send button |
| `SpeechBubble.tsx` | 3D speech bubble above a character's head (`Html` from drei); fades after ~3 seconds |

### 9.6 Backend Requirements

- **City chat**: Stored in Supabase for persistence — `chat_messages` table with `city_id`, `player_name`, `message`, `created_at`
- **Lobby chat**: Stored in-memory (part of lobby state) — no persistence needed since lobbies are temporary
- **Whisper**: `POST /lobby/<id>/chat` accepts optional `target_player` field. When set, the message is only returned to the sender and that specific player on `GET /lobby/<id>/chat`.
- **Delivery method**: For alpha, use polling (fetch new messages every 2–3 seconds). Can upgrade to SSE or WebSockets later.
- New endpoints:
  - `GET /cities/<city_id>/chat` — fetch recent city chat messages (last 50)
  - `POST /cities/<city_id>/chat` — send a city chat message
  - `GET /lobby/<lobby_id>/chat?player_name=X` — fetch lobby chat messages visible to this player (filters out whispers not addressed to them)
  - `POST /lobby/<lobby_id>/chat` — send a lobby chat message (body: `player_name`, `message`, optional `target_player` for whisper, optional `team_only` for team chat)
- Rate limiting: max 1 message per 2 seconds per player
- Message length limit: 200 characters

### 9.7 Database

```sql
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    city_id INT REFERENCES cities(id),
    player_name TEXT REFERENCES players(name),
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chat_city_time ON chat_messages(city_id, created_at DESC);
```

Lobby chat does not need a table — it lives in the in-memory lobby dict alongside player actions and round state.

---

## 10. Purchasable Stages (Merch)

### 10.1 Concept

When players enter combat via matchmaking (accessed from the world map), each player sees a **stage** (arena background). Every player has a **default stage**, but can purchase city-themed stages as cosmetic merch.

**Key design principle**: Each player sees **their own equipped stage** on their screen, but the combat mechanics and animations are **universal and identical** for everyone. This means:
- Player A has the Athens stage equipped → they see marble columns
- Player B in the same match has the Tokyo stage equipped → they see cherry blossoms
- Both play the same fight with the same mechanics

This is purely cosmetic and creates an easily extensible revenue stream — every new city or themed stage is a new product.

### 10.2 Stage System

| Stage | Source | Price |
|-------|--------|-------|
| **Default** | Free (all players) | — |
| **Mecca Arena** | Purchasable | TBD |
| **Jerusalem Arena** | Purchasable | TBD |
| **Athens Arena** | Purchasable | TBD |
| **Varanasi Arena** | Purchasable | TBD |
| **Xi'an Arena** | Purchasable | TBD |
| **Uluru Arena** | Purchasable | TBD |
| **Cusco Arena** | Purchasable | TBD |
| **Oslo Arena** | Purchasable | TBD |
| **Tokyo Arena** | Purchasable | TBD |
| **House of Hades Arena** | Purchasable | TBD |

Future stages can be added easily — seasonal themes, DLC-themed stages, limited editions, etc.

### 10.3 How It Works

```
Player equips a stage in their profile/settings
  → Enters matchmaking from world map
  → Match found, combat starts
  → Frontend loads the player's equipped stage as the 3D arena background
  → All combat mechanics, animations, VFX are universal (same for all stages)
  → Other players in the same match see THEIR own stage, not yours
```

### 10.4 UI

```
┌─────────────────────────────────────────────────────┐
│  MY STAGES                                 [Back]    │
│                                                      │
│  Equipped: ✅ Athens Arena                           │
│                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ Default │ │ Athens  │ │ Tokyo   │ │ Oslo    │  │
│  │  (free) │ │  ✅     │ │  🔒    │ │  🔒    │  │
│  │ [Equip] │ │[Equipped]│ │ [Buy]  │ │ [Buy]  │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │ Mecca   │ │ Cusco   │ │ House   │               │
│  │  🔒    │ │  🔒    │ │ of Hades│               │
│  │ [Buy]   │ │ [Buy]   │ │  🔒    │               │
│  └─────────┘ └─────────┘ │ [Buy]   │               │
│                           └─────────┘               │
└─────────────────────────────────────────────────────┘
```

### 10.5 Frontend Components

| Component | Description |
|-----------|-------------|
| `StageShop.tsx` | Grid of purchasable stages with previews |
| `StagePreview.tsx` | 3D preview of a stage before purchase |
| `StageEquip.tsx` | Equip/unequip stage UI |

The `CombatScene.tsx` loads the arena environment based on `player.equipped_stage` rather than `lobby.city_id`.

### 10.6 Backend Requirements

- New `stages` table: `id`, `name`, `city_id` (nullable — for non-city stages), `price_cents`, `preview_image`
- New `player_stages` table: `player_name`, `stage_id`, `purchased_at`
- New `equipped_stage` column on `players` table
- New endpoints:
  - `GET /stages` — list all stages with ownership status for player
  - `POST /stages/<id>/purchase` — buy a stage
  - `POST /players/<name>/equip_stage` — equip a stage
- Combat scene: frontend reads `equipped_stage` from player data, loads that arena environment

### 10.7 Architecture Note

The stage is **client-side only** — the backend doesn't need to know which stage a player is seeing during combat. It only stores:
- Which stages the player owns
- Which stage is equipped

The frontend loads the 3D arena environment based on this. No changes to the combat engine are needed.

---

## 10A. Skin Inventory, Trading & Friend System

### 10A.1 Concept

The rare skins that players roll for when entering a lobby can also be **bought for real money**. The same skins are tradable between players, which implies a **friend system** with **chat**, **trading windows**, and **block/report controls**. Together these systems form a coherent monetization + social loop:

> Play → roll a chance for a rare skin → finish the match to lock it into your account → set preferences or trade with friends → optionally buy skins outright in the shop.

This should be **post-alpha**, but is targeted to ship **within the next 4 months** as it can secure a steady revenue stream while extending the social depth of the game.

### 10A.2 Skin Tiers, Pricing & Drop Rates

| Tier | Price (USD) | Source |
|------|-------------|--------|
| **Common** | Free | Always available — earned simply by playing through a game |
| **Silver** | $5 | Rare lobby roll OR shop purchase |
| **Gold** | $10 | Rare lobby roll OR shop purchase |
| **Rainbow** | $50 | Rare lobby roll OR shop purchase |
| **Bling** | $100 | Rare lobby roll OR shop purchase |

The **Skin Shop** displays each rare tier alongside:
- Price for direct purchase
- Drop-rate information (how often you can earn this skin just by playing)
- A spinning 3D preview
- Ownership state (owned / not owned / quantity owned for stackable rares)

### 10A.3 Inventory Model

Today, **relics** (e.g., the coin from the Hades raid) are stored on a player's "inventory" on their account. The inventory model expands as follows:

- **Buying a skin** → added to inventory immediately on purchase confirmation
- **Rolling a rare skin in a lobby** → the player must **play through the entire match** to receive it; if they leave early, no skin is awarded
- **Common skins** are not counted (no quantity counter) — once unlocked they exist as a single owned entry on the account
- **Rare skins are stackable** — a player can own multiple of the same rare skin, which is what enables trading
- All skin ownership is **locked to the account** (i.e., requires a claimed name with email, just like raid relics)

### 10A.4 Profile Bar — New "Skins" Row

The profile bar in the **top-right corner of the home page** gets a new entry:

```
┌────────────────────────────────────┐
│  Profile                            │
│  ─────────────────────────────────  │
│  ▸ Account / Stats                  │
│  ▸ Relics                           │
│  ▸ Skins      ← NEW                 │
│  ▸ Stages                           │
│  ▸ Friends                          │
│  ▸ Settings                         │
└────────────────────────────────────┘
```

#### Skins Page Layout

```
┌────────────────────────────────────────────────────────┐
│  MY SKINS                                       [Back]  │
│                                                         │
│  Unlocked through play:                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│  │ Sky  │ │Forest│ │ Lava │ │ Mist │ │ ... │         │
│  │ ✅   │ │ ✅   │ │ ✅   │ │ ✅   │ │     │         │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │
│                                                         │
│  PREFERENCES                                            │
│  1st preference: [ Forest ▾ ]    [Clear]                │
│  2nd preference: [ Lava   ▾ ]    [Clear]                │
│  ☐ No preference (recommended — unlocks new skins)      │
│                                                         │
│  RARE SKINS                                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│  │  🌀 3D     │ │  🌀 3D     │ │  🌀 3D     │          │
│  │  spin      │ │  spin      │ │  spin      │          │
│  │  Silver    │ │  Gold      │ │  Rainbow   │          │
│  │  Owned x2  │ │  $10 [Buy] │ │  Locked 🔒 │          │
│  │  [Buy More]│ │            │ │  $50 [Buy] │          │
│  └────────────┘ └────────────┘ └────────────┘          │
│  Drop rate: 1 in 50 lobbies (Silver)                    │
│  Drop rate: 1 in 200 lobbies (Gold)                     │
│  Drop rate: 1 in 1000 lobbies (Rainbow)                 │
│  Drop rate: 1 in 5000 lobbies (Bling)                   │
└────────────────────────────────────────────────────────┘
```

- **Unlocked skins appear at the top** with the option to set a 1st and 2nd preference (or none).
- **Rare skins** are presented at the bottom with a **3D spinning preview**.
- If a rare skin is **not owned**, the preview is **greyed out** and a **[Buy] button** is shown directly under it.
- If it **is owned**, the preview is full-color and a **[Buy More] button** is still available (since rares are tradable and stackable).

### 10A.5 Skin Preference & Assignment Logic

When a player creates or joins a lobby:

1. **If preferences are set**: the system checks whether the player's **1st preference** is already taken in the lobby. If not, they get it. Otherwise it falls through to the **2nd preference**. If both are taken, they are assigned a random skin.
2. **If no preferences are set**: the player is randomly assigned a skin from the entire pool — including skins they don't yet own. **This is the ONLY path to unlocking new skins through play.** Setting a preference disables the chance to unlock new ones.

This design **encourages new players to leave preferences off** (so they can collect skins) while letting **veteran players who already own most/all skins** lock in the look they want.

The preference system relies on **per-account tracking of which skins the player has played with**, which must be persisted server-side and locked to the account.

### 10A.6 Earning Skins Through Play

| Skin type | Unlock condition |
|-----------|------------------|
| **Common** | Play through a full match while assigned that common skin (no early-leave credit) |
| **Rare (Silver/Gold/Rainbow/Bling)** | Roll a rare on lobby entry **AND** play through to the end of the match |

Quitting/disconnecting before the match ends forfeits the skin. This guards against players re-rolling for rares and dropping mid-match.

### 10A.7 Friend System

A **round friends button** sits at the **bottom-right of the screen**. Clicking it opens a panel:

```
┌────────────────────────────────────────────┐
│  FRIENDS                            [×]    │
│                                             │
│  PENDING INVITES                            │
│  ┌─────────────────────────────────────┐   │
│  │ DragonSlayer42                      │   │
│  │ [Accept] [Reject] [Block]           │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  INVITE A FRIEND                            │
│  [ Username or email____________ ] [Send]   │
│                                             │
│  YOUR FRIENDS (3 online)                    │
│  ● MythosKing   [Chat] [Trade]              │
│  ● ShieldMage   [Chat] [Trade]              │
│  ○ ForestSprite (offline) [Chat]            │
│  ● ZeusFan99    [Chat] [Trade]              │
│                                             │
│  BLOCKED                                    │
│  ▸ SpamBot007  [Unblock]                    │
└────────────────────────────────────────────┘
```

- **Friend invites** can be **Accepted**, **Rejected**, or **Blocked** at the moment they arrive.
- **Block list** suppresses all chat messages, trade invites, and future friend requests from the blocked account.
- Clicking a friend opens a **chat thread** with them (1-to-1 DM persisted server-side) and exposes a **[Trade]** action when they are online.
- Blocking is required because spam of chat and trading propositions is not wanted.

### 10A.8 Trading System

When a player invites another player to trade and they accept, a **trade window opens at both parties** simultaneously:

```
┌─────────────────────────────────────────────────────────┐
│  TRADE WITH MythosKing                          [×]      │
│  ─────────────────────────────────────────────────────   │
│  YOU OFFER                  │   THEY OFFER               │
│  ─────────────              │   ─────────────            │
│  [+ Add skin/relic]         │   (waiting...)             │
│                             │                            │
│  • Silver Skin   x1  [-]    │                            │
│  • Hades Coin    x2  [-]    │                            │
│                             │                            │
│  ─────────────────────────────────────────────────────   │
│  Status: 🟡 You proposed — waiting on MythosKing         │
│                                                          │
│  [ Propose Trade ]   [ Cancel ]                          │
└─────────────────────────────────────────────────────────┘
```

#### Trade Lifecycle

1. **Open** — both parties see an empty trade window.
2. **Add items** — each party selects relics and/or skins from their inventory and chooses a quantity for each (rares are stackable, so quantities matter). Common skins cannot be traded (no stack count).
3. **Propose** — both parties click **Propose Trade**. The offered items are now **locked** (cannot be modified without re-opening the trade).
4. **Final accept / reject** — once both have proposed, both parties get a final **Accept** / **Reject** prompt. Only if **both Accept** does the trade execute atomically (server-side inventory swap).
5. **Reject or modify** — either side can reject, which unlocks both offers and returns the window to the editing state, or close the window entirely.

#### Rules

- **Both sides must add at least one item** — a trade with an empty side is invalid regardless of magnitude on the other side. This prevents one-way "gift" exploits being used to launder accounts.
- Trade execution is **atomic** at the backend — both inventories update or neither does. No partial state.
- Trade history is logged server-side for moderation and chargeback investigations.

### 10A.9 Frontend Components

| Component | Description |
|-----------|-------------|
| `SkinShop.tsx` | Grid of rare skins with 3D spinning previews, prices, drop-rate info, [Buy] buttons |
| `SkinShopRarePreview.tsx` | 3D spinning preview component (greyed out if not owned) |
| `SkinsPage.tsx` | Profile sub-page: unlocked skins grid + preference selectors + rare skin section |
| `SkinPreferencePicker.tsx` | 1st/2nd preference dropdowns + "no preference" toggle |
| `ProfileBarSkinsRow.tsx` | New "Skins" entry in the top-right profile bar |
| `FriendsButton.tsx` | Round button anchored bottom-right of the home page |
| `FriendsPanel.tsx` | Invites + invite form + friend list + block list |
| `FriendInviteCard.tsx` | One pending invite with Accept / Reject / Block actions |
| `FriendChatThread.tsx` | 1-to-1 DM with a friend (persisted) |
| `TradeInviteDialog.tsx` | Incoming trade-invite prompt |
| `TradeWindow.tsx` | The two-sided trade UI with offer slots, propose/lock state, final accept/reject |
| `InventoryItemPicker.tsx` | Modal for picking a relic or skin (with quantity) to add to a trade offer |
| `BlockListEntry.tsx` | Row for blocked accounts with unblock action |

### 10A.10 Backend Requirements

#### New / Changed Tables

```sql
-- Skin catalogue
CREATE TABLE skins (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  tier        TEXT NOT NULL,           -- 'common' | 'silver' | 'gold' | 'rainbow' | 'bling'
  price_cents INTEGER,                 -- NULL for commons (not purchasable)
  drop_rate   NUMERIC,                 -- e.g., 0.02 for 1-in-50
  preview_3d  TEXT                     -- model path
);

-- Player-owned skins (stackable for rares; commons are unique per player)
CREATE TABLE player_skins (
  player_name TEXT NOT NULL,
  skin_id     TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_name, skin_id)
);

-- Tracks which skins a player has actually played with (gates "no preference" pool)
CREATE TABLE player_skin_history (
  player_name  TEXT NOT NULL,
  skin_id      TEXT NOT NULL,
  first_played TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_name, skin_id)
);

-- Preferences
ALTER TABLE players ADD COLUMN skin_pref_1 TEXT;
ALTER TABLE players ADD COLUMN skin_pref_2 TEXT;

-- Friends
CREATE TABLE friendships (
  player_a    TEXT NOT NULL,
  player_b    TEXT NOT NULL,
  status      TEXT NOT NULL,           -- 'pending' | 'accepted'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_a, player_b)
);

CREATE TABLE blocks (
  blocker     TEXT NOT NULL,
  blocked     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker, blocked)
);

-- Direct messages (friend chat)
CREATE TABLE dm_messages (
  id          BIGSERIAL PRIMARY KEY,
  from_player TEXT NOT NULL,
  to_player   TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trades
CREATE TABLE trades (
  id           BIGSERIAL PRIMARY KEY,
  player_a     TEXT NOT NULL,
  player_b     TEXT NOT NULL,
  state        TEXT NOT NULL,          -- 'open' | 'a_proposed' | 'b_proposed' | 'both_proposed' | 'accepted' | 'rejected' | 'cancelled'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ
);

CREATE TABLE trade_offers (
  trade_id    BIGINT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  item_kind   TEXT NOT NULL,           -- 'skin' | 'relic'
  item_id     TEXT NOT NULL,
  quantity    INTEGER NOT NULL,
  PRIMARY KEY (trade_id, player_name, item_kind, item_id)
);
```

#### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/skins` | List all skins with player ownership/quantity |
| POST | `/skins/<id>/purchase` | Buy a skin (Silver/Gold/Rainbow/Bling) |
| POST | `/players/<name>/skin_preferences` | Set 1st/2nd skin preference (or clear) |
| POST | `/lobby/<id>/assign_skins` | Server-side skin assignment per lobby (uses preferences + roll for rares) |
| POST | `/lobby/<id>/finalize_skin_award` | Awards rolled skin only if player completed match |
| GET | `/friends` | List friends + pending invites + block list |
| POST | `/friends/invite` | Send friend invite to a player |
| POST | `/friends/<player>/accept` | Accept invite |
| POST | `/friends/<player>/reject` | Reject invite |
| POST | `/friends/<player>/block` | Block a player (also rejects/removes friendship) |
| POST | `/friends/<player>/unblock` | Unblock |
| GET | `/dms/<player>` | Fetch DM history with a friend |
| POST | `/dms/<player>` | Send a DM to a friend (rejected if blocked or not friends) |
| POST | `/trades/invite` | Invite a friend to trade |
| POST | `/trades/<id>/offer` | Add/remove items from your side of the trade |
| POST | `/trades/<id>/propose` | Lock your offer |
| POST | `/trades/<id>/accept` | Final accept (only valid once both sides have proposed) |
| POST | `/trades/<id>/reject` | Reject / unlock |
| POST | `/trades/<id>/cancel` | Cancel trade window |

#### Real-time Considerations

Trade windows, friend invites, and DMs should be pushed via the **existing Socket.IO infrastructure** (see section 12.4). Events:
- `friend:invite_received`
- `friend:invite_accepted`
- `dm:message`
- `trade:invite`
- `trade:state` (offer changed, side proposed, finalized, cancelled)

Trade execution must use a **server-side transaction** to atomically swap inventory rows — never trust the client.

### 10A.11 Anti-Abuse Notes

- Block list is **enforced at every entry point**: chat send, DM send, trade invite, friend invite.
- Trades require **both sides to add ≥1 item** (no one-sided gifting → harder to launder banned accounts).
- Rare-skin awards require **match completion** (no roll-and-quit re-roll farming).
- Skins purchased via real-money IAP are flagged with the originating order ID for chargeback handling.
- Trade history is retained indefinitely for moderation.

### 10A.12 Architecture Note

The skin assignment logic runs **server-side at lobby start** so the client cannot manipulate it. The client only:
- Reads which skins the player owns / has played with
- Sends preference updates
- Renders whatever skin assignment the server returns

This mirrors the principle from section 10.7 (stages are client-side cosmetics) but inverts it: skins **affect what is rolled and earned**, so they must be authoritative on the server.

---

## 11. Distribution — App Stores & Steam

### 11.1 Technology Choice

| Platform | Wrapper | Notes |
|----------|---------|-------|
| **Steam** | **Tauri** | Wraps the web app as a desktop app. Lightweight. |
| **iOS** | **Capacitor** (Ionic) | Wraps Next.js output as a native iOS app via WebView. |
| **Android** | **Capacitor** (Ionic) | Same as iOS — single codebase for both mobile platforms. |
| **Web** | Direct deployment | Keep the web version running alongside native apps. |

**Recommended stack: Capacitor for mobile + Tauri for desktop/Steam.**

### 11.2 What Needs to Change

#### For Mobile (Capacitor)
- Install `@capacitor/core` and `@capacitor/cli`
- Add `capacitor.config.ts` with app ID (e.g., `com.worldofmythos.app`)
- Run `npx cap add ios` and `npx cap add android`
- Adapt touch controls: all buttons must be thumb-friendly
- Test 3D performance on mobile WebView (may need LOD reduction)
- Handle safe areas (notch, home indicator)
- Push notifications for gremlin events (via `@capacitor/push-notifications`)
- Add Capacitor plugins: haptics, status bar, splash screen

#### For Steam (Tauri)
- Add `src-tauri/` directory with Rust config
- Configure window size, title, icon
- Integrate Steamworks SDK for:
  - Steam authentication (link to game account)
  - Achievements
  - Steam overlay
  - Cloud saves (if needed later)
- Build for Windows + macOS + Linux

#### For All Platforms
- Responsive design: the UI must work at 360px (phone) to 2560px (ultrawide)
- Touch + mouse + keyboard input support
- Offline handling: graceful "no connection" screen
- Deep links: `worldofmythos://lobby/ABC123` to join directly

### 11.3 App Store Requirements

| Requirement | iOS | Android | Steam |
|-------------|-----|---------|-------|
| **Developer account** | Apple Developer ($99/yr) | Google Play ($25 one-time) | Steamworks ($100/app) |
| **Age rating** | ESRB / IARC | IARC | ESRB / PEGI |
| **Privacy policy** | Required | Required | Required |
| **Icons & screenshots** | 1024x1024 icon, 6.7" + 5.5" screenshots | 512x512 icon, phone + tablet screenshots | Library assets, capsule images |
| **IAP for DLC** | Apple IAP (30% cut) | Google Play Billing (15-30%) | Steam checkout (30%) |
| **Review time** | 1–7 days | 1–3 days | 2–5 days |

### 11.4 Project Structure Addition

```
wom-mid/
  ├── src/                    (existing Next.js app)
  ├── capacitor.config.ts     (Capacitor config)
  ├── ios/                    (generated iOS project)
  ├── android/                (generated Android project)
  ├── src-tauri/              (Tauri desktop wrapper)
  │   ├── Cargo.toml
  │   ├── tauri.conf.json
  │   └── src/
  │       └── main.rs
  └── scripts/
      ├── build-ios.sh
      ├── build-android.sh
      └── build-steam.sh
```

---

## 12. Technical Architecture Changes

### 12.1 Backend Refactoring

The current backend is a single ~2000-line file. For alpha, it should be modularized:

```
tjuvpakk-backend/
  ├── app.py                    (Flask app factory + CORS)
  ├── config.py                 (Env vars, DB config)
  ├── models/
  │   ├── player.py             (Player model + DB ops)
  │   ├── lobby.py              (Lobby state + management)
  │   ├── city.py               (City definitions)
  │   ├── event.py              (Pop-up event model)
  │   ├── dlc.py                (DLC chapters + progress)
  │   └── relic.py              (Relics + equipped relics)
  ├── routes/
  │   ├── auth.py               (login, signup, email verification)
  │   ├── lobby.py              (create, join, state, actions)
  │   ├── matchmaking.py        (queue, status, leave)
  │   ├── cities.py             (city list, city stats, city leaderboards)
  │   ├── events.py             (active events, join event)
  │   ├── dlc.py                (DLC progress, start chapter, equip relic)
  │   ├── leaderboards.py       (global + city-filtered)
  │   └── relics.py             (player relics, vault)
  ├── engine/
  │   ├── combat.py             (Round resolution logic)
  │   ├── boss_ai.py            (Boss behavior: existing bosses + DLC bosses)
  │   ├── janus_ai.py           (Janus mind trick mechanics)
  │   ├── matchmaker.py         (Background queue matcher)
  │   └── event_scheduler.py    (Background gremlin event spawner)
  ├── requirements.txt
  └── render.yaml
```

### 12.2 Database Schema Additions

```sql
-- New tables for alpha

CREATE TABLE events (
    id TEXT PRIMARY KEY,
    city_id INT REFERENCES cities(id),
    event_type TEXT NOT NULL DEFAULT 'gremlin',
    status TEXT DEFAULT 'pending',  -- 'pending', 'active', 'completed', 'expired'
    lobby_id TEXT,
    max_players INT DEFAULT 4,
    reward_config JSONB,
    start_time TIMESTAMP,
    expiry_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dlc (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,       -- 'Road to Olympus'
    description TEXT,
    price_cents INT
);

CREATE TABLE dlc_chapters (
    id TEXT PRIMARY KEY,
    dlc_id TEXT REFERENCES dlc(id),
    chapter_number INT NOT NULL,
    title TEXT NOT NULL,
    narrative_text TEXT,
    encounters JSONB,          -- [{boss_name, hp, damage, mechanics, ...}]
    requires_coop BOOLEAN DEFAULT FALSE  -- TRUE for Janus
);

CREATE TABLE dlc_progress (
    player_name TEXT REFERENCES players(name),
    dlc_id TEXT REFERENCES dlc(id),
    chapter_number INT,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    PRIMARY KEY (player_name, dlc_id, chapter_number)
);

CREATE TABLE dlc_relics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    dlc_id TEXT REFERENCES dlc(id),
    effect_type TEXT NOT NULL,
    effect_value FLOAT NOT NULL,
    flavour_text TEXT
);

-- Email verification codes
CREATE TABLE email_verification_codes (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,           -- 6-digit numeric code
    purpose TEXT NOT NULL,        -- 'signup' or 'login'
    player_name TEXT,             -- set for login codes
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_email_codes_lookup ON email_verification_codes(email, code, purpose);

-- Modifications to existing tables

ALTER TABLE players ADD COLUMN dlc_owned JSONB DEFAULT '[]';
ALTER TABLE players ADD COLUMN equipped_relic_id TEXT;
ALTER TABLE players ADD COLUMN home_city INT REFERENCES cities(id);
ALTER TABLE players ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE players ADD COLUMN require_email_auth BOOLEAN DEFAULT FALSE;

ALTER TABLE game_player_stats ADD COLUMN city_id INT REFERENCES cities(id);
ALTER TABLE game_player_stats ADD COLUMN mode TEXT DEFAULT 'ffa';  -- 'ffa' or 'team'
ALTER TABLE game_player_stats ADD COLUMN event_id TEXT;
```

### 12.3 Frontend State Management

The current app uses `useState` + localStorage. For alpha with more complex state, consider:

- **Zustand** for global client state (player session, queue status, current city)
- Keep localStorage for auth tokens

### 12.4 Real-time Considerations

> ✅ **Socket.IO is implemented.** The frontend uses Socket.IO for all in-game communication (state updates, actions, chat). No polling is used during gameplay. REST is only used for one-time operations (lobby creation, authentication, matchmaking, leaderboards, vault).

For matchmaking and event notifications (post-alpha features), Socket.IO can be extended with additional event types.

---

## 13. Email Service

The game currently collects emails during signup but has no email infrastructure. Before alpha, a proper email service must be in place for account security and recovery.

### 13.1 Mail Provider: Resend

**Resend** is the recommended provider.

- **Free tier:** 3,000 emails/month, 100/day — sufficient for alpha
- **Backend integration:** `pip install resend` + single API call
- **Transactional focus:** Built for verification codes, not marketing bulk mail
- **Cost at scale:** $20/month for 50k emails
- **Custom domain:** Optional for alpha (can use shared domain), upgrade to `noreply@worldofmythos.com` later

Alternatives considered: SendGrid (100/day free but complex), Amazon SES (cheapest at scale but requires AWS), Mailgun (good but smaller free tier).

### 13.2 Features

#### Email Verification on Signup

Signup becomes a two-step process:

1. User submits name, email, and email-auth preference → backend creates account in "pending" state, sends 6-digit code
2. User enters the code → backend activates the account

If the user never verifies, the account stays pending (name is reserved but login is blocked).

#### Optional Email-Based Login Authentication

During signup, a checkbox (default OFF): **"Require email verification code on every login"**

- When **OFF**: Login works as it does now (name + email)
- When **ON**: After submitting name + email at login, a 6-digit code is sent to the email. The user must enter the code to complete login.

This gives security-conscious users two-factor login without forcing it on everyone.

#### Username Retrieval ("Forgot Username")

Inline on the login page — a "Forgot your username?" toggle that expands an email input. On submit, the backend emails the username if the account exists. The response is always the same regardless of whether the email is found (prevents email enumeration).

### 13.3 Backend API Contract

| Endpoint | Method | Request Body | Success Response | Notes |
|----------|--------|-------------|------------------|-------|
| `/claim_name` | POST | `{ name, email, require_email_auth }` | `{ status: "verification_pending" }` | Modified — adds `require_email_auth` field, sends verification code |
| `/verify_email` | POST | `{ email, code }` | `{ status: "verified" }` | New — activates pending account |
| `/resend_verification` | POST | `{ email }` | `{ status: "sent" }` | New — resends 6-digit code |
| `/log_in` | POST | `{ name, email }` | `{ status: "ok" }` or `{ status: "email_auth_required" }` | Modified — returns `email_auth_required` if user opted in |
| `/verify_login_code` | POST | `{ name, email, code }` | `{ status: "ok" }` | New — completes login after code entry |
| `/forgot_username` | POST | `{ email }` | `{ status: "sent" }` (always) | New — emails username; same response whether email exists or not |

All error responses follow existing convention: `{ error: "message" }`.

### 13.4 Frontend Changes

**`src/lib/api.ts`** — Add four new API functions:
- `verifyEmail(email, code)` → `POST /verify_email`
- `resendVerification(email)` → `POST /resend_verification`
- `verifyLoginCode(name, email, code)` → `POST /verify_login_code`
- `forgotUsername(email)` → `POST /forgot_username`

**`src/app/signup/page.tsx`** — Two-step flow:
- Add `requireEmailAuth` checkbox (default OFF) with label: "Require email verification code on every login"
- Add `step` state (`'form' | 'verify' | 'done'`)
- On signup success → transition to verify step (6-digit code input, resend button with 30s cooldown)
- On verify success → show existing success screen

**`src/app/login/page.tsx`** — Conditional two-step + inline forgot username:
- After login POST, check if `status === "email_auth_required"` → show code entry UI
- Code entry: 6-digit input, verify button, resend button (re-calls `/log_in`), back link
- Add "Forgot your username?" toggle → expands inline email input + send button
- Success message: "If an account exists with that email, your username has been sent to it."

### 13.5 Backend Implementation Notes

- Verification codes: 6-digit random numeric, stored in DB with expiry (10 minutes)
- Rate limiting: Max 3 resend attempts per email per hour
- Code cleanup: Expired codes cleaned up by a periodic job or on next request
- Resend SDK: `pip install resend`, configure with API key from environment variable

---

## 14. Implementation Phases

> Phases are ordered by **alpha priority first**. Phases 1–3b must ship before alpha release. Phases 4+ are post-alpha.
>
> *(Progress updated 2026-03-29)*

---

### Phase 1: Character Model & Table UI *(Alpha)* — ✅ COMPLETE

**Goal**: Angel-cherub model in scene; table-centric action buttons; no flat menu panel

Frontend:
- [x] Integrate character 3D models (`useGLTF`) — Cherub, Turtle, Ghost, PlayerV1 all available
- [x] Smooth position interpolation animation when players appear
- [x] Players positioned at fixed seat slots around the 3D table
- [x] Overlay action buttons on top of 3D canvas (Attack, Defend, Get Life, Get Gold, Upgrade Strength)
- [x] All button labels in English
- [ ] `PlayerButtons.tsx` — overlay buttons anchored to each character in 3D space (`Html` from drei) *(buttons currently in overlay, not anchored to 3D characters)*
- [ ] `TheWell.tsx` — 3D well in center of table; clickable to submit Raid *(raid is currently a button in the overlay)*
- [ ] Sitting animation as default idle state in lobby *(models appear but no sitting animation)*
- [ ] Death animation on player elimination *(dead players marked with ☠️ in overlay but no 3D animation)*

Backend:
- [x] No backend changes required for this phase

### Phase 2: Combat Animation Polish *(Alpha)* — ❌ NOT STARTED

**Goal**: Combat animations feel alive and satisfying; execution phase has dramatic blackout

Frontend:
- [ ] **Blackout execution phase**: fade to black when all players have submitted; audio plays during blackout; fade back in to reveal results
- [ ] Attack animation on attacker model when attack resolves
- [ ] Attack VFX: slash arc particle effect toward target
- [ ] Camera shake on attack hit
- [ ] Damage number popup (floats up, fades)
- [ ] Defend VFX: shield dome on model when defend resolves
- [ ] Death animation + dissolve / shatter effect
- [ ] Victory pose + confetti + spotlight on winner
- [ ] "Round X" title card with brief animated swoosh between rounds
- [ ] Cinematic camera: brief cut to attacker → target on attack
- [ ] Slow orbit around winner on game over
- [ ] Round timer: 3D floating element above table, pulses red when ≤ 10s
- [ ] Audio system: sounds for attack, defend, death, victory, timer warning; sequenced during blackout

Backend:
- [ ] No backend changes required for this phase

### Phase 3: Lobby Chat *(Alpha)* — ✅ COMPLETE

**Goal**: Players can chat inside a lobby; speech bubbles appear above characters in scene

Frontend:
- [x] Chat UI integrated into `SceneOverlay.tsx` — collapsible panel, defaults to 2 lines, click to expand
- [x] `SpeechBubble` — 3D HTML overlay above player heads in `LobbyScene.tsx`; fades after ~4s; truncated to single line
- [x] Chat polling via `getPlayerMessages()` on each round tick
- [x] Chat input with send on Enter or button click
- [ ] Notification dot on toggle button for new messages while closed *(not yet implemented)*
- [ ] Whisper / target dropdown *(not yet implemented — all chat is broadcast)*

Backend:
- [x] Lobby chat stored in-memory as part of lobby state (`chat` array)
- [x] `GET /lobby/<id>/messages` — returns chat messages for the lobby
- [x] `POST /lobby/<id>/send_message` — body: `player_name`, `message`

### Phase 3a: Raid Boss Relic Claiming & Name Protection *(Alpha)* — ❌ NOT STARTED

**Goal**: Players can claim relics from raid boss kills via email; claimed names are protected from unauthorized use

Frontend:
- [ ] `ClaimRelicDialog.tsx` — modal shown after raid boss defeat when a relic drop occurs; email input field, "Claim Relic" and "No Thanks" buttons
- [ ] Integrate `ClaimRelicDialog` into post-raid reward flow — show when backend response includes `relic_available: true`
- [ ] `NameTakenDialog.tsx` — modal shown when backend returns `{ error: "name_claimed" }`; offers "Go to Login" (navigates to login page with name pre-filled) and "Choose Another Name" (returns to name entry)
- [ ] Integrate `NameTakenDialog` into all flows where a player name is submitted (lobby creation, lobby join, etc.)
- [ ] Handle `name_claimed` error response in `src/lib/api.ts` across all relevant API calls

Backend:
- [ ] `POST /claim_relic` endpoint — accepts `player_name`, `email`, `relic_id`, `lobby_id`; stores relic on account; creates account if needed
- [ ] Include `relic_available` and relic details in raid boss lobby completion response
- [ ] `verify_player_access` middleware — checks if a name is claimed (has email) and rejects unauthenticated use with `{ error: "name_claimed" }`
- [ ] Apply `verify_player_access` to all player-action endpoints

### Phase 3b: Email Service *(Alpha)* — ❌ NOT STARTED

**Goal**: Verified emails, optional email-based login auth, username recovery

Frontend:
- [ ] `src/lib/api.ts` — Add `verifyEmail`, `resendVerification`, `verifyLoginCode`, `forgotUsername` API functions
- [ ] `src/app/signup/page.tsx` — Add `requireEmailAuth` checkbox (default OFF), two-step flow with verification code entry + resend with 30s cooldown
- [ ] `src/app/login/page.tsx` — Handle `email_auth_required` login response with code entry step; add inline "Forgot your username?" toggle with email input

Backend:
- [ ] Install Resend SDK (`pip install resend`), configure API key
- [ ] `email_verification_codes` table (see schema in section 12.2)
- [ ] `players` table: add `email_verified` (bool) and `require_email_auth` (bool) columns
- [ ] Modify `POST /claim_name` — accept `require_email_auth`, create pending account, send verification code
- [ ] `POST /verify_email` — validate code, activate account
- [ ] `POST /resend_verification` — resend code (rate-limited: 3/hour)
- [ ] Modify `POST /log_in` — if `require_email_auth` is true, send code and return `email_auth_required`
- [ ] `POST /verify_login_code` — validate login code, complete login
- [ ] `POST /forgot_username` — email username if account exists (always returns same response)

### Phase 3c: Invite Link *(Alpha)* — ❌ NOT STARTED

**Goal**: Players can share a link to invite friends directly into their lobby

Frontend:
- [ ] "Copy Invite Link" button in lobby overlay (visible to all players)
- [ ] Link format: `https://worldofmythos.com/lobby/<lobbyId>` (or deep link `worldofmythos://lobby/<lobbyId>`)
- [ ] Clicking an invite link auto-fills the lobby code on the home/join screen
- [ ] Optional: toast confirmation when link is copied to clipboard

Backend:
- [ ] No backend changes required — lobbies already support join-by-code; the link just encodes the lobby ID

---

### Phase 4: Foundation — World Map & Cities *(post-alpha)* — ⚠️ PARTIALLY COMPLETE

**Goal**: World map + cities + refactored navigation

Frontend:
- [x] Build 3D world map scene with markers for all 10 cities
- [x] World map overlay (player info, navigation)
- [x] Earth textures (specular, bump, city lights, clouds), Fresnel atmosphere, starfield
- [x] Orbit controls for camera
- [ ] City hub screen (template — Athens first)
- [ ] Styx marker on Crete coast (DLC teaser, even before DLC is built)
- [ ] Routing: `/` → world map, `/city/[cityId]` → city hub
- [ ] Move current lobby/combat into city context

Backend:
- [ ] Wire `city_id` on lobby creation (currently hardcoded to `0`)
- [ ] Wire `city_id` into `game_player_stats` (currently `location_id: 10`)
- [ ] New endpoints: `GET /cities`, `GET /cities/<id>/leaderboards`
- [ ] Begin modularizing `tjuvpakk_server.py` into route + model files

### Phase 5: City Chat *(post-alpha)* — ❌ NOT STARTED

**Goal**: City chat functional in City Hub

Frontend:
- [ ] City chat integrated into City Hub screen (reuse `ChatPanel.tsx`)
- [ ] Chat polling (every 2–3 seconds)

Backend:
- [ ] Create `chat_messages` table in Supabase
- [ ] City chat endpoints (`GET /cities/<id>/chat`, `POST /cities/<id>/chat`)
- [ ] Rate limiting (1 msg / 2s per player), message length limit (200 chars)

### Phase 6: Hades Raid *(Alpha — required)* — ❌ NOT STARTED

**Goal**: Hades appears as a fixed raid boss — 8 HP, 2 attacks — defeated by trained AI targeting ~70% win rate solo, ~20% with 2 players

Frontend:
- [ ] `EventDetail.tsx` updated to render Hades Raid with distinct visual treatment (red/purple, skull icon)
- [ ] `EventToast.tsx` — global notification on world map when a Hades Raid spawns
- [ ] `HadesScene.tsx` — Underworld arena (cavern, river Styx, ghostly flames); Hades seated at head of table
- [ ] Hades boss model / placeholder displayed opposite players
- [ ] Post-raid reward screen shows Hades Relic chance

Backend:
- [ ] Hades Raid lobby type: players start with 10 HP, 1 weapon, 0 gold; Hades starts with 8 HP, 2 attacks (no scaling)
- [ ] Hades AI module: trained via self-play iteration; target win rates ~70% (1 player), ~20% (2 players)
- [ ] AI training harness: simulate Hades Raid rounds, evaluate win %, iterate until criteria are met
- [ ] Hades Raid spawner: global, once every 30–60 min, only House of Hades city, max 1 active globally
- [ ] Hades Relic reward: stored on player record
- [ ] `raid_wins` stat increment on Hades kill

### Phase 7: Events & Stats *(post-alpha)* — ❌ NOT STARTED

**Goal**: Gremlin events work, city stats are tracked

Frontend:
- [ ] Gremlin event detail screen + join flow
- [ ] City leaderboard component
- [ ] City stats on player profile
- [ ] Per-city stat display in city hub

Backend:
- [ ] Background gremlin event scheduler (spawn in random cities)
- [ ] Event join endpoint (creates lobby linked to event)
- [ ] City-scoped leaderboard query
- [ ] Player city stats endpoint

### Phase 8: Matchmaking *(post-alpha)* — ❌ NOT STARTED

**Goal**: Players can queue for BR and team matches

Frontend:
- [ ] Matchmaking screen (mode select, city filter, queue status)
- [ ] Team invite flow
- [ ] Team indicators in lobby (colored borders, team labels)
- [ ] Queue status polling

Backend:
- [ ] In-memory matchmaking queues
- [ ] Background matcher loop
- [ ] Team assignment logic in lobby
- [ ] Combat engine: team rules (no friendly fire, team win condition)
- [ ] Matchmaking endpoints (join, leave, status)

### Phase 9: Per-City Arena Themes *(post-alpha)* — ❌ NOT STARTED

**Goal**: Each city has a visually distinct arena environment

Frontend:
- [ ] New arena 3D scenes — all 10 cities (see section 8.7)
- [ ] Audio system + minimum sound effects

### Phase 10: DLC — Road to Olympus — ❌ NOT STARTED

**Goal**: Purchasable tower climb with Styx, Janus (co-op), and Zeus

Frontend:
- [ ] DLC screen with tower progress visualization
- [ ] Narrative panel (story text between encounters)
- [ ] Janus boss arena (two-faced, mind trick visuals)
- [ ] Zeus boss arena (lightning-themed summit)
- [ ] Relic equip UI
- [ ] Purchase flow (platform-specific IAP)

Backend:
- [ ] DLC tables (dlc, dlc_chapters, dlc_progress, dlc_relics)
- [ ] Janus mind trick action system (hidden choices, mirrored targeting, deception rounds)
- [ ] Janus co-op enforcement (lobby must have 2+ players)
- [ ] Zeus boss definition with unique mechanics
- [ ] Chapter start/complete endpoints
- [ ] Relic equip endpoint
- [ ] Combat engine: apply equipped relic effects
- [ ] Purchase verification (stub for alpha, real IAP later)

### Phase 11: Platform Distribution — ❌ NOT STARTED

**Goal**: Ship on iOS, Android, and Steam

Setup:
- [ ] Add Capacitor to project, configure for iOS + Android
- [ ] Add Tauri for desktop/Steam build
- [ ] Responsive UI pass — test at all breakpoints
- [ ] Touch controls optimization
- [ ] Mobile 3D performance optimization (LOD, draw call reduction)
- [ ] Steam SDK integration (auth, achievements)
- [ ] App icons, splash screens, store screenshots
- [ ] Privacy policy and age ratings
- [ ] Apple Developer + Google Play + Steamworks accounts
- [ ] Build scripts for all platforms
- [ ] Submit to stores

### Phase 12: Skins, Trading & Friend System *(post-alpha — target within 4 months of alpha)* — ❌ NOT STARTED

**Goal**: Ship the rare-skin shop, account-locked skin inventory, friend system with chat, and player-to-player trading. Targeted to land within 4 months of alpha as a recurring revenue stream.

Frontend:
- [ ] `SkinShop.tsx` — grid of rare skins (Silver $5, Gold $10, Rainbow $50, Bling $100) with prices, drop-rate info, [Buy] buttons
- [ ] `SkinShopRarePreview.tsx` — 3D spinning preview (greyed out if not owned)
- [ ] `SkinsPage.tsx` — profile sub-page: unlocked skins grid + preference selectors + rare skin section
- [ ] `SkinPreferencePicker.tsx` — 1st/2nd preference dropdowns + "no preference" toggle
- [ ] `ProfileBarSkinsRow.tsx` — new "Skins" entry in the top-right profile bar
- [ ] `FriendsButton.tsx` — round button anchored bottom-right of the home page
- [ ] `FriendsPanel.tsx` — invites + invite form + friend list + block list
- [ ] `FriendInviteCard.tsx` — Accept / Reject / Block actions
- [ ] `FriendChatThread.tsx` — 1-to-1 DM with a friend
- [ ] `TradeInviteDialog.tsx` — incoming trade-invite prompt
- [ ] `TradeWindow.tsx` — two-sided trade UI with offer slots, propose/lock state, final accept/reject
- [ ] `InventoryItemPicker.tsx` — modal for picking a relic or skin (with quantity) to add to a trade
- [ ] `BlockListEntry.tsx` — row for blocked accounts with unblock action
- [ ] Display rolled rare skin in lobby UI; gate award on match completion
- [ ] Wire Socket.IO listeners for `friend:*`, `dm:message`, `trade:*` events

Backend:
- [ ] New tables: `skins`, `player_skins`, `player_skin_history`, `friendships`, `blocks`, `dm_messages`, `trades`, `trade_offers`
- [ ] `players.skin_pref_1` and `players.skin_pref_2` columns
- [ ] `GET /skins`, `POST /skins/<id>/purchase`
- [ ] `POST /players/<name>/skin_preferences`
- [ ] `POST /lobby/<id>/assign_skins` — server-side preference + roll logic
- [ ] `POST /lobby/<id>/finalize_skin_award` — only awards if player completed match
- [ ] Friend endpoints: invite / accept / reject / block / unblock / list
- [ ] DM endpoints: fetch + send (rejected if blocked or not friends)
- [ ] Trade endpoints: invite / offer / propose / accept / reject / cancel
- [ ] Atomic server-side inventory swap on trade execution
- [ ] Push real-time events for friends, DMs, and trades via Socket.IO
- [ ] IAP integration with order-ID tracking for chargeback handling

---

## Appendix: New Route Map

```
/                           → World Map (3D globe + overlay)
/city/[cityId]              → City Hub (e.g., /city/3 → Athens)
/city/[cityId]/match        → Combat arena (redirected from matchmaking)
/city/[cityId]/event/[id]   → Gremlin event encounter
/matchmaking                → Matchmaking queue screen
/dlc/road-to-olympus        → DLC overview + tower progress
/dlc/road-to-olympus/[chapter] → DLC encounter (Janus, Zeus, etc.)
/profile                    → Player profile + stats + relics
/leaderboards               → Global leaderboards (with city filter)
/login                      → Login
/signup                     → Signup
/settings                   → Settings
```

## Appendix: New Backend Endpoints Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cities` | List all 10 cities with active event counts |
| GET | `/cities/<id>` | City details |
| GET | `/cities/<id>/leaderboards` | City-scoped leaderboard |
| GET | `/cities/<id>/events` | Active gremlin events in city |
| GET | `/cities/<id>/chat` | Fetch recent city chat messages |
| POST | `/cities/<id>/chat` | Send a city chat message |
| GET | `/cities/<id>/stats/<player>` | Player stats in city |
| GET | `/events/active` | All active gremlin events |
| POST | `/events/<id>/join` | Join a gremlin event |
| POST | `/matchmaking/join` | Enter matchmaking queue |
| POST | `/matchmaking/leave` | Leave queue |
| GET | `/matchmaking/status` | Queue position + match result |
| GET | `/dlc/<id>` | DLC info (Road to Olympus) + player progress |
| POST | `/dlc/<id>/chapter/<num>/start` | Start DLC encounter |
| POST | `/dlc/<id>/chapter/<num>/complete` | Complete chapter |
| POST | `/players/<name>/equip_relic` | Equip a DLC relic |
| GET | `/players/<name>/equipped_relic` | Get equipped relic |
| GET | `/players/<name>/city_stats` | All city stat breakdowns |
| GET | `/lobby/<id>/chat` | Fetch lobby chat messages |
| POST | `/lobby/<id>/chat` | Send a lobby chat message |
| POST | `/claim_relic` | Claim a raid boss relic by providing email |
| POST | `/verify_email` | Verify signup email with 6-digit code |
| POST | `/resend_verification` | Resend verification code (rate-limited) |
| POST | `/verify_login_code` | Verify login code for email-auth users |
| POST | `/forgot_username` | Email username to address (anti-enumeration) |
| GET | `/skins` | List all skins with player ownership/quantity |
| POST | `/skins/<id>/purchase` | Buy a Silver/Gold/Rainbow/Bling skin |
| POST | `/players/<name>/skin_preferences` | Set 1st/2nd skin preference (or clear) |
| POST | `/lobby/<id>/assign_skins` | Server-side skin assignment per lobby (preferences + rare roll) |
| POST | `/lobby/<id>/finalize_skin_award` | Awards rolled skin only if player completed match |
| GET | `/friends` | List friends + pending invites + block list |
| POST | `/friends/invite` | Send friend invite |
| POST | `/friends/<player>/accept` | Accept invite |
| POST | `/friends/<player>/reject` | Reject invite |
| POST | `/friends/<player>/block` | Block player (and remove friendship) |
| POST | `/friends/<player>/unblock` | Unblock player |
| GET | `/dms/<player>` | Fetch DM history with a friend |
| POST | `/dms/<player>` | Send DM to friend (rejected if blocked or not friends) |
| POST | `/trades/invite` | Invite a friend to trade |
| POST | `/trades/<id>/offer` | Add/remove items on your side of the trade |
| POST | `/trades/<id>/propose` | Lock your offer |
| POST | `/trades/<id>/accept` | Final accept (only valid once both proposed) |
| POST | `/trades/<id>/reject` | Reject / unlock |
| POST | `/trades/<id>/cancel` | Cancel trade window |
