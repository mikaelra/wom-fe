import path from 'path';
import { defineConfig } from 'vitest/config';

const alias = { '@': path.resolve(__dirname, 'src') };

export default defineConfig({
  test: {
    projects: [
      {
        // Fast, DOM-free project for src/lib's pure logic — unchanged
        // from before Phase 0.
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        // Component/hook tests (React Testing Library). Wired up ahead
        // of Phase 2/3 so those phases can add tests without touching
        // config again.
        resolve: { alias },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // Scoped to the tested "logic" layer, not the whole src/ tree:
      // components/pages are still god-objects pre-Phase-2, and R3F/
      // Three.js scene components are never meant to be unit-tested (see
      // docs/CODEBASE_HARDENING_PLAN.md's Phase 3 test strategy) -- a
      // whole-tree ratchet would just measure "how much of the app is
      // 3D rendering," not real regression risk. Hooks extracted in Phase
      // 2 live flat in src/lib/ (use*.ts, matching this repo's existing
      // convention -- not a separate src/hooks/ dir), so they're already
      // inside this glob. Expand it as Phase 3 adds RTL-tested DOM
      // components. Since Vitest 4 removed the old `coverage.all` flag,
      // listing `include` is sufficient on its own to make untested
      // matching files report as 0% instead of being silently omitted.
      include: ['src/lib/**/*.ts'],
      reporter: ['text', 'json-summary'],
      // Ratchet threshold (Phase 0 of docs/CODEBASE_HARDENING_PLAN.md):
      // coverage of the included files may never drop below this. Raise
      // it as later phases add tests; never lower it to make a PR pass.
      // Set with margin below the observed 32.54/32.18/33.72/31.95
      // (stable across repeated runs -- no background-timer jitter here).
      //
      // Raised in Phase 1 (typed, zod-validated server boundary): new
      // src/lib/http.ts, socket.ts, schemas.ts (already inside the
      // existing src/lib/**/*.ts include -- no glob change needed) plus
      // their round-trip tests pushed the suite to ~38.23/34.4/36.66/38.09
      // (stable across repeated runs).
      // Raised in Phase 2 step 1 (useLobbyConnection extracted from
      // SceneOverlay.tsx): new src/lib/useLobbyConnection.ts plus its
      // hook tests (renderHook + a mocked @/lib/socket) pushed the suite
      // to ~43.89/38.37/44.66/44.27 (stable across repeated runs).
      // Raised in Phase 2 step 2 (useLobbyGame extracted from
      // SceneOverlay/LobbyScene/LobbyOverlay): new src/lib/useLobbyGame.ts
      // (a pure derivation hook, no mocking needed for its tests) pushed
      // the suite to ~45.85/44.7/46.72/46.13 (stable across repeated runs).
      // Raised in Phase 2 step 3a (useRoundTimer + useBossfightCountdown
      // extracted from SceneOverlay.tsx/page.tsx/HomeOverlay.tsx): pushed
      // the suite to ~49.04/47.16/51.28/49.21 (stable across repeated runs).
      // Raised in Phase 2 step 3b (useGameEvents extracted from
      // SceneOverlay.tsx/useStagedResources.ts/LobbyScene.tsx, centralizing
      // the former triplicate getPlayerMessages fetch): pushed the suite to
      // ~50.6/48.6/53.78/50.68 (stable across repeated runs).
      // Raised in Phase 2 step 4a (useAuthFlow extracted from
      // app/page.tsx's Athens popup and app/lobby/[lobbyId]/page.tsx's
      // join form): pushed the suite to ~55.62/49.56/56/56.29 (stable
      // across repeated runs).
      // Raised in Phase 2 step 4c (app/login/page.tsx wired onto
      // useAuthFlow, plus a test for its now-optional submitErrorFallback
      // default): pushed the suite to ~55.69/49.85/56/56.36 (stable
      // across repeated runs). Step 4b needed no glob/threshold change --
      // HomeOverlay.tsx/WorldMapOverlay.tsx aren't in src/lib/.
      // Raised in Phase 2 item 5 step 5c (src/lib/combatAnimationPlan.ts,
      // the GameEvent[] -> animation-plan mapping extracted from
      // LobbyScene.tsx's combat/well-reward effect as a pure, 100%-covered
      // function): pushed the suite to ~63.72/58.84/59.85/64.79 (stable
      // across repeated runs). Steps 5a/5b needed no glob/threshold change --
      // PlayerAvatars.tsx/CameraFlyIn.tsx aren't in src/lib/.
      // Phase 3 SceneOverlay.tsx RTL tests (mocking its 6 already-tested
      // hooks): observed ~63.97/59.51/59.85/65.06, a small but real,
      // stable increase (some src/lib branches get incidentally exercised
      // resolving the mocked modules) -- still safely within the existing
      // margin below, so the numeric thresholds are unchanged; noted here
      // per the "always document the observed number" convention.
      // Phase 3 auth-forms RTL tests, site 1/5 (app/login/page.tsx, using
      // the real useAuthFlow hook with mocked @/lib/api calls): observed
      // ~64.34/59.95/59.85/65.47 -- exercising the hook through a real
      // page's JSX hit a few more of its own branches than its dedicated
      // hook test did. Still within the existing margin.
      // Sites 2/5 (HomeOverlay.tsx) and 3/5 (WorldMapOverlay.tsx) needed no
      // glob/threshold change -- neither file is in src/lib/, and both
      // exercise useAuthFlow the same way site 1 already did, so the
      // numbers were exactly unchanged (confirmed via a run each time, not
      // assumed).
      // Site 4/5 (app/page.tsx's Athens raid popup, the first RTL test in
      // this repo to mock @react-three/fiber's Canvas) also needed no
      // change, same reason.
      // Site 5/5 (app/lobby/[lobbyId]/page.tsx's join form, reusing the
      // Canvas mock) closes out all 5/5 useAuthFlow sites -- also no
      // change, same reason.
      thresholds: {
        statements: 63,
        branches: 58,
        functions: 59,
        lines: 64,
      },
    },
  },
});
