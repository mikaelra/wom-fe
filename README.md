# World of Mythos — Frontend

3D multiplayer turn-based strategy game built with Next.js and React Three Fiber. Players navigate a mythological world map, battle around a table in sacred cities, and raid bosses in the underworld.

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript 5**
- **React Three Fiber** / **Three.js** — 3D scenes and character models
- **Socket.IO** — real-time multiplayer communication
- **Tailwind CSS 4** — UI styling
- **Docker** — self-hosted on a Hetzner VM (built via GitHub Actions, deployed over SSH)

## Getting Started

### Prerequisites

- Node.js
- A running backend server (see [Backend](#backend))

### Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL | `http://localhost:5000` |

### Scripts

```bash
npm run dev    # Start dev server (Turbopack)
npm run build  # Production build
npm start      # Start production server
npm run lint   # Run ESLint
```

## Project Structure

```
src/
├── app/                        # Next.js pages (App Router)
│   ├── page.tsx                # Home — 3D world map with city hub + Athens/Hades raid entry
│   ├── lobby/[lobbyId]/        # Battle lobby (PvP + boss raids) — the main game page
│   ├── vault/                  # Artifact vault unlock
│   ├── rules/                  # Game rules overview
│   ├── rules/[page]/           # Detailed rules (p1–p8)
│   ├── login/                  # Login (name + email, with code verification)
│   ├── signup/                 # Registration
│   ├── settings/               # Account settings (email verification toggle)
│   └── email_verified/         # Landing page for email confirmation links
├── components/
│   ├── worldmap/
│   │   ├── WorldMap.tsx           # 3D globe with Earth textures, Fresnel atmosphere, starfield
│   │   ├── CityMarker.tsx         # Clickable city markers with glow and labels
│   │   ├── GlobeCrackleEffect.tsx # Hades-raid VFX on the globe
│   │   └── WorldMapOverlay.tsx    # World map top bar (user menu, create/join)
│   ├── lobby/
│   │   ├── LobbyScene.tsx         # 3D table scene with players, chat bubbles, animations
│   │   ├── LobbyOverlay.tsx       # Pre-game lobby UI + SceneOverlay wrapper
│   │   ├── InGameGuide.tsx        # First-time-player guided tour
│   │   └── ...                    # Combat/Well VFX: SwordEffect, ShieldEffect, WellGlowEffect, etc.
│   ├── home/
│   │   └── HomeOverlay.tsx        # City hub menu (create/join lobby, relics, raid timer)
│   ├── hud/                       # Shared 3D-space UI primitives (roped button/input)
│   ├── vault/
│   │   └── VaultScene.tsx         # Vault unlock 3D scene
│   ├── SceneOverlay.tsx           # Core game HUD — actions, chat, round info, player list
│   ├── Playerv1.tsx               # Player character model (frog skins, turtle, ghost, Hades)
│   ├── Table.tsx                  # Game table model
│   ├── mountain.tsx / temple.tsx  # Scene backdrop models
│   ├── ExplosionEffect.tsx        # Particle explosion VFX
│   └── BossSignupNudge.tsx        # Prompt to link an email after winning a pending relic
├── lib/
│   ├── api.ts                  # REST API client + Socket.IO singleton
│   ├── gameEvents.ts           # Typed structured combat/well events (mirrors the backend's engine/phases/*)
│   ├── cities.ts               # Sacred city definitions (coords + metadata)
│   ├── frogSkins.ts            # Deterministic per-lobby player skin assignment
│   ├── deviceQuality.ts        # Low-end device detection, gates 3D render quality
│   ├── sceneConstants.ts       # 3D scene positioning and layout
│   ├── guideHighlights.ts      # In-game tutorial highlight state
│   ├── sounds.ts / resourceFx.ts # Sound + resource-gain VFX bus
│   └── usePanOffset.ts / useGuideEnabled.ts / useStagedResources.ts  # Shared hooks
├── types/
│   └── game.ts                 # TypeScript interfaces (Player, LobbyState, Relic, ChatMessage)
└── config.ts                   # Backend URL config

public/
├── models/                     # 3D models (.glb), including per-skin frog models under models/frogs/
├── textures/                   # Earth textures for world map
├── audio/ sounds/              # Music and sound effects
└── images/                     # UI assets (rules SVGs, etc.)
```

## Features

- **3D World Map** — Interactive globe with sacred city markers, realistic Earth textures (specular, bump, city lights, clouds), Fresnel atmospheric glow, orbit controls, and starfield background
- **Battle Lobbies** — 2–4 players seated at a 3D table with animated character models (per-player frog skins with rarity tiers, plus Turtle bot, Ghost, and boss models)
- **Real-Time Multiplayer** — Socket.IO for live state updates, action submission, and chat (no polling)
- **Turn-Based Combat** — Resource gathering (HP, coins, attack), attacking, defending, The Well, and deny mechanics with 40-second round timer
- **Boss Raids** — Scheduled Hades encounters with countdown timer; cooperative play, awards relics
- **Lobby Chat** — In-game text chat with collapsible panel
- **Vault System** — 8-digit code unlock for rare artifacts with first-finder registration
- **Bot Support** — Add AI bots to fill lobby slots
- **In-Game Guide** — First-time-player highlighted tour of the UI
- **Authentication** — Name + email registration and login, with optional email code verification

## Real-Time Communication

The game uses a hybrid REST + Socket.IO architecture:

- **Socket.IO** handles all in-game communication: state updates, action submission (start game, submit choice, deny, kick, add bot), and chat messages. The server pushes `state_update` events whenever lobby state changes — no polling required.
- **REST** is used for one-time operations: lobby creation, boss-fight matchmaking, authentication, vault, and player data queries.

## Backend

This frontend expects a backend API server (see [wom-be](https://github.com/mikaelra/wom-be)). For local development, run the backend on port 5000 or set `NEXT_PUBLIC_BACKEND_URL` to point to your backend instance. In production, `NEXT_PUBLIC_BACKEND_URL` is baked into the build by `.github/workflows/deploy.yml` (it's a `NEXT_PUBLIC_*` var, so it has to be supplied at build time, not as a runtime env var).

See [docs/API_ROUTES.md](docs/API_ROUTES.md) for the complete API reference.

## Deployment

Self-hosted on a Hetzner VM with Docker. `.github/workflows/deploy.yml` builds the image, pushes it to GHCR, and deploys it over SSH on every push to `master`. Configuration is in the top-level `Dockerfile`.
