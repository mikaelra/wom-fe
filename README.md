# World of Mythos — Frontend

3D multiplayer turn-based strategy game built with Next.js and React Three Fiber. Players travel a globe lit by the real sky, walk into Athens, and from there enter boss raids against Hades, ranked matches, bot-ranked matches, or the player-to-player Market.

Ships as a web app (self-hosted, Docker) and as a static export wrapped in Electron for Steam. Mobile (Capacitor) is planned — see [`docs/MOBILE_AND_STEAM_PLAN.md`](docs/MOBILE_AND_STEAM_PLAN.md).

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript 5**
- **React Three Fiber** / **drei** / **Three.js** — 3D scenes and character models
- **astronomy-engine** — real planet/Moon/Sun positions for the globe and city skies
- **Socket.IO** — real-time multiplayer communication
- **Zod** — runtime validation of every REST and socket payload (`src/lib/schemas.ts`, `src/types/game.ts`)
- **Tailwind CSS 4** — UI styling
- **Sentry** — error reporting (web and Electron)
- **Vitest** + Testing Library — unit and component tests
- **Electron** + **steamworks.js** — the Steam build
- **Docker** — self-hosted on a Hetzner VM (built via GitHub Actions, deployed over SSH)

## Getting Started

### Prerequisites

- Node.js 22 (what CI uses)
- A running backend server (see [Backend](#backend))

### Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Environment Variables

All `NEXT_PUBLIC_*` variables are inlined at **build time** — changing them requires a rebuild.

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL. **Required** for production builds (`src/config.ts` refuses to guess). | `http://localhost:5000` in dev |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Support contact shown on shop/terms/refunds pages | `support@worldofmythos.net` |
| `NEXT_PUBLIC_LEGAL_ENTITY_NAME` | Data controller name on the privacy page | `World of Mythos` |
| `NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS` | Data controller address on the privacy page (line omitted when unset) | — |
| `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_BUILD_NUMBER` | Build identity shown on the settings page; set by CI from git | `dev` / `0` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN; Sentry is off when unset | — |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Source-map upload at build time; skipped when unset | — |
| `BUILD_TARGET` | `native` switches the build to a static export (`out/`) for Electron/Capacitor | web (`standalone`) |

Electron-only flags (`WOM_STEAM`, `WOM_STEAM_APPID`, `WOM_DEVTOOLS`) are documented in [`electron/README.md`](electron/README.md).

### Scripts

```bash
npm run dev           # Start dev server (Turbopack)
npm run build         # Production web build (standalone server)
npm run build:native  # Static export to out/ for the native shells
npm start             # Start production server
npm run lint          # ESLint
npm test              # Vitest (single run)
npx tsc --noEmit      # Typecheck (its own CI job)

npm run electron:dev  # build:native, then launch the Electron shell
npm run electron      # Launch Electron against the existing out/
npm run dist:steam    # Package the Steam build with electron-builder
npm run steam:upload  # Upload to Steam via SteamPipe (see steam/README.md)
```

CI (`.github/workflows/deploy.yml`) runs lint, tests (with coverage) and typecheck on every PR; run the same three locally before pushing.

## Project Structure

```
src/
├── app/                        # Next.js pages (App Router)
│   ├── page.tsx                # Home — 3D globe with city markers, merchants, world clock
│   ├── city/                   # City scene (/city?id=athens) — signpost, Senate, Market, Bay, real sky
│   ├── lobby/                  # Battle lobby (/lobby?id=<id>) — PvP, ranked, bot-ranked, boss raids
│   ├── lobby/[lobbyId]/        # Legacy /lobby/<id> links → redirect to the query-param shape
│   ├── market/                 # Player-to-player trading post (board, chat, craft offers)
│   ├── shop/                   # Stripe cosmetics shop (+ success/cancel return pages)
│   ├── inventory/              # Skins, wheels, relics; wheel spins and trade-ups
│   ├── stats/                  # Player stats and season Hall of Records
│   ├── my-ai/                  # Personal AI that plays bot ranked
│   ├── vault/                  # Vault room with the public artifact ledger
│   ├── rules/, rules/[page]/   # Rules overview and detailed pages
│   ├── login/, signup/, forgot_username/, verify_email/, email_verified/, settings/
│   ├── privacy/, terms/, refunds/  # Legal pages
│   └── modelling/ + api/modelling-prompt/  # DEV-ONLY sandbox (*.dev.tsx, excluded from builds)
├── components/
│   ├── worldmap/               # Globe, city/merchant markers, world clock, star catalog
│   ├── city/                   # City scene: sky, terrain, signpost, buildings, overlay
│   ├── lobby/                  # Table scene, avatars, combat/Well VFX, lobby overlay
│   ├── market/                 # Market board, listings, chat, disclaimers
│   ├── merchant/               # Merchant encounter scene + revert-time modal
│   ├── hud/                    # Shared UI: roped button/input/frame, top bar, rank badge, season timer
│   ├── wheel/                  # Wheel-of-fortune canvas + physics animation
│   ├── audio/ sky/ vault/ rules/ modelling/
│   ├── SceneOverlay.tsx        # Core in-game HUD — actions, chat, round info, player list
│   ├── Playerv1.tsx            # Player character model (frog skins, bots, boss)
│   └── ...                     # Modals/nudges: wheel spin, trade-up, artifact ledger, auth gate, toasts
├── lib/
│   ├── http.ts / socket.ts     # REST client + Socket.IO singleton (both send PROTOCOL_VERSION)
│   ├── api.ts                  # Typed API calls built on the two above
│   ├── schemas.ts              # Zod schemas for wire payloads
│   ├── gameEvents.ts           # Structured combat/Well events (mirrors wom-be engine/phases/*)
│   ├── astrology.ts            # Planetary conjunctions/aspects (pure, unit-tested)
│   ├── city*.ts / sky*.ts      # City layout, terrain, time, sky geometry
│   ├── merchant.ts / market.ts / tradeUps.ts / cosmetics.ts  # Economy features
│   ├── use*.ts                 # Hooks: lobby connection/game, queues, countdowns, presence, ...
│   └── ...
├── types/game.ts               # Core game types + their Zod schemas
└── config.ts                   # Backend URL, protocol version, build identity, legal identity

electron/                       # Electron shell for Steam (see electron/README.md)
steam/                          # SteamPipe upload templates (see steam/README.md)
scripts/                        # Asset audit, skin thumbnails, garment shell, Steam upload
docs/                           # Design plans (see below)

public/
├── models/                     # 3D models (.glb) — frogs, boss, merchant, relics, garments, ...
├── textures/ hdri/ skins/      # Earth/sky textures, environment maps, skin textures
├── draco/                      # Draco decoder for compressed models
├── audio/ sounds/              # Music and sound effects
└── images/                     # UI assets (rules SVGs, etc.)
```

Tests live next to the code in `__tests__/` directories.

## Features

- **World Map** — Earth globe with city markers, real-time planet/Moon/Sun positions, conjunction lighting, and a world clock
- **City Scene** — Athens under its real sky; a signpost leads to the boss raid, ranked, bot ranked, and the Market
- **Battle Lobbies** — Players seated at a 3D table with per-player frog skins, bots, and boss models
- **Turn-Based Combat** — Resource gathering (HP, coins, attack), attacking, defending, The Well, and deny, with floating damage numbers
- **Boss Raids** — Scheduled Hades encounters with a countdown and live roster; award relics
- **Ranked** — Matchmaking queue, a rank ladder with seasons tied to solstices/equinoxes, and a Hall of Records
- **Bot Ranked & My AI** — A personal, tunable AI that plays ranked against other players' AIs
- **Merchants** — Globe encounters tied to astronomical events (full moon, planetary conjunctions) that sell relics and items for Hades' Coins
- **Market** — Player-to-player item swaps with chat and craft offers
- **Shop, Wheels & Skins** — Stripe cosmetics shop, wheel spins from match drops, trade-ups
- **Vault** — A room holding the public artifact discovery ledger
- **In-Game Guide** — First-time-player highlighted tour of the UI
- **Authentication** — Name + email registration and login, with email verification

## Real-Time Communication

The game uses a hybrid REST + Socket.IO architecture:

- **Socket.IO** handles live state: lobby state updates, action submission, chat, ranked queues, bossfight roster, city presence, and the Market. The server pushes updates — no polling.
- **REST** is used for one-time operations: lobby creation, authentication, shop, inventory, stats, merchants, and player data.

Every payload is validated with Zod on arrival. Every request sends `X-Protocol-Version` (REST) or `auth.protocol_version` (Socket.IO); `PROTOCOL_VERSION` in `src/config.ts` must be bumped together with wom-be's when wire shapes change.

## Backend

This frontend expects a backend API server (see [wom-be](https://github.com/mikaelra/wom-be), which documents its API and wire protocol). For local development, run the backend on port 5000 or set `NEXT_PUBLIC_BACKEND_URL` to point to your backend instance. In production, `NEXT_PUBLIC_BACKEND_URL` is baked into the build by `.github/workflows/deploy.yml`.

End-to-end tests (real browser, real backend) live in the separate `wom-e2e` repo and run nightly.

## Deployment

- **Web** — Self-hosted on a Hetzner VM with Docker. `.github/workflows/deploy.yml` runs lint/test/typecheck, then builds the image, pushes it to GHCR, and deploys it over SSH on every push to `master`. Configuration is in the top-level `Dockerfile`.
- **Steam** — `npm run build:native` + Electron; see [`electron/README.md`](electron/README.md) and [`steam/README.md`](steam/README.md).

Notable changes are recorded in [`CHANGELOG.md`](CHANGELOG.md).

## Design Docs

Plans in `docs/` record the design and status of larger features:

| Doc | Topic |
|---|---|
| [`CITY_SCENE_PLAN.md`](docs/CITY_SCENE_PLAN.md) | The city scene, signpost, and real sky |
| [`ASTRAL_TIMERS_PLAN.md`](docs/ASTRAL_TIMERS_PLAN.md) | Moon-phase wheel caps, solstice seasons, rank ladder |
| [`ASPECTS_PLAN.md`](docs/ASPECTS_PLAN.md) | Planetary conjunction lighting |
| [`MERCHANT_PLAN.md`](docs/MERCHANT_PLAN.md) | Astronomical merchant encounters |
| [`MARKET_PLAN.md`](docs/MARKET_PLAN.md) | Player-to-player trading post |
| [`MONETIZATION_PLAN.md`](docs/MONETIZATION_PLAN.md) | Frogskins, wheels, and the shop |
| [`RANK_SYSTEM_PLAN.md`](docs/RANK_SYSTEM_PLAN.md) | Ranked matchmaking and ladder |
| [`MOBILE_AND_STEAM_PLAN.md`](docs/MOBILE_AND_STEAM_PLAN.md) | Native builds, versioning, store distribution |
| [`LEGAL_COMPLIANCE_PLAN.md`](docs/LEGAL_COMPLIANCE_PLAN.md) | Privacy, consumer law, payments compliance |
| [`CODEBASE_HARDENING_PLAN.md`](docs/CODEBASE_HARDENING_PLAN.md) | Frontend refactor and test plan |
| [`more-harness.md`](docs/more-harness.md) | Testing/CI harness audit |
| [`ART_STYLE_PLAN.md`](docs/ART_STYLE_PLAN.md) | Hand-drawn art pass |
| [`CLOTHING_PLAN.md`](docs/CLOTHING_PLAN.md) | Garment slots (not built) |
| [`TEXT-FRONTEND.md`](docs/TEXT-FRONTEND.md) | Text-only frontend (not built) |
