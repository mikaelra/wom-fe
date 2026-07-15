import { expect, test } from '@playwright/test';

// The one Playwright smoke scenario for this repo (see
// docs/CODEBASE_HARDENING_PLAN.md's Phase 3): create a lobby, add a TURTLE
// dummy (the only bot type -- always defends and heals +1 HP/round, never
// attacks), start the game, and fight it to a win.
//
// This fight is genuinely slow and RNG-driven, verified empirically against
// a live backend rather than assumed: TURTLE's "defend" blocks ~50% of
// attacks, and a blocked attack has a further ~20% chance to reflect damage
// back onto the attacker -- i.e. ~10% of all attacks (0.5 * 0.2) reflect
// onto us, for damage equal to our own current attackDamage. A starting
// attackDamage of 1 only grows through an increasingly expensive economy
// (each +1 upgrade costs coins equal to the current attackDamage). A naive
// "always buy coins" strategy is actually a *losing* one (TURTLE's flat
// +1 HP/round heal outpaces it) -- this test buys attack upgrades when
// affordable and throws in a heal every 4th round regardless of current HP.
// That's not a real survival guarantee (reflected damage scales with our
// own attackDamage and can land on consecutive rounds regardless of this
// cadence) -- it's just a simple way to reduce, not eliminate, the odds of
// dying to reflection during development, without depending on a live HP
// read (a locator meant to read the live HP value proved unreliable). If
// this test starts failing from dying rather than from timing out, that's
// this tradeoff showing up, not a regression to chase.
test.use({ viewport: { width: 320, height: 240 } });
// Small viewport cuts WebGL fill-rate cost -- this box's headless Chromium
// has no GPU (SwiftShader software rendering), and at a normal viewport the
// continuous 3D rendering was found to starve the page's JS main thread
// badly enough that even click event dispatch could take 10s+ or hang.
test.setTimeout(20 * 60_000);

test('create a lobby, add a bot, fight it out, and win', async ({ page }) => {
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
  const atk = page.getByText('ATK', { exact: true });
  const hp = page.getByText('HP', { exact: true });
  const coins = page.getByText('Coins', { exact: true });
  const won = page.getByText('You won! 👑', { exact: true });

  await expect(attack).toBeVisible({ timeout: 20_000 });

  for (let round = 0; round < 300 && !(await won.isVisible().catch(() => false)); round++) {
    try {
      await attack.click({ timeout: 8_000, force: true });
      if (round % 4 === 0) {
        await hp.click({ timeout: 8_000, force: true });
      } else if (await atk.isEnabled().catch(() => false)) {
        await atk.click({ timeout: 8_000, force: true });
      } else {
        await coins.click({ timeout: 8_000, force: true });
      }
    } catch {
      // The UI may be mid-transition between rounds (buttons briefly
      // disabled/re-rendering) -- just retry on the next iteration.
    }
    await page.waitForTimeout(500);
  }

  await expect(won).toBeVisible({ timeout: 10_000 });
});
