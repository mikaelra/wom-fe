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

- ✅ **done** — All 4 items landed together:
  1. `typecheck` job added to `.github/workflows/deploy.yml`
     (`npx tsc --noEmit`), gating `build-and-deploy` alongside `lint`/`test`.
  2. `vitest.config.ts`'s `coverage` block ratchets `src/lib/**/*.ts`
     (the tested "logic" layer — not the whole `src/` tree, since
     components/pages are still god-objects pre-Phase-2 and R3F/Three.js
     scene components are never meant to be unit-tested, per this doc's
     own Phase 3 test strategy below; a whole-tree ratchet would just
     measure "how much of the app is 3D rendering"). Threshold set with
     margin below the observed 31.78%/30%/33.69%/31.37%
     (statements/branches/functions/lines), stable across repeated runs.
     Raise it as later phases add real tests for a new layer (Phase 2's
     hooks, which live flat in `src/lib/` alongside everything else —
     already inside this glob; specific RTL-tested DOM components in
     Phase 3); never lower it to make a PR pass.
  3. `vitest.config.ts` restructured into `test.projects`: the existing
     fast `node` project (`src/**/*.test.ts`, unchanged) plus a new
     `jsdom` project (`src/**/*.test.tsx`) with `@testing-library/react`
     + `@testing-library/jest-dom` wired via `vitest.setup.ts`. Proven
     end-to-end with a real first test,
     `src/components/__tests__/ResourceCard.test.tsx` (not a throwaway
     smoke test) — a small, pure-DOM component (no R3F) that's genuinely
     live: it's the HP/Coins/ATK resource button rendered unconditionally
     for every non-spectator player during gameplay. (An earlier draft
     used `FloatingMessage.tsx` instead — caught during PR review that
     it's dead code, gated behind a `showFloatingMessages` flag that's
     hardcoded `false` everywhere and never flipped on, superseded by the
     newer animation system. Swapped rather than testing a code path
     nothing exercises, and removed the dead component plus the
     `showFloatingMessages`/`floatingMessages`/`onDoneFloating` plumbing
     in `SceneOverlay.tsx`/`LobbyOverlay.tsx` in the same PR, matching
     the style of PR #163's earlier dead-code cleanup.)
  4. `eslint.config.mjs`: `react-hooks/exhaustive-deps` was `warn` by
     default via `eslint-config-next`; flipped to `error`. Verified zero
     new violations in `src/` before flipping.

## Phase 1 — Typed, validated boundary (the highest-leverage change)

- ✅ **done** — All 4 items landed together (they're tightly interlocking:
  can't split `api.ts` without schemas to hand `request()`, can't
  round-trip test without the schemas existing):
  1. `zod` schemas for every server payload the frontend actually
     consumes: `Player`/`LobbyState`/`ChatMessage`/`Relic` stay in
     `src/types/game.ts` (same export names, same import paths — zero
     call-site churn beyond field-accuracy fixes below), `GameEvent`
     stays in `src/lib/gameEvents.ts`; both now `z.infer`-derived. New
     `src/lib/schemas.ts` holds the HTTP response-envelope schemas (one
     per route) and the socket envelope schemas not already in
     `types/game.ts`. Built directly against wom-be's `docs/PROTOCOL.md`
     (that repo's own Phase 4), not assumption — this surfaced real,
     concrete drift between what the frontend *claimed* the wire shape
     was and what it actually is:
     - `Player` had `messages`/`submittedAction`/`submittedResource`/
       `target` fields the backend's `state_update` never sends
       (deliberately excluded by the backend's Phase 1b hidden-info fix)
       and that nothing on this side ever read either — dropped. It was
       missing `bot`, which the backend always sends — added.
     - `start_time` (`LobbyState` and `getNextBossfightTime()`) was typed
       `number` but the backend always sends an ISO8601 *string* — fixed.
       This "worked" before only because `new Date()` silently accepts
       either.
     - `LobbyState.replay_votes`/`replay_votes_count`/
       `replay_votes_needed`/`next_lobby_id` don't exist on the wire at
       all. Unlike the `Player` fields above, these *were* actively read:
       a whole "Rematch?" checkbox UI in `SceneOverlay.tsx`/
       `LobbyOverlay.tsx`, calling `requestReplay()` →
       `POST /request_replay/<id>`, a route the backend has never
       implemented. This exact half-built/broken feature was already
       removed upstream on `master` (PR #163, wom-fe) — this branch just
       predated that PR. Folded the removal into this phase since an
       honest `LobbyState` schema structurally can't include fields the
       server never sends. Also dropped `getState()` (`GET /get_state/<id>`,
       fully unreferenced, also already removed in PR #163 — the route
       doesn't exist on the backend either).
     - `Relic` was missing `boss_id`/`created_at`/`power_category` that
       the backend sends (unused by the UI today, kept anyway for
       accuracy). `boss_fight`/`gameover` were nullable but the backend
       always sends a real boolean — tightened.
     - `getPlayerMessages`'s `messages` field is a genuine mix of plain
       strings and single/multi-element string arrays — confirmed
       directly against wom-be's engine code (most entries appended as
       plain strings, several inserted as one-element lists). The
       existing `.flat()` call already handled this; the schema now makes
       it explicit instead of the too-narrow `string[][]` the old type
       claimed.
  2. `src/lib/api.ts` split into `lib/http.ts` (`request<S>(path, schema,
     opts)`, `ApiError`, `SchemaMismatchError`, the session-token store),
     `lib/socket.ts` (the `getSocket()` singleton, typed
     `ServerToClientEvents`/`ClientToServerEvents`, `subscribe()`), and a
     thin `lib/api.ts` built on both. Fixed a real, latent bug this
     surfaced: `SceneOverlay.tsx` used to clean up socket listeners via
     `sock.off(event)` with **no handler argument**, which wipes every
     listener for that event on the shared singleton socket, not just
     that component's own — harmless only because nothing else happened
     to listen concurrently. `subscribe()`'s returned unsubscribe closure
     fixes this by construction; rewired `SceneOverlay.tsx`'s three
     listeners (and `app/lobby/[lobbyId]/page.tsx`'s preview listener) to
     use it.
  3. Fail loudly: a zod parse failure (`request()` or `subscribe()`) logs
     the full shape diff via `console.error` in both dev and prod. Turning
     this into a user-visible "out of date, reload" banner is Phase 5's
     `<ErrorBoundary>` work, not done here — this phase's job was only to
     guarantee drift is never silent.
  4. `src/lib/__tests__/schemas.test.ts`: round-trip tests for every
     schema, fixtures built directly from `docs/PROTOCOL.md`'s documented
     shapes (including the asymmetric/edge cases: `get_bossfight_lobby`'s
     absent-not-null `token`, the mixed-type `messages` field), plus
     deliberately-malformed cases confirming rejection.
- Coverage ratchet raised (margin below the observed
  38.23/34.4/36.66/38.09) — `src/lib/schemas.ts`/`http.ts`/`socket.ts`
  were already inside the existing `src/lib/**/*.ts` include from Phase 0,
  no glob change needed.

## Phase 2 — Extract the game-state machine from the components

Lands as several PRs, one hook/component each (unlike Phase 0/1).

1. ✅ **done** — `src/lib/useLobbyConnection.ts`: owns socket join/rejoin,
   `state_update`/`chat_message`/`error` subscription, and — newly, since
   nothing tracked this before — real `connectionStatus`
   (`'connecting'|'connected'|'disconnected'`) via the socket's own
   `connect`/`disconnect` events (`disconnect` was never even listened for
   previously). Exposes `{ state, connectionStatus }`; presentation
   decisions (unread-chat badge, error `alert()`) move out to two optional
   callbacks, keeping the hook itself presentation-free. Extracted from
   `SceneOverlay.tsx`'s two effects (~80 lines net removed).
   - Along the way: the pre-existing 3s idle-window `join_room` polling
     fallback carried a dead branch from the removed Rematch feature —
     `git log -S "awaitingRematch"` traced it to `d951ff9 "Add post-game
     polling fallback for the rematch vote counter"`, which kept polling
     for the entire post-gameover screen (today just a static message,
     nothing live left to wait on). Fixed to poll only the pre-game lobby
     wait, not copied forward verbatim. (Also found and ruled out
     resurrecting an orphaned, never-merged commit attempting almost the
     same hook — it predated the session-token auth model and carried the
     identical bug uncorrected.)
2. ✅ **done** — `src/lib/useLobbyGame.ts`: derives the client phase union
   (`'loading' | 'lobby' | 'playing' | 'gameover'` — no distinct
   `roundResult` phase exists in the current UI, so none was invented)
   plus `myPlayer`/`isAdmin`/`isReady`/`enemy`/`winner`/`wellWinner`/deny
   state/`canAct` from a `LobbyState` snapshot. Built as a **plain
   function of its arguments, not a `useReducer`** as the plan doc
   suggested — every value here is a pure, stateless derivation from
   `(state, playerName)`, with no action/dispatch logic anywhere in
   scope; a reducer with nothing to reduce would be manufactured
   structure. Research found real duplication beyond the plan's own
   description: **"find my player" was independently re-implemented 4
   times** across `SceneOverlay.tsx`, `LobbyScene.tsx` (×2), and
   `LobbyOverlay.tsx`; **the exact same 5-condition "can I act right
   now" boolean existed twice under different names**
   (`SceneOverlay.tsx`'s `showActions` and `LobbyScene.tsx`'s
   `showAttackButtons` were the identical formula, reordered) — unified
   under `canAct`. Wired into all three components, each passing its own
   already-held `state` reference (the hook takes `state` as a plain
   argument rather than owning a subscription, exactly so it can be
   called once per component without needing them to share one `state`
   instance).
   - Discovered, deliberately deferred follow-ups (not fixed here): three-plus
     separate copies of `state` already float around the lobby page
     (`page.tsx`'s `lobbyState`/`previewState`, `LobbyOverlay.tsx`'s
     `localState`, `SceneOverlay`'s internal `useLobbyConnection` state) —
     unifying that is a materially bigger architectural change than this
     step asked for. `src/lib/useStagedResources.ts` independently
     re-derives `myPlayer` too, sitting right next to the fix in
     `SceneOverlay.tsx` — not touched since it's a much larger hook with
     its own animation-timing state, and changing its signature would
     touch its call sites too.
3. Split into two steps — research found this covers two concerns of very
   different size/risk (the same split the backend hardening effort used
   for its own Phase 3, 3a logging / 3b error-handling):
   - ✅ **done (3a)** — `src/lib/useRoundTimer.ts` (`SceneOverlay.tsx`'s
     `secondsLeft` countdown, lifted verbatim) and
     `src/lib/useBossfightCountdown.ts` (the "next boss fight" countdown,
     independently reimplemented **3 times** — `SceneOverlay.tsx`,
     `app/page.tsx`, `components/home/HomeOverlay.tsx` — each with a
     different gating condition, all preserved exactly via one `enabled`
     boolean parameter; also fixes a real gap where `SceneOverlay.tsx`'s
     version had no cancellation guard on its fetch). An orphaned,
     never-merged commit (`302651d`, found during step 1's research)
     already built almost exactly these two hooks — unlike its
     `useLobbyConnection` attempt, this part predates nothing (pure timer
     logic, no auth coupling) and was directly usable as a reference.
     `LobbyScene.tsx`'s own, third, round-countdown (`warnLevel`) was
     deliberately **not** unified — it intentionally avoids storing raw
     seconds to prevent re-rendering the whole 3D scene every tick, and
     using the shared hook there would reintroduce that exact perf
     problem.
   - ✅ **done (3b)** — `src/lib/useGameEvents.ts` centralizes
     `getPlayerMessages`, which was independently called **3 times per
     round** — `SceneOverlay.tsx` (feeds the "Round messages" text
     panel), `src/lib/useStagedResources.ts` (feeds HP/coin/ATK
     stat-card staging), `LobbyScene.tsx` (feeds sword/shield/well-reward
     3D animation scheduling). The hook fetches on the broadest of the 3
     former trigger conditions (round or `deny_target` change — a
     superset covering the other two's narrower triggers for free) and
     tags each result with the round it was fetched for; each consumer
     keeps its own exact gating logic, now comparing its round of
     interest against the tagged result instead of firing its own fetch.
     Also fixes a real gap: `SceneOverlay.tsx`'s original fetch had no
     cancellation guard, so a slow response could still call
     `setMessages` after the component moved on to a new lobby.
     - **Net call count: 3 → 2, not 3 → 1.** `LobbyScene.tsx` renders in
       a separate component tree (inside the R3F `Canvas`) from
       `SceneOverlay.tsx`/`useStagedResources.ts` (rendered via
       `LobbyOverlay.tsx`, a sibling under `app/lobby/[lobbyId]/page.tsx`)
       — collapsing to a single shared fetch across both trees would mean
       lifting `useGameEvents` into `page.tsx` and threading its result
       down as a prop through `LobbyOverlay.tsx` too, a materially bigger
       change than this step's scope. Settled for one hook call per tree:
       `SceneOverlay.tsx` calls it once and passes the result into
       `useStagedResources`, `LobbyScene.tsx` calls it independently.
       Still a real fix — down from 3 uncoordinated fetches to 2, one of
       which gained a cancellation guard it previously lacked.
     - **Splitting the effects, correctly.** `LobbyScene.tsx`'s single
       original effect both detected round increases (via `prevStateRef`,
       clearing stale animation state) *and* fetched/scheduled the
       animations from the response — in one body. Naively adding
       `gameEvents` to that effect's dependency array would have broken
       the round-increase check (`prevStateRef` gets updated to the
       current state on the *first* invocation, so a later re-run once
       `gameEvents` arrives would wrongly see `prev.round === state.round`
       and bail). Split into two effects: one unchanged, synchronous,
       round-increase detector (clears stagger timeouts / kill state,
       schedules the well-loss glow — none of which need event data); a
       second that schedules the combat/well-reward animations once
       `gameEvents` for the current round arrives, gated by its own
       `processedEventsRoundRef` (not `prevStateRef`, which the first
       effect already owns) so it runs exactly once per round.
       `useStagedResources.ts`'s own staging effect needed the same
       `processedRoundRef` guard, plus depending on `gameEvents?.round`
       rather than the `gameEvents` object itself — that effect has a
       cleanup function (clearing its staged-reveal timers), and a
       same-round `gameEvents` refetch (e.g. triggered by
       `SceneOverlay.tsx`'s `deny_target` dependency) would otherwise
       re-run the effect, tearing down still-pending timers via cleanup
       without rescheduling them.
     - **Removed now-dead error handling.** `getPlayerMessages`
       (`src/lib/api.ts`) already catches its own fetch failures into an
       empty `{messages: [], events: []}` result and never rejects — so
       each consumer's `.catch(() => {})` around its own inline fetch was
       already unreachable before this change. Not carried forward into
       `useGameEvents` or its consumers.
4. **Slim the pages** via a shared `useAuthFlow` hook for the
   `checkName → claimed? → logInUser → requires_code? → verifyLoginCode`
   flow. Research found this duplicated in **5** places, not the 2
   originally described here, across 3 distinct shapes — split into
   sub-steps accordingly (mirroring the 3a/3b split above):
   - ✅ **done (4a)** — `src/lib/useAuthFlow.ts`, covering **Shape A:
     single action, always `checkName`-gated** — `app/page.tsx` (the
     Athens raid popup) and `app/lobby/[lobbyId]/page.tsx` (the
     join-lobby form). A real bug found and fixed along the way: the
     Athens popup was the *only* Shape A site that never checked
     `logInUser`'s `requires_code` field, letting a 2FA-enabled account
     bypass the verification-code step entirely when entering the raid
     from the home screen — every other entry point (including the lobby
     join form) correctly gated it. Building the shared hook with the
     code step included and wiring it into both sites closes this gap as
     a natural consequence of unification. Two small, deliberate,
     explicitly-noted behavior unifications (not pure preservation): an
     empty name submit now always shows "Please enter a username." (the
     lobby page silently no-op'd here before, reachable only by pressing
     Enter on an empty, button-disabled field); the lobby page's
     name-input `onChange` used to also clear `emailMode`/`codeMode`,
     dead code since the field is `readOnly` while either mode is active
     (matches the Athens popup, which never had this reset). Not built as
     a shared JSX component — the two popups differ enough in visual
     chrome (colors, copy, button labels) that one parameterized
     component would cost more than the duplication it'd save; revisit
     only if 4b/4c reveal the same JSX shape recurring again.
   - **Not yet done (4b)** — **Shape B: dual action via a `pendingAction`
     union, with an "already-logged-in, skip `checkName`" shortcut** —
     `HomeOverlay.tsx` and `WorldMapOverlay.tsx` (near-identical to each
     other). Needs the hook (or a variant) to support a caller-tracked
     "which action is pending" dispatch that Shape A doesn't have.
   - **Not yet done (4c)** — **Shape C: no `checkName` gate, direct
     login** — `app/login/page.tsx`. Name+email entered together up
     front, straight to `logInUser`, no "new vs. existing name" branch.
     Likely the simplest of the three shapes, but still its own.
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

1. ✅ Phase 0 (CI: typecheck + coverage ratchet) — half a day.
2. ✅ Phase 1 (zod boundary + typed socket layer) — the anti-anxiety core.
3. **In progress** — Phase 2 hooks extraction — several PRs, one
   hook/component each. Steps 1 (`useLobbyConnection`), 2 (`useLobbyGame`),
   3a (`useRoundTimer`/`useBossfightCountdown`), 3b (`useGameEvents`), and
   4a (`useAuthFlow` for the Shape A sites, incl. a 2FA-bypass bug fix)
   done; **next up** is item 4b (`useAuthFlow` for `HomeOverlay.tsx`/
   `WorldMapOverlay.tsx`).
4. Phase 3 RTL tests as extractions land; Playwright smoke once stable.
5. ✅ Phase 4 items 1–2 (session tokens) done ahead of order, coordinated
   with the backend token work shipping (PRs #164/#165). Item 3
   (treat `localStorage` as convenience-only) is effectively already true
   as a consequence, but not separately audited yet.

Definition of done for any new feature after this: server data enters
through a zod schema, game logic lands in `lib/` or a hook with a vitest
file next to it, components stay presentational, and the E2E smoke still
passes.
