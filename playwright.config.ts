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
    launchOptions: {
      // The lobby's R3F <Canvas> renders continuously (frameloop="always",
      // its default) for as long as the lobby page is mounted, and this
      // suite's fight loop can keep it up for several minutes. Reproduced
      // directly against a live dev/prod stack: headless Chromium's
      // software-rendered (SwiftShader, no real GPU here) WebGL context can
      // become unstable under that sustained load and the whole page/
      // browser eventually closes out from under the test (`Target page,
      // context or browser has been closed`) -- no retry recovers from
      // that, since the page is gone. --disable-dev-shm-usage is the
      // standard mitigation for Chrome/Chromium crashing under sustained
      // rendering load in containerized CI (GitHub Actions' default runner
      // /dev/shm is a famously-small 64MB, well below what Chrome's GPU
      // process wants) -- doesn't fully eliminate the instability (this box's
      // /dev/shm is already generous and it still reproduces here), but it's
      // a real contributing factor on CI specifically and costs nothing to
      // rule out.
      args: ['--disable-dev-shm-usage'],
    },
  },
});
