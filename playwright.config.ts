import { defineConfig } from '@playwright/test';

// This suite always expects both the frontend and backend to already be
// running -- there's no webServer auto-start here, whether that's this VM's
// own persistent dev stack (E2E_BASE_URL unset, defaults to localhost:3000)
// or an ephemeral docker-compose stack spun up fresh in CI.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  // Default; the one spec in this suite overrides this itself (combat RNG
  // and a slow starting economy make it genuinely run long -- verified
  // empirically against a live backend, see e2e/lobby-smoke.spec.ts).
  timeout: 120_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
});
