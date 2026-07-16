import { expect, test } from '@playwright/test';

// The one Playwright smoke scenario for this repo (see
// docs/CODEBASE_HARDENING_PLAN.md's Phase 3): create a lobby, add a TURTLE
// dummy, start the game, and confirm rounds actually resolve end to end
// (action/resource submitted -> backend resolves -> broadcast state ->
// frontend re-renders).
//
// Deliberately scoped to ROUNDS_TO_CLEAR rounds, not a full win, for now.
// Fighting TURTLE to death turned out to be genuinely slow and
// RNG-driven -- verified empirically against a live backend: TURTLE's
// "defend" blocks ~50% of attacks, and a blocked attack has a further ~20%
// chance to reflect damage back onto the attacker (~10% of all attacks
// overall, i.e. 0.5 * 0.2), for damage equal to the attacker's own current
// attackDamage. A starting attackDamage of 1 only grows through an
// increasingly expensive economy (each +1 upgrade costs coins equal to the
// current attackDamage) -- getting all the way to a win took anywhere from
// several minutes to, in one observed case, over 20 without concluding.
// That's much more variance than a smoke test should carry. Proving the
// round-resolution pipeline works at all is the valuable, low-variance
// part; raise ROUNDS_TO_CLEAR gradually (and only once this passes
// reliably at the current value) rather than jumping straight back to
// "fight to a win".
const ROUNDS_TO_CLEAR = 1;

test.use({ viewport: { width: 320, height: 240 } });
// Small viewport cuts WebGL fill-rate cost -- this box's headless Chromium
// has no GPU (SwiftShader software rendering), and at a normal viewport the
// continuous 3D rendering was found to starve the page's JS main thread
// badly enough that even click event dispatch could take 10s+ or hang.
test.setTimeout(3 * 60_000);

test(`create a lobby, add a bot, and clear ${ROUNDS_TO_CLEAR} round(s)`, async ({ page }) => {
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

  await page.waitForURL(/\/lobby\//, { timeout: 60_000 });
  await expect(page.getByText(/^Lobby ID:/)).toBeVisible({ timeout: 20_000 });

  // force: true throughout -- these action/resource buttons are billboard
  // HUD labels whose position is recomputed from the 3D scene every frame,
  // so they never satisfy Playwright's default "stable" actionability check.
  await page.getByText('Add Bot', { exact: true }).click({ timeout: 20_000, force: true });
  await page.getByText('Start Game', { exact: true }).click({ timeout: 20_000, force: true });

  // "⚔ ATTACK" here is specifically the per-avatar button PlayerAvatars.tsx
  // renders above the opponent (TURTLE), which submits a correctly-targeted
  // attack -- confirmed by reading useLobbyGame.ts: the generic, untargeted
  // attack button in SceneOverlay.tsx only renders behind a boss-fight
  // `enemy`, which a plain TURTLE-dummy lobby never has, so it never
  // appears here at all.
  const attack = page.getByText('⚔ ATTACK', { exact: true });
  // HP is always clickable regardless of coin balance (unlike ATK, which
  // needs affordable coins) -- the simplest reliable resource choice for
  // just proving a round resolves.
  const resource = page.getByText('HP', { exact: true });
  // SceneOverlay.tsx: `Round <span className="round-zoom">{state.round}</span>`
  // -- the one directly-observable, unambiguous "did a round resolve" signal.
  const roundNumber = page.locator('.round-zoom');

  await expect(attack).toBeVisible({ timeout: 20_000 });
  await expect(roundNumber).toHaveText('1', { timeout: 20_000 });

  for (let round = 1; round <= ROUNDS_TO_CLEAR; round++) {
    await attack.click({ timeout: 20_000, force: true });
    await resource.click({ timeout: 20_000, force: true });
    await expect(roundNumber).not.toHaveText(String(round), { timeout: 30_000 });
  }
});
