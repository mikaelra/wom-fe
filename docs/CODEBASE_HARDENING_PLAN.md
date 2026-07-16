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
   - ✅ **done (4b)** — **Shape B: dual action via a `pendingAction`
     union, with an "already-logged-in, skip `checkName`" shortcut** —
     `HomeOverlay.tsx` and `WorldMapOverlay.tsx` (near-identical to each
     other). No changes needed to `useAuthFlow.ts` itself — both callers
     wrap it, tracking "which action is pending" and the
     already-logged-in shortcut entirely on their own side, confirming
     4a's hook surface was general enough. One real structural difference
     between the two files shaped the implementation:
     `WorldMapOverlay.tsx` opens a blank popup first, so its own
     `pendingAction` can stay `useState` (read safely across the render
     boundary between "open" and "submit" clicks, and it's also
     rendered — "join"/"create" copy text). `HomeOverlay.tsx` has no
     separate open step — `handleCreate`/`handleJoin` set the pending
     action and call the hook's `handleSubmitName()` in the *same*
     synchronous click handler, so `useState` would be stale-closure-prone
     there; it uses a `useRef` instead. Also unified
     `HomeOverlay.tsx`'s `checkName`-step error reporting from `alert()`
     to inline text (a small new element under the name input), matching
     every other error in both files and 4a's own precedent.
     `WorldMapOverlay.tsx` already used inline errors throughout, no
     change needed there.
   - ✅ **done (4c)** — **Shape C: no `checkName` gate, direct login** —
     `app/login/page.tsx`. This closes out item 4: all 5 duplicate sites
     now share `useAuthFlow.ts`. One small hook change, unlike 4a/4b:
     `submitErrorFallback` became optional (defaulting internally to
     "Something went wrong."), since this page never calls
     `handleSubmitName()` (it has no `checkName` step at all) and
     shouldn't need to supply a string for a path it can't reach. Two
     deliberate, explicitly-noted unifications: this page's own combined
     "name and email both required" validation isn't replicated —
     `handleLogin`'s built-in check only covers email, so a caller-side
     guard (`if (!authFlow.name.trim()) return;`) silently blocks the
     empty-name case (matching the "silently blocked, no message"
     precedent from 4a) rather than reproducing the exact original
     message; and this page's login failures, previously an
     undifferentiated `err.message`, now route through the hook's
     `emailError` and pick up the "Wrong email" special-casing every
     other site already had — a minor improvement, not a preserved
     design choice.
5. **Split `LobbyScene.tsx`** along what it already contains: scene setup /
   camera, per-player avatar group, effect orchestration (the
   sword/shield/well/fire effects keyed off `GameEvent`s), and HUD wiring.
   Target: no file over ~400 lines, and the effect-orchestration mapping
   (`GameEvent[] → which animations to play`) becomes a pure function in
   `lib/` with unit tests — it's game logic, not rendering. Direct
   full-file read (1552 lines) found the same 4 concerns the doc already
   named; split into sub-steps ordered by risk, lowest first (mirroring
   the 3a/3b and 4a-4c splits above) — the effect-orchestration piece
   drives real-time 3D animation timing (staggered `setTimeout`s, coin-
   count jitter, precise delay math) and is deliberately done last, once
   the file is already smaller:
   - ✅ **done (5a)** — `src/components/lobby/PlayerAvatars.tsx`: a pure,
     behavior-preserving move of the entire per-player/lost-soul/crown
     avatar group (`PlayerWithName`, `PlayerModelLayer`,
     `BobbingCrown`/`WinnerCrown`/`WellCrown`, `LostSoulMesh`/
     `LostSoulModel`, their private stacked-HTML helpers, and the
     `LOST_SOUL_POSITIONS`/`BOSS_MAX_HP` constants) out of
     `LobbyScene.tsx` — no logic changes. Verified via grep, not
     assumption, which of the file's `useGLTF.preload(...)` calls belong
     to this group (the player/crown/soul GLBs) versus the
     effect-orchestration group (shield/sword/well-reward GLBs, staying
     put) before moving them. Dropped `LobbyScene.tsx` from 1552 to 1141
     lines.
   - ✅ **done (5b)** — `src/components/lobby/CameraFlyIn.tsx`: the
     camera controller (frame-loop lerp, pan-offset orbit, responsive
     FOV) and its 5 scratch-vector constants, moved verbatim. Verified
     via grep that `SEA_LEVEL`/`SUN_POSITION` — sitting right next to
     the camera constants in the original file — aren't actually camera
     logic at all (only ever read at `LobbyScene.tsx`'s own
     `<SeaAndSky>` JSX call site) and so stayed put, rather than being
     swept along just because of their proximity. Dropped
     `LobbyScene.tsx` from 1141 to 1092 lines.
   - ✅ **done (5c)** — `src/lib/combatAnimationPlan.ts`: the
     `GameEvent[] → which animations to play` mapping, as a pure,
     100%-statement-covered function (`buildCombatAnimationPlan`),
     completing item 5. Read the original ~270-line effect in full
     (not summarized) to preserve every timing/grouping decision
     exactly rather than redesigning it:
     - The function returns a flat, ordered list of `{delayMs, actions}`
       batches. `LobbyScene.tsx`'s effect becomes a thin executor: apply
       synchronously if `delayMs <= 0` (matching the original's
       non-deferred `setState` calls exactly — multiple synchronous
       calls still batch into one React 19 render, confirmed via
       `package.json`), else `setTimeout`.
     - Groupings were preserved exactly as found, not standardized:
       some sibling effects (kill-fire + kill-loot) were already two
       independently-scheduled timers in the original, so they stayed
       two independent batches; the one deliberately-bundled pair
       (an incoming strike + its shield) stayed one batch, since
       splitting it into two independently-scheduled timers could
       theoretically let a render land between them.
     - Confirmed via grep, not assumed: `killFireEvents`/
       `wellRewardEvents` self-remove via their own component's
       `onDone` callback, so the plan needs no removal action for them;
       the round-transition effect and the `onStrike`/`onDone`
       callbacks on `<SwordEffect>` in the JSX react to the animation
       actually completing (not a computed delay) and are out of scope.
     - `WELL_SPLASH_POSITION`/`WELL_GLOW_POSITION` stayed in
       `LobbyScene.tsx` (JSX-only); `WELL_LOSS_GLOW_RADIUS`/
       `WELL_FX_DURATION` moved but are re-exported since the
       round-transition effect and the `?welltest=`/`?killtest=` debug
       preview effects (untouched) still need them.
     - Dropped `LobbyScene.tsx` from 1092 to 750 lines; the new
       `combatAnimationPlan.ts` (408 lines, 100% statement coverage)
       pushed the whole-suite coverage ratchet from ~55.7% to ~63.7%.
   - HUD wiring: re-evaluated now that all of 5a-5c are done —
     `LobbyScene.tsx` is already down to 750 lines from 1552; not
     pursuing a further cut here for now.

Each extraction is test-first: write the hook/function test from the
current behavior, move the code, components shrink mechanically.

## Phase 3 — Component & flow tests

With logic in hooks/lib, what's left to test as components is small:

- ✅ **done** — `src/components/lobby/__tests__/LobbyOverlay.test.tsx`.
  Direct read found this file's own description here was stale on two
  counts, corrected rather than carried forward: "replay voting" no
  longer exists (removed in Phase 1); "action buttons reflect phase,
  deny modal" isn't actually in `LobbyOverlay.tsx` at all — that logic
  lives in `SceneOverlay.tsx` (the component `LobbyOverlay` renders via
  `<SceneOverlay config={lobbyConfig} renderPreGame={renderPreGame}
  .../>`), a separate, bigger testing surface — see below.
  `LobbyOverlay.tsx` itself is a thin wrapper: `InviteSection`
  (copy-link/QR-code popover), two pure render-prop functions
  (`renderGameOver`, `renderPreGame`) handed to `SceneOverlay`, and one
  small derived gate (`showNudge`) for `BossSignupNudge`. Added `export`
  to the three (pure visibility change, no logic change) so they're
  testable without mounting the whole tree; `SceneOverlay` itself is
  mocked to a stub for the `showNudge`-gate test, driven via a captured
  `onStateChange` callback. 14 new tests; no coverage-ratchet change
  (this file isn't in the `src/lib/**/*.ts` glob, confirmed via a run).
- ✅ **done (core branching + actions)** —
  `src/components/__tests__/SceneOverlay.test.tsx`. `SceneOverlay.tsx`
  composes 6 hooks, every one already unit-tested in Phase 2
  (`useLobbyConnection`, `useLobbyGame`, `useRoundTimer`,
  `useBossfightCountdown`, `useGameEvents`, `useStagedResources`) —
  exactly Phase 2's payoff: mocked all 6 (plus `@/lib/socket`) so only
  `SceneOverlay`'s own logic is under test, not the hooks' own behavior.
  11 new tests cover: the loading state; pre-game delegation
  (`renderPreGame` called with the right computed props, and its
  `onStartGame`/`onAddDummy`/`onKick` wired to the right socket emits);
  game-over delegation (`renderGameOver` called with the right props);
  `canAct`/`hidePlayerActionButtons`-driven action-button and
  resource-card gating; the deny picker (visibility, populated options,
  disabled-until-selected, `submit_deny_target` emit). No coverage-ratchet
  *glob* change (`SceneOverlay.tsx` isn't in `src/lib/`), but observed a
  small, real, stable increase anyway (~63.97/59.51/59.85/65.06 vs.
  ~63.72/58.84/59.85/64.79) — still within the existing margin, so no
  numeric threshold change needed; confirmed via a run rather than
  assumed either way.
- ✅ **done (remainder)** — extended `SceneOverlay.test.tsx` with the 4
  pieces deferred above, closing out this file's RTL coverage. 16 more
  tests: the chat panel (toggle/send/clear-input/unread-badge/
  click-outside), tested independently against **both** the pre-game
  and in-game chat blocks — they're two separate, nearly-duplicate JSX
  regions, not one shared component, so passing one doesn't guarantee
  the other; the messages panel's overflow measurement (stubbed
  `ResizeObserver`, scoped to this test file only — jsdom has no native
  implementation at all — plus a stubbed `scrollHeight` via
  `Object.defineProperty`, since jsdom elements always report 0); the
  player list (crown/skull/idle indicators, spectator exclusion,
  own-name highlighting); the warn-blink cues. The last of these
  surfaced a genuinely easy-to-miss distinction verified against the
  actual code rather than assumed: the countdown *number*'s own
  red-text threshold (`secondsLeft <= 10`) is **not** the same as the
  action-button blink's red threshold (`secondsLeft <= 5`) — at 8
  seconds the number is already red while the buttons are still only
  gold. Coverage ratchet unaffected (confirmed via a run — exactly
  unchanged from the prior step, since this addition touches no new
  `src/lib` import paths).
- RTL tests for the 5 `useAuthFlow` sites (happy path + wrong-email +
  expired-code branches — `useAuthFlow` itself is already unit-tested
  at 94%+ coverage; the gap is whether each site's own JSX correctly
  reflects the hook's state). Split by site, smallest/simplest first:
  - ✅ **done (1/5)** — `app/login/page.tsx` (Shape C, no `checkName`
    gate). `src/app/login/__tests__/page.test.tsx`: uses the **real**
    `useAuthFlow` hook (not mocked) with `@/lib/api`'s `logInUser`/
    `verifyLoginCode` mocked — same principle as `SceneOverlay.tsx`'s
    tests, just inverted (there the hooks were mocked and the page's own
    logic was real; here the hook is real and only its network calls are
    mocked, since what's under test is the page's JSX wiring, not a
    re-test of `useAuthFlow`'s own branching). Establishes this repo's
    first `next/navigation` `useRouter` mock. 7 tests: login without a
    code, the `requires_code` code-view switch, the empty-name silent
    block, the empty-email inline error, "Wrong email", a wrong-then-right
    code round trip, and the Back button preserving typed input. Small
    real coverage increase (~64.34/59.95/59.85/65.47), confirmed via a
    run.
  - ✅ **done (2/5)** — `HomeOverlay.tsx` (Shape B — dual action via a
    `pendingActionRef`, plus an already-logged-in `checkName`-skip
    shortcut). Grepped all 5 sites for `Canvas`/`@react-three` first:
    the two remaining Shape A sites (`app/page.tsx`,
    `app/lobby/[lobbyId]/page.tsx`) both render a `<Canvas>` directly
    (full pages combining the 3D scene with the popup) and would need
    new R3F-mocking infrastructure this repo doesn't have — the
    hardening doc is explicit that R3F scenes shouldn't be rendered in
    jsdom. `HomeOverlay.tsx`/`WorldMapOverlay.tsx` don't import
    `@react-three/fiber` themselves, so those two (Shape B) went first;
    the two Canvas-rendering pages are deferred until/unless that
    infrastructure is worth building. (Correction made in site 3 below:
    "doesn't import R3F" turned out to be true only of `HomeOverlay.tsx`
    — `WorldMapOverlay.tsx` renders `RopedButton3D`/`RopedInput3D`,
    which *do* render `<Canvas>` internally, so its test mocks those two
    components rather than skipping R3F-mocking entirely.)
    `src/components/home/__tests__/HomeOverlay.test.tsx`: same
    real-hook/mocked-`@/lib/api` approach as site 1. 9 tests: logged-out
    UI, create/join for both unclaimed and claimed names, the
    claimed-name modal completing the *correct* pending action (create
    vs. join — proving `pendingActionRef` threads through, not just
    "some action fires"), the code step (wrong then right code), the
    already-logged-in shortcut (asserting `checkName` is never called,
    not just that create succeeds), "Choose new name", and logout. One
    self-caught test bug during this step: an assertion assumed the
    modal closes right after a successful login — it doesn't, in
    production the page *navigates away* (unmounting the component);
    with `router.push` mocked in the test, no navigation happens, so the
    modal staying mounted is expected test-harness behavior, not a
    product bug. No coverage-ratchet change, confirmed via a run.
  - ✅ **done (3/5)** — `WorldMapOverlay.tsx`. Same real-hook/
    mocked-`@/lib/api` approach as sites 1-2, plus one addition this
    site needed that the others didn't: it renders
    `RopedButton3D`/`RopedInput3D` (`@/components/hud/*`) instead of
    plain HTML buttons/inputs, and both of those internally render
    `@react-three/fiber`'s `<Canvas>` (gated behind a `lowQuality`
    state that starts `false` on first render) — invisible from
    grepping `WorldMapOverlay.tsx`'s own imports, only found by reading
    the child components directly. Fixed by mocking both to plain
    accessible stand-ins (`<button>`/pass-through `children`) scoped to
    this test file, the same "mock what's not the thing under test"
    principle used for `SceneOverlay.tsx`'s 6 hooks.
    `src/components/worldmap/__tests__/WorldMapOverlay.test.tsx`, 9
    tests: logged-out UI, the blank-name-popup-first flow (this file's
    real difference from `HomeOverlay.tsx`, which reads an
    already-typed name directly with no separate "open" step) for both
    Join and Create with an unclaimed name, the claimed-name email step
    completing the *correct* pending action (create vs. join, both
    directions tested), the code step (wrong then right code), the
    already-logged-in shortcut (`checkName` never called *and* the
    popup never opens at all), Cancel, and the user menu/logout. No
    coverage-ratchet change, confirmed via a run (exactly unchanged from
    site 1's numbers, matching site 2 — neither file is in `src/lib/`).
  - ✅ **done (4/5)** — `app/page.tsx`'s Athens raid popup. First test in
    this repo to mock `@react-three/fiber` itself rather than a component
    that happens to use it: `Canvas` is mocked to render its children
    directly (no real `<canvas>`/WebGL context), and `useFrame`/`useThree`
    are stubbed since the module shape has to satisfy the page's import
    statement. Two things were verified empirically before finalizing
    this, not assumed: jsdom's `requestAnimationFrame` does fire (on a
    real timer, catchable with `waitFor`) — relevant since the world-map
    Canvas only mounts once an RAF-delayed `sceneReady` flag flips; and
    `vi.mock('@/components/worldmap/WorldMap', ...)` does correctly
    intercept the module despite it being wrapped in
    `next/dynamic(() => import(...))`, confirmed with a throwaway repro
    first since this repo had no prior test combining the two.
    `WorldMap` itself (the 3D city-picker, out of scope) is mocked to a
    button that invokes its real `onCityClick` prop, and the already
    separately-tested `WorldMapOverlay` is mocked to `() => null`.
    One real gap the initial plan got wrong, caught by a test crash
    rather than by re-reading the code closely enough up front: clicking
    a *non*-Athens/vault/rules city doesn't no-op, it calls
    `setSelectedCity`, switching to the City Hub view and mounting
    `TempleScene`'s real R3F content (`Mountain`, `Table`, `PlayerV1`,
    `OrbitControls`, `Environment`) inside a second `<Canvas>` — well
    beyond this step's scope to mock (their GLTF loaders throw immediately
    in jsdom). Fixed by dropping that specific test rather than building
    out a much larger mock surface for a view this step was never meant to
    cover; the vault/rules-city tests stay safe since both `router.push`
    and `return` before ever reaching `setSelectedCity`.
    `src/app/__tests__/page.test.tsx`, 8 tests: opening the popup on an
    Athens click, vault/rules cities navigating directly without opening
    it, the already-logged-in shortcut skipping `checkName` entirely, an
    unclaimed-name raid entry (`localStorage` written with no email — this
    site's own difference from `WorldMapOverlay.tsx`, which only writes
    `localStorage` when an email is present), the claimed-name email step,
    the code step (wrong then right code), and a `getBossfightLobby`
    failure showing `alert()` (first use of a `window.alert` spy in this
    repo's tests — no earlier site's test exercised an `alert()` branch).
    No coverage-ratchet change, confirmed via a run.
  - ✅ **done (5/5)** — `app/lobby/[lobbyId]/page.tsx`'s join form, the
    last Shape A site. **This closes out RTL tests for all 5/5
    `useAuthFlow` sites.** Reused the `@react-three/fiber` Canvas mock
    from site 4 (this page doesn't call `useFrame`/`useThree` itself, so
    the mock only needed to export `Canvas`). Three siblings mocked away
    as out of scope: `LobbyScene` (real 3D scene content, no dedicated
    suite planned), `LobbyOverlay` (already has its own full suite from
    Phase 3 step 1), `InGameGuide` (a presentational welcome-tour overlay,
    untested either way and unrelated to auth-forms wiring). The
    socket-preview feature (showing the player list before joining, via
    `@/lib/socket`'s `subscribe`/`getSocket().emit('join_room', ...)`)
    only activates when `@/lib/http`'s `getStoredToken()` returns a
    stored token — mocking it to always return `null` cleanly disables
    that whole path (and, as a consequence, the "game already in
    progress" branch, since `previewState` never populates), matching the
    "preview only works when a token is already stored" comment already
    in the source; `@/lib/socket` itself is still mocked to inert stubs
    purely so the module resolves, never actually exercised. First use of
    `next/navigation`'s `useParams` mock in this repo. One query
    ambiguity matching earlier sites' pattern: "Join Lobby" is both the
    popup's `<h1>` heading and its submit button's text, so tests use
    `getByRole('button', { name: 'Join Lobby' })` rather than `getByText`.
    `src/app/lobby/[lobbyId]/__tests__/page.test.tsx`, 7 tests: the
    `!lobbyId` "Invalid lobby." branch, the logged-out join form, the
    already-logged-in auto-join-via-invite-link shortcut (skipping
    `checkName` entirely), auto-join *failure* still revealing the game UI
    (`.catch(() => setHasJoined(true))` is a deliberate "don't get stuck"
    fallback, not a bug — easy to assume backwards, worth pinning down),
    an unclaimed-name join, the claimed-name email step, and the code step
    (wrong then right code). No coverage-ratchet change, confirmed via a
    run.
- ✅ **done** — settings page toggle flow (`src/app/settings/page.tsx`).
  Two independent toggles: the server-backed always-verify-email flag
  (`getAlwaysVerifyEmailFlag`/`requestToggleVerifyEmail` from
  `@/lib/api`, with an email-confirmation step before it takes effect),
  and the local-only in-game-tutorial flag
  (`src/lib/useGuideEnabled.ts`, shared with `InGameGuide.tsx` — out of
  scope here). `useGuideEnabled.ts` sat at 0% coverage despite being in
  the tracked `src/lib` glob, so this step added both a dedicated hook
  test (`src/lib/__tests__/useGuideEnabled.test.tsx` — default-on,
  persistence, same-tab sync via its custom event, cross-tab sync via
  the native `storage` event) and the page's own RTL test
  (`src/app/settings/__tests__/page.test.tsx`, using the real hook for
  the guide toggle, mocked `@/lib/api` calls for the email-verify one —
  same "real hook + mocked network" principle as every `useAuthFlow`
  site). One jsdom quirk hit and worked around: `window.location.reload`
  (used by "Refresh page") has a non-configurable property, so
  `vi.spyOn` throws `Cannot redefine property: reload` —
  `vi.stubGlobal('location', { ...window.location, reload: vi.fn() })`
  works instead. 8 page tests (logged-out gate, server flag reflected on
  and off, toggling on + the awaiting-confirmation message, a failure
  reverting the optimistic check, Resend, Refresh, the guide toggle) plus
  6 hook tests. Coverage ratchet raised (real increase from
  `useGuideEnabled.ts`, confirmed via a run): see `vitest.config.ts`.
- **Do not try to render R3F scenes in jsdom.** The 3D components stay
  covered indirectly: their props are produced by tested functions, and
  their own remaining logic should approach zero.
- ✅ **done** — one Playwright E2E smoke test (`e2e/lobby-smoke.spec.ts`),
  the last Phase 3 item: create a lobby, add a TURTLE dummy, start the
  game, and fight it to a win. Originally written as this whole flow up
  front and debugged as one large unit — that turned out slow to iterate
  on (each attempt costs a full CI round trip or a live-backend session)
  and masked exactly where a real failure was coming from. Rebuilt step
  by step instead: "create a lobby successfully" first, then add-a-bot,
  then start-game, then one round (attack + a resource), then a second
  round (the well + an attack upgrade, to prove those specific reward/
  economy paths), each confirmed solid against a live backend before
  adding the next slice — the last slice (round 3 onward: attack, buy an
  attack upgrade when affordable else bank a coin, until someone wins)
  fell out directly once the others were solid. First E2E test in this
  repo, verified for real against a live,
  already-running dev stack rather than assumed —
  `158.178.151.93` turned out to be this VM's own public IP
  (`/config/workspace/game/docker-compose.yml`'s persistent local
  wom-fe+wom-be+postgres stack, reachable at `localhost:5000`/`:3000`
  too), used here purely to develop and verify the suite; the actual CI
  job (`.github/workflows/e2e.yml`) spins up its own ephemeral stack —
  `postgres:16-alpine` + the published `ghcr.io/mikaelra/wom-be:latest`
  image (confirmed `DATABASE_URL` is its only hard-required env var and
  `alembic upgrade head` alone builds a working schema; no Supabase
  credentials or seed data needed) + this PR's own frontend build.
  `playwright.config.ts`: no `webServer` auto-start (both services are
  always expected to already be running), `baseURL` from
  `E2E_BASE_URL ?? http://localhost:3000`.

  **One-time setup needed before this job can pass** — two private,
  cross-repo resources, both found via actual failed CI runs rather than
  anticipated up front:
  1. `ghcr.io/mikaelra/wom-be` is a private package owned by the
     `wom-be` repo — a workflow in *this* repo has no automatic read
     access to it (its own `GITHUB_TOKEN` only reaches packages within
     the same repo), confirmed by a CI run failing with `unauthorized`
     on the first `docker run ghcr.io/mikaelra/wom-be` pull. Fix:
     create a fine-grained PAT scoped to the `wom-be` repo with
     `read:packages` permission, add it as this repo's
     `WOM_BE_PACKAGE_TOKEN` secret (Settings → Secrets and variables →
     Actions) — done as of PR #187.
  2. `wom-be`'s own alembic "baseline" migration turned out to be a
     literal no-op (`pass`) — the real schema (tables like `players`)
     comes from a Supabase SQL dump that lives in the private
     `wom-infra` repo (`db/init/001_supabase_dump.sql`, the same file
     `/config/workspace/game/docker-compose.yml`'s local dev stack
     seeds from), confirmed by a CI run failing on the second migration
     with `relation "players" does not exist` — `alembic upgrade head`
     alone can never build a working schema from empty. The dump
     contains sensitive data, so it's neither vendored into this repo
     nor is `wom-infra` made public — the workflow instead checks out
     `wom-infra` with a second PAT (`contents:read` scope) and runs the
     dump via `psql` before migrations. Needs its own fine-grained PAT
     scoped to `wom-infra`, added as `WOM_INFRA_READ_TOKEN`.

  Several real things surfaced only by actually running this against a
  live backend, not by reasoning about the code alone:
  - The root `/` page is `WorldMapOverlay.tsx` (a blank name popup on
    "Create Lobby"), not `HomeOverlay.tsx`'s inline field, as an initial
    pass assumed.
  - The backend's real name validation (3–12 chars, no `-`) 400'd a
    first attempt's timestamp-suffixed name — silently, with no visible
    frontend error for this particular case.
  - `InGameGuide`'s welcome-tour overlay covers the action buttons on a
    fresh session; disabled via seeding `localStorage.womGuideEnabled`
    (the same flag `useGuideEnabled.ts` reads) rather than exercising an
    unrelated interaction in this test.
  - The action/resource HUD buttons are billboard labels whose CSS
    position is recomputed from the 3D scene every frame, so they never
    satisfy Playwright's default "stable" actionability check — needs
    `force: true`.
  - Headless Chromium here has no GPU (SwiftShader software WebGL), and
    at a normal viewport the continuous 3D rendering was found to starve
    the page's JS main thread badly enough that even click dispatch
    could take 10s+ or hang outright; a small (320×240) viewport cuts
    this enough to be workable.
  - **The actual root cause of the earlier "20+ minutes, sometimes never
    concluding" runtime**: `click({ force: true })` on the per-avatar
    `⚔ ATTACK`/`🛡 DEFEND` buttons (`PlayerAvatars.tsx`, repositioned
    every frame via a drei `<Html>` anchor) and on `🏴 The Well`
    (`SceneOverlay.tsx`, a plain 2D `position: absolute` button —
    *not* 3D-anchored, so this isn't simply a 3D-vs-2D-DOM story)
    completes without error but never actually fires the click handler
    — confirmed directly by listening to the raw WebSocket frames and
    observing no `submit_choice` sent at all for these three, while the
    exact same `force: true` pattern reliably sends one for the resource
    cards and for Add Bot/Start Game. In practice this meant every
    earlier version of this test was silently never attacking at all —
    only ever changing resources — so TURTLE (which heals +1 HP/round
    unconditionally and never attacks itself) simply never took damage,
    and every round fell back to the 40-second `ROUND_DURATION` timer
    instead of the backend's near-instant "early resolve once all
    non-bot players are ready" path (confirmed: with real attacks
    landing, round times dropped to ~5 seconds). Fix: `dispatchEvent
    ('click')` for these three specifically — it bypasses hit-testing/
    coordinates entirely and reliably reaches the real handler,
    confirmed via the actual `submit_choice` frame. With that fix, the
    full fight-to-a-win flow completes in ~3 minutes.
  - Worth noting for context, even though the above was the real
    blocker: TURTLE always defends (blocking ~50% of attacks) and a
    blocked attack has a further ~20% chance to reflect damage back
    onto the attacker (~10% of all attacks overall), for damage equal
    to the attacker's own current `attackDamage`, which only grows
    through an increasingly expensive economy (each +1 upgrade costs
    coins equal to the current attackDamage) — a naive "always buy
    coins, never buy attack" strategy would still be a losing one long
    term, independent of the click bug above. The committed test buys
    an attack upgrade whenever affordable and otherwise banks a coin.
    The `e2e` job lives in `.github/workflows/deploy.yml` itself (not a
    separate workflow file — `needs:` can only reference jobs in the same
    file) and `build-and-deploy` now `needs: [lint, test, typecheck, e2e]`
    — a real end-to-end regression can no longer reach the production VM
    just because the unit-level checks passed. (Earlier in development
    this ran as its own separate, non-blocking workflow while the test
    itself was still unreliable — folded into `deploy.yml` as a gate once
    the `dispatchEvent` fix above made it fast and reliable.)
  - Separately, and unrelated to any of the above: getting even one
    real CI run to reach the actual test step required merging two
    long-running "hardening" integration branches (this repo's
    `claude/frontend-hardening-continue` and `wom-be`'s
    `claude/backend-phase4-protocol-doc`) into their respective
    production branches, coordinated together — `wom-be`'s published
    `:latest` image had been built from its stale `main` (predating the
    session-token contract this repo's frontend already assumed),
    surfaced by a real run failing with a zod schema mismatch on
    `/create_lobby`'s `token` field. Deploying either side alone would
    have broken production (the new backend's `join_room` hard-requires
    a session token; the old frontend never sent one) — both were
    merged in the same window instead.

## Phase 4 — Adopt the backend security model

Coordinated with backend Phase 1a/1b (see that plan):

1. Store the join-issued session token (memory + `sessionStorage`), send it
   on `join_room`/reconnect; stop sending `name`/`admin` in action payloads.
2. Private data (`messages`, `events`, `personal_history`) moves off the
   broadcast state — switch `useGameEvents` to the authenticated channel
   the backend provides (`private_update` or token-gated GET).
3. ✅ **done (audited)** — audited every `localStorage.getItem`/`setItem`/
   `removeItem` call site for `playerName`/`playerEmail` (an Explore-agent
   sweep across `src/`, then verified directly rather than taken at face
   value). Conclusion: the frontend's own behavior is fine as designed.
   `HomeOverlay.tsx`, `WorldMapOverlay.tsx`, `app/page.tsx`, and
   `app/lobby/[lobbyId]/page.tsx` all read a stored name to skip the
   `useAuthFlow` popup UI and call create/join/login directly — this
   *looks* like a client-asserted identity shortcut, but isn't one: the
   frontend does no verification itself, and every one of those calls
   still goes to the backend, which independently re-validates name/email
   ownership on every request (per Phase 1a/1b's session-token model).
   Client-side `localStorage` is convenience state for the UI, never a
   trust boundary.

   Two things this audit checked more closely, since they involve sending
   a stored name to the server without a session token attached:
   - `src/lib/useLobbyConnection.ts`'s `rejoin()` re-emits `join_lobby`
     (with the stored name/email) on every socket reconnect, alongside
     the real authorizer, `join_room` (token-only). Checked wom-be's
     `sockets/lobby.py` `handle_join_lobby` directly: it's gated by the
     same `find_claimed_email` match and `is_name_taken_in_lobby` checks
     as a fresh join, so a reconnect can't be used to impersonate another
     player — confirmed **not** a security issue, just a redundant,
     effectively-inert call in the common case (already in the lobby →
     rejected as "Name taken").
   - `getPlayerRelics()`/`claimPendingRelic()` (`src/lib/api.ts`) send only
     a name (no `getStoredToken()`), unlike sibling `getPlayerMessages()`.
     Traced this into wom-be's `routes/bossfight.py` and found it's not
     just a frontend-side gap but a **real, confirmed backend
     vulnerability** on the other end, out of this repo's control to fix:
     - `get_player_relics`: takes only `name` from the request body and
       returns that player's relics with **zero authentication check** —
       anyone can view any player's relic collection by name alone.
     - `claim_pending_relic`: correctly rejects if the name already has a
       registered account with a *different* email (409), but if the name
       has never registered one, it **creates a new account under
       whatever email the caller supplies and immediately awards the
       pending relic** — a real theft path for any name that's earned an
       unclaimed relic and can be guessed.

     Filed here rather than fixed, per this plan's cross-repo convention
     (e.g. the Phase 3 E2E section's session-token coordination write-up):
     this needs a `wom-be` PR to add token-based auth to both routes, not
     a frontend change. The frontend already sends these calls attaching
     only what the current API requires; adding `getStoredToken()` to
     them here would be a no-op until the backend actually checks it.

## Phase 5 — Housekeeping (opportunistic, no dedicated PRs)

- ✅ **done (already true)** — `src/app/Playerv1.tsx` vs
  `src/components/Playerv1.tsx`: only the latter exists. `git log` traced
  the former's removal to `e17e9bd` ("Remove dead code and the half-built
  rematch feature", part of PR #163's earlier cleanup) — this item
  predated that PR and was stale. `src/components/Playerv1.tsx` is live
  code (used by `app/page.tsx`'s TempleScene and `PlayerAvatars.tsx`),
  nothing to delete.
- ✅ **done** — `package.json` name `my-3d-app` → `wom-fe` (also
  regenerated `package-lock.json`'s matching `name` fields via
  `npm install --package-lock-only`). Grepped first to confirm nothing
  else referenced the old name.
- ✅ **done** — `src/config.ts`'s `BACKEND_URL`: dev fallback is now
  `http://localhost:5000` (was a stale Render URL); a production build
  with `NEXT_PUBLIC_BACKEND_URL` unset now throws instead of silently
  falling back. This turned out to fail even louder than planned: since
  `config.ts` is imported at module scope by several server-rendered
  pages, the throw surfaces **during `next build` itself** (confirmed by
  actually running a build with the var unset — it failed prerendering
  `/email_verified` with the new error message and a non-zero exit),
  not just at runtime — a misconfigured deploy can't produce a pushable
  image at all, let alone one that talks to the wrong backend.
- ✅ **done** — standardized error surfaces: `src/components/Toast.tsx`
  (`ToastProvider`/`useToast`, a small fixed-position banner stack,
  auto-dismiss after 6s or manual close) and
  `src/components/ErrorBoundary.tsx` (class component, catches render-time
  crashes in the DOM/overlay tree with a "Something went wrong" + Reload
  fallback), both mounted once at the root (`src/app/layout.tsx`):
  `<ToastProvider><ErrorBoundary>{children}</ErrorBoundary></ToastProvider>`.
  All 10 `alert(...)` call sites replaced with `showError(...)` —
  `app/page.tsx`'s raid-entry failure, `app/vault/page.tsx`'s two keycode
  failures, `SceneOverlay.tsx`'s socket error, `HomeOverlay.tsx`'s 4
  (create/join/not-logged-in/raid-entry), `WorldMapOverlay.tsx`'s 2
  (create/join). `useToast()` falls back to a `console.error` (not a
  throw) when no `ToastProvider` is mounted, specifically so the many
  existing component tests that render these components in isolation
  don't all need a provider wrapper — only `page.test.tsx`'s one test
  that actually asserted on `window.alert` needed updating (now wraps
  with a real `ToastProvider` and asserts the toast text renders). New
  `Toast.test.tsx`/`ErrorBoundary.test.tsx` cover both components
  directly. The `<ErrorBoundary>` sits around the whole app (in the root
  layout), not literally wrapped tight around each `<Canvas>` — R3F's
  `<Canvas>` renders its scene graph through a separate reconciler root,
  so a DOM-level boundary only catches errors during Canvas's own mount,
  not errors inside `useFrame`/the WebGL loop; the actual motivating
  problem this doc names ("a schema mismatch becomes a silent `undefined`
  deep inside a Three.js component") is a DOM/overlay-component crash on
  bad data, which this placement does catch.

## Suggested order of work

1. ✅ Phase 0 (CI: typecheck + coverage ratchet) — half a day.
2. ✅ Phase 1 (zod boundary + typed socket layer) — the anti-anxiety core.
3. ✅ Phase 2 hooks extraction — several PRs, one hook/component each.
   All 5 items done: 1 (`useLobbyConnection`), 2 (`useLobbyGame`), 3
   (`useRoundTimer`/`useBossfightCountdown`/`useGameEvents`), 4
   (`useAuthFlow` across all 5 duplicate sites, incl. a 2FA-bypass bug
   fix), 5 (`LobbyScene.tsx` split into `PlayerAvatars.tsx`/
   `CameraFlyIn.tsx`/`combatAnimationPlan.ts`, 1552 → 750 lines).
4. ✅ Phase 3 — RTL tests now that logic lives in hooks/lib, plus one
   Playwright E2E smoke. All items done: `LobbyOverlay.tsx`, all of
   `SceneOverlay.tsx`, all 5/5 auth-form sites (`app/login/page.tsx`,
   `HomeOverlay.tsx`, `WorldMapOverlay.tsx`, `app/page.tsx`'s Athens
   popup, `app/lobby/[lobbyId]/page.tsx`'s join form), the settings-page
   toggle flow (`app/settings/page.tsx` + `useGuideEnabled.ts`), and
   `e2e/lobby-smoke.spec.ts` (create lobby → add bot → fight it to a
   win — see Phase 3's own writeup above for the `dispatchEvent` fix
   that made this reliably finish in ~3 minutes instead of 20+).
5. ✅ Phase 4 items 1–2 (session tokens) done ahead of order, coordinated
   with the backend token work shipping (PRs #164/#165) — and, as of
   PR #188, actually **live in production**: this repo's
   `claude/frontend-hardening-continue` merged to `master` and wom-be's
   corresponding hardening branch merged to `main` in the same window
   (see Phase 3's E2E writeup above for why together, not separately).
   Item 3 (treat `localStorage` as convenience-only) has since been
   separately audited and confirmed true — see Phase 4's own writeup
   above, including two real `wom-be`-side vulnerabilities
   (`get_player_relics`, `claim_pending_relic`) it surfaced but that need
   a backend PR to fix, not a frontend change.

Definition of done for any new feature after this: server data enters
through a zod schema, game logic lands in `lib/` or a hook with a vitest
file next to it, components stay presentational, and the E2E smoke still
passes.
