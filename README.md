# World of Mythos — Frontend

3D multiplayer turn-based strategy game built with Next.js and React Three Fiber. Players navigate a mythological world map, battle around a table in sacred cities, fight gremlins in enchanted forests, and raid bosses in the underworld.

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript 5**
- **React Three Fiber** / **Three.js** — 3D scenes and character models
- **Socket.IO** — real-time multiplayer communication
- **Tailwind CSS 4** — UI styling
- **Netlify** — deployment

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
│   ├── page.tsx                # Home — 3D world map with city markers
│   ├── lobby/[lobbyId]/        # Battle lobby (PvP + boss raids)
│   ├── gremlin/[lobbyId]/      # Gremlin fight (forest scene)
│   ├── vault/                  # Artifact vault unlock
│   ├── rules/                  # Game rules overview
│   ├── rules/[page]/           # Detailed rules (p1–p8)
│   ├── leaderboards/           # Player rankings
│   ├── login/                  # Login (name + email)
│   └── signup/                 # Registration
├── components/
│   ├── worldmap/
│   │   ├── WorldMap.tsx        # 3D globe with Earth textures, Fresnel atmosphere, starfield
│   │   └── CityMarker.tsx      # Clickable city markers with glow and labels
│   ├── lobby/
│   │   ├── LobbyScene.tsx      # 3D table scene with players, chat bubbles, animations
│   │   └── LobbyOverlay.tsx    # Pre-game lobby UI + SceneOverlay wrapper
│   ├── gremlin/
│   │   ├── GremlinScene.tsx    # Dark forest scene with trees, mushrooms, gremlin model
│   │   └── GremlinOverlay.tsx  # Gremlin-themed SceneOverlay wrapper
│   ├── home/
│   │   ├── HomeOverlay.tsx     # City hub menu (create/join lobby, relics, raid timer)
│   │   └── WorldMapOverlay.tsx # World map top bar (user menu, create/join)
│   ├── SceneOverlay.tsx        # Core game HUD — actions, chat, round info, player list
│   ├── Playerv1.tsx            # Player character model (frog, turtle, ghost, Hades)
│   ├── Model.tsx               # Generic GLB model loader
│   ├── Table.tsx               # Game table model
│   ├── mountain.tsx            # Mountain backdrop model
│   ├── ExplosionEffect.tsx     # Particle explosion VFX
│   ├── FloatingMessage.tsx     # Animated floating UI messages
│   └── MusicPlayer.tsx         # Background music player
├── lib/
│   ├── api.ts                  # REST API client + Socket.IO singleton
│   ├── cities.ts               # Sacred city definitions (coords + metadata)
│   ├── sceneConstants.ts       # 3D scene positioning and layout
│   └── usePanOffset.ts         # Camera pan offset hook
├── types/
│   └── game.ts                 # TypeScript interfaces (Player, LobbyState, Relic, ChatMessage)
└── config.ts                   # Backend URL config

public/
├── models/                     # 3D models (.glb)
├── textures/                   # Earth textures for world map
└── images/                     # UI assets (rules SVGs, etc.)
```

## Features

- **3D World Map** — Interactive globe with sacred city markers, realistic Earth textures (specular, bump, city lights, clouds), Fresnel atmospheric glow, orbit controls, and starfield background
- **Battle Lobbies** — 2–4 players seated at a 3D table with animated character models (Cherub, Turtle, Ghost, PlayerV1)
- **Real-Time Multiplayer** — Socket.IO for live state updates, action submission, and chat (no polling)
- **Turn-Based Combat** — Resource gathering (HP, coins, attack), attacking, defending, raiding, and deny mechanics with 40-second round timer
- **Boss Raids** — Scheduled Hades encounters with countdown timer; cooperative play
- **Gremlin Fights** — Solo forest encounters with procedural gremlin model, trees, mushrooms, and victory signpost animation
- **Lobby Chat** — In-game text chat with collapsible panel and 3D speech bubbles above player heads
- **Vault System** — 8-digit code unlock for rare artifacts with first-finder registration
- **Leaderboards** — Monthly and all-time rankings (wins, kills, games played, raid wins)
- **Bot Support** — Add AI bots to fill lobby slots
- **Replay System** — Vote to replay after game over
- **Authentication** — Simple name + email registration and login

## Real-Time Communication

The game uses a hybrid REST + Socket.IO architecture:

- **Socket.IO** handles all in-game communication: state updates, action submission (start game, submit choice, deny, kick, add bot), and chat messages. The server pushes `state_update` events whenever lobby state changes — no polling required.
- **REST** is used for one-time operations: lobby creation, raid/gremlin matchmaking, authentication, leaderboards, vault, and player data queries.

## Backend

This frontend expects a backend API server. In production, the backend runs at `https://tjuvpakk-backend.onrender.com`. For local development, run the backend on port 5000 or set `NEXT_PUBLIC_BACKEND_URL` to point to your backend instance.

See [docs/API_ROUTES.md](docs/API_ROUTES.md) for the complete API reference.

## Deployment

Deployed to Netlify with the Next.js plugin. Configuration is in `netlify.toml`.
