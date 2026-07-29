import { expect, test } from '@playwright/test';

// The one Playwright smoke scenario for this repo (see
// docs/CODEBASE_HARDENING_PLAN.md's Phase 3): create a lobby, add a TURTLE
// dummy, start the game, and fight it to a win. Built up step by step
// against real, running dev containers rather than debugged as one large
// unit -- each step below was independently verified before being added.
test.use({ viewport: { width: 320, height: 240 } });
// Small viewport cuts WebGL fill-rate cost -- this box's headless Chromium
// has no GPU (SwiftShader software rendering), and at a normal viewport the
// continuous 3D rendering was found to starve the page's JS main thread
// badly enough that even click event dispatch could take 10s+ or hang.
// Bumped 5 -> 10 min: the combat loop is RNG-driven (allowed up to round 100
// below) and repeatedly ran past 5 minutes in CI without actually being
// stuck -- just an unlucky, long-running fight.
test.setTimeout(10 * 60_000);

test('create a lobby, add a bot, and fight it to a win', async ({ page }) => {
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

  // force: true throughout -- these are billboard HUD labels whose CSS
  // position is recomputed every frame, so they never satisfy Playwright's
  // default "stable" actionability check.
  await page.getByText('Add Bot', { exact: true }).click({ timeout: 20_000, force: true });
  // The pre-game "Players in Lobby" list is gone -- players (including bots)
  // now only show up as a floating 3D name tag above their avatar
  // (PlayerAvatars.tsx), which is the only place "TURTLE" appears pre-game.
  await expect(page.getByText('TURTLE', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByText('Start Game', { exact: true }).click({ timeout: 20_000, force: true });

  // "⚔ ATTACK"/"🏴 The Well" here are specifically the per-avatar/in-game
  // action buttons (PlayerAvatars.tsx / SceneOverlay.tsx), which submit a
  // correctly-targeted action -- confirmed by reading useLobbyGame.ts: the
  // generic, untargeted attack button in SceneOverlay.tsx only renders
  // behind a boss-fight `enemy`, which a plain TURTLE-dummy lobby never
  // has, so it never appears here at all.
  //
  // dispatchEvent, not click({force: true}), for these specifically --
  // verified directly against a live backend that force-click completes
  // without error but never actually fires the click handler (no
  // submit_choice frame sent) for Attack/Well, even though the exact same
  // force-click pattern works fine for Add Bot/Start Game and the
  // resource cards. dispatchEvent bypasses hit-testing/coordinates
  // entirely and reliably triggers the real handler -- confirmed via the
  // actual submit_choice websocket frame. The precise reason force-click
  // fails only for these isn't fully pinned down: Attack/Defend genuinely
  // are repositioned every frame via a drei <Html> anchor, but Well is a
  // plain 2D `position: absolute` button in SceneOverlay.tsx and was
  // *also* affected, so it isn't simply a 3D-vs-2D-DOM distinction.
  const attack = page.getByText('⚔ ATTACK', { exact: true });
  const well = page.getByText('🏴 The Well', { exact: true });
  const atk = page.getByText('ATK', { exact: true });
  const coins = page.getByText('Coins', { exact: true });
  // SceneOverlay.tsx: `Round <span className="round-zoom">{state.round}</span>`
  const roundNumber = page.locator('.round-zoom');
  const won = page.getByText('You won! 👑', { exact: true });

  await expect(attack).toBeVisible({ timeout: 20_000 });
  await expect(roundNumber).toHaveText('1', { timeout: 20_000 });

  // Round 1: attack + gain a coin.
  await attack.dispatchEvent('click');
  await coins.click({ timeout: 20_000, force: true });
  await expect(roundNumber).not.toHaveText('1', { timeout: 30_000 });

  // Round 2: The Well (proves the well-reward path) + spend that coin on
  // an attack upgrade (proves the resource-upgrade path).
  await well.dispatchEvent('click');
  await atk.click({ timeout: 20_000, force: true });
  await expect(roundNumber).not.toHaveText('2', { timeout: 30_000 });

  // Round 3 onward: always attack, buy an attack upgrade whenever
  // affordable, otherwise bank a coin toward the next one -- until
  // someone wins.
  for (let round = 3; round <= 100 && !(await won.isVisible().catch(() => false)); round++) {
    await attack.dispatchEvent('click');
    if (await atk.isEnabled().catch(() => false)) {
      await atk.click({ timeout: 20_000, force: true });
    } else {
      await coins.click({ timeout: 20_000, force: true });
    }
    await expect(roundNumber).not.toHaveText(String(round), { timeout: 30_000 });
  }

  await expect(won).toBeVisible({ timeout: 10_000 });
});
