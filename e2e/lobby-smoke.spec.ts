import { expect, test } from '@playwright/test';

// The one Playwright smoke scenario for this repo (see
// docs/CODEBASE_HARDENING_PLAN.md's Phase 3). Deliberately starting from
// the smallest possible slice -- create a lobby successfully -- and
// growing it step by step (add a bot, start the game, resolve a round,
// eventually a full win) once each step is confirmed solid in real CI
// runs, rather than writing the whole flow up front and debugging it as
// one large unit.
test.use({ viewport: { width: 320, height: 240 } });
// Small viewport cuts WebGL fill-rate cost -- this box's headless Chromium
// has no GPU (SwiftShader software rendering), and at a normal viewport the
// continuous 3D rendering was found to starve the page's JS main thread
// badly enough that even click event dispatch could take 10s+ or hang.
test.setTimeout(60_000);

test('create a lobby successfully', async ({ page }) => {
  // Surface network/console failures directly in the test log -- a failed
  // API call (a rejected fetch, a 4xx/5xx) otherwise fails silently here,
  // showing up only as a later step timing out with no indication why.
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[browser console error]', msg.text());
  });
  page.on('pageerror', (err) => console.log('[browser page error]', err.message));
  page.on('response', (res) => {
    if (!res.ok()) console.log('[failed response]', res.status(), res.url());
  });

  // A real user could disable the welcome tour in Settings; doing so here
  // avoids its overlay (found to cover and block the action buttons on a
  // fresh session) without adding an unrelated interaction to this test.
  await page.addInitScript(() => localStorage.setItem('womGuideEnabled', 'false'));

  // 3-12 chars, no spaces or "/\\@\"'-" (backend's regex_name_check).
  const playerName = `E2E${Date.now().toString().slice(-8)}`;

  // The root page is the world map (WorldMapOverlay.tsx): "Create Lobby"
  // opens a blank name popup rather than reading an already-typed name.
  await page.goto('/');
  await page.getByText('Create Lobby', { exact: true }).click();
  await page.getByPlaceholder('Your battle name').click({ timeout: 20_000 });
  await page.keyboard.type(playerName);
  await page.getByText('Continue', { exact: true }).click({ timeout: 20_000 });

  await page.waitForURL(/\/lobby\//, { timeout: 20_000 });
  await expect(page.getByText(/^Lobby ID:/)).toBeVisible({ timeout: 20_000 });
});
