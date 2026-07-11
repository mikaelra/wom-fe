# Codebase Hardening Plan — Frontend

A sequenced plan to make `wom-fe` solid enough to build new features on
without anxiety. The companion backend plan (which also defines the shared
frontend/backend protocol work and the security model changes this plan
depends on) lives in `wom-be/docs/CODEBASE_HARDENING_PLAN.md`.

## Where the codebase stands today

- **Logic and presentation are fused in god components.**
  `src/components/lobby/LobbyScene.tsx` is 1,539 lines mixing game-state
  interpretation, animation orchestration, timers, and 3D rendering.
  `src/app/page.tsx` (465) and `src/app/lobby/[lobbyId]/page.tsx` (396)
  each carry join/login/verify flows plus scene wiring plus socket
  lifecycle. Anything touching the lobby means re-reading 2,000+ lines.
- **Tests exist only for four leaf utilities** (`src/lib/__tests__/`):
  api error paths, gameEvents grouping, sceneConstants, frogSkins. No
  component tests, no hook tests, nothing covering the join/login flows or
  the state machine that drives a round.
- **The server boundary is unvalidated.** `src/lib/api.ts` casts
  `res.json()` straight to TS types; socket `state_update` payloads are
  trusted as `LobbyState`. A backend shape change becomes a silent
  `undefined` deep inside a Three.js component instead of a loud error at
  the boundary.
- **Socket usage is scattered.** `getSocket()` is a raw singleton; event
  names are string literals at each call site (`page.tsx`, `api.ts`,
  overlay components), and listener add/remove pairing is hand-rolled per
  component.
- **Identity is client-asserted.** Name/email ride in `localStorage` and are
  sent with every action. The backend plan (Phase 1a) replaces this with a
  join-issued session token; this repo must adopt it.
- **CI runs lint + vitest but not the type-checker on PRs** — `next build`
  (which type-checks) only runs on push to master, so a PR can merge with
  type errors.

The good news: `src/lib/` already shows the target pattern —
`gameEvents.ts`, `sceneConstants.ts`, `frogSkins.ts` are pure, typed, and
tested. The plan is mostly "move logic out of components into that layer."

## Guiding principles

- **SRP for components**: a component either interprets game state (hooks/
  lib, tested with vitest) or renders (R3F/DOM, kept thin). Never both.
- **DIP at the boundary**: components depend on parsed, typed domain objects
  produced by one validation layer — never on raw `fetch`/socket payloads.
- **Make illegal states unrepresentable**: model the client game phase as a
  discriminated union (`joining → lobby → playing → roundResult → gameover`)
  instead of overlapping booleans (`hasJoined`, `playerNameInit`,
  `gameover`, `winner != null`…).
- **Validate at the edge, trust inside.**

## Phase 0 — CI and tooling (1 small PR)

1. Add a `typecheck` job to `.github/workflows/deploy.yml`: `npx tsc --noEmit`
   on every PR (strict mode is already on — enforce it).
2. Add vitest coverage (`--coverage`) with a ratchet threshold set to the
   current number; raise it as phases land, never lower.
3. Add `environment: 'jsdom'` project to `vitest.config.ts` (keep the fast
   node project for lib tests) + React Testing Library, so component tests
   are possible in Phase 3.
4. Optional: `eslint-plugin-react-hooks` is included via next config —
   verify `exhaustive-deps` is error, not warn; stale-closure bugs in the
   socket effects are this codebase's most likely runtime failure.

## Phase 1 — Typed, validated boundary (the highest-leverage change)

1. **Introduce `zod` schemas for every server payload**: `LobbyState`,
   `Player`, `ChatMessage`, `GameEvent` (they already exist as interfaces in
   `src/types/game.ts` / `src/lib/gameEvents.ts` — derive the types from
   schemas instead: `z.infer`). Parse in exactly one place.
2. **Split `src/lib/api.ts` (239 lines) into:**
   - `lib/http.ts` — one `request<T>(path, schema, opts)` helper that owns
     fetch, JSON, error normalization (a typed `ApiError`), and zod parsing.
     The ten near-identical `if (!res.ok) throw new Error(...)` blocks
     collapse into it.
   - `lib/socket.ts` — the socket singleton plus a **typed event map**:
     one `ServerEvents`/`ClientEvents` interface pair (socket.io-client
     supports generic typing), event-name constants, and a
     `subscribe(event, handler)` that returns an unsubscribe function so
     components/hooks can't leak listeners.
   - `lib/api.ts` — thin, typed endpoint functions built on both.
3. **Fail loudly**: a zod parse failure logs the payload shape diff in dev
   and surfaces a user-visible "out of date / reload" state in prod —
   this is what turns backend drift from a haunted 3D scene into a
   one-line console error.
4. Unit tests: schema round-trips for every fixture payload (capture real
   payloads from the backend's golden tests — same fixtures, two repos,
   drift caught on either side; see backend plan Phase 4).

## Phase 2 — Extract the game-state machine from the components

1. **`useLobbyConnection(lobbyId)`** hook: owns socket join/rejoin,
   `state_update` subscription, reconnect handling (today a dropped socket
   silently stops updates — re-emit `join_room` + token on `reconnect`),
   and exposes `{ state, connectionStatus }`.
2. **`useLobbyGame(state, playerName)`** — a reducer (useReducer; reach for
   zustand only if prop-drilling still hurts afterwards) that derives the
   client phase union: current round, my player, am-I-ready, pending deny,
   winner, replay votes. All the `lobbyState.players.find(...)` logic
   scattered through `LobbyScene`/`LobbyOverlay`/`page.tsx` moves here.
3. **`useRoundTimer(roundEndTime)`**, **`useGameEvents(...)`** (the
   fetch-messages-per-round choreography), each pure enough to unit-test
   with fake timers.
4. **Slim the pages**: `app/lobby/[lobbyId]/page.tsx` keeps routing, the
   join/login form, and composition; `app/page.tsx`'s duplicated
   login/verify flow and `page.tsx`'s copy become one shared
   `useAuthFlow` hook + form component.
5. **Split `LobbyScene.tsx`** along what it already contains: scene setup /
   camera, per-player avatar group, effect orchestration (the
   sword/shield/well/fire effects keyed off `GameEvent`s), and HUD wiring.
   Target: no file over ~400 lines, and the effect-orchestration mapping
   (`GameEvent[] → which animations to play`) becomes a pure function in
   `lib/` with unit tests — it's game logic, not rendering.

Each extraction is test-first: write the hook/function test from the
current behavior, move the code, components shrink mechanically.

## Phase 3 — Component & flow tests

With logic in hooks/lib, what's left to test as components is small:

- **RTL tests for the DOM layer**: `LobbyOverlay` (action buttons reflect
  phase, deny modal, replay voting), the join/login/verify forms (happy
  path + wrong-email + expired-code branches — these exercise the
  `useAuthFlow` hook), settings page toggle flow.
- **Do not try to render R3F scenes in jsdom.** The 3D components stay
  covered indirectly: their props are produced by tested functions, and
  their own remaining logic should approach zero.
- **One Playwright E2E smoke** (new `e2e/` dir, own CI job, runs against
  `docker compose` of wom-be + wom-fe): create lobby → add TURTLE dummy →
  start → submit action+resource → round resolves → game over screen.
  This single test exercises the full contract both repos share and is the
  highest-value "worry less" artifact in either repo. Keep it to 1–3
  scenarios; E2E suites rot when they sprawl.

## Phase 4 — Adopt the backend security model

Coordinated with backend Phase 1a/1b (see that plan):

1. Store the join-issued session token (memory + `sessionStorage`), send it
   on `join_room`/reconnect; stop sending `name`/`admin` in action payloads.
2. Private data (`messages`, `events`, `personal_history`) moves off the
   broadcast state — switch `useGameEvents` to the authenticated channel
   the backend provides (`private_update` or token-gated GET).
3. Treat `localStorage` name/email as a convenience prefill only, never as
   identity.

## Phase 5 — Housekeeping (opportunistic, no dedicated PRs)

- `src/app/Playerv1.tsx` vs `src/components/Playerv1.tsx` — one is dead;
  delete it.
- `package.json` name `my-3d-app` → `wom-fe`.
- `src/config.ts` hardcodes a Render URL as the fallback backend; make dev
  fallback `http://localhost:5000` and fail loudly in prod builds when
  `NEXT_PUBLIC_BACKEND_URL` is unset, so a misconfigured deploy can't
  silently talk to the wrong backend.
- Standardize error surfaces: one `<ErrorBoundary>` around the canvas, one
  toast/banner pattern for `ApiError`, instead of per-call `alert`/silent
  catch.

## Suggested order of work

1. Phase 0 (CI: typecheck + coverage ratchet) — half a day.
2. Phase 1 (zod boundary + typed socket layer) — the anti-anxiety core.
3. Phase 2 hooks extraction — several PRs, one hook/component each.
4. Phase 3 RTL tests as extractions land; Playwright smoke once stable.
5. Phase 4 when the backend token work ships.

Definition of done for any new feature after this: server data enters
through a zod schema, game logic lands in `lib/` or a hook with a vitest
file next to it, components stay presentational, and the E2E smoke still
passes.
