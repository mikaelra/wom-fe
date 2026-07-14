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
      thresholds: {
        statements: 44,
        branches: 42,
        functions: 44,
        lines: 44,
      },
    },
  },
});
