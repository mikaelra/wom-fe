import { expect, test } from '@playwright/test';
import { attackAndAdvance, submitUntilRoundAdvances } from './lobbyCombat';

// The one Playwright smoke scenario for this repo (see
// docs/CODEBASE_HARDENING_PLAN.md's Phase 3): create a lobby, add a TURTLE
// dummy, start the game, and fight it to a win. Built up step by step
// against real, running dev containers rather than debugged as one large
// unit -- each step below was independently verified before being added.
// 480x900 matches wheel-drop-bossfight.spec.ts's viewport -- a much smaller
// 320x240 was tried to cut WebGL fill-rate cost on this box's GPU-less
// (SwiftShader) headless Chromium, but at that size the HUD cards
// (Round/HP/Coins/ATK/players list) visibly overlap each other, which is
// not how the app is meant to render and isn't worth the rendering-cost
// savings.
test.use({ viewport: { width: 480, height: 900 } });
// Real timing observed against a live stack: ~25s/round, matches deciding
// (win or TURTLE-reflect death) by round ~15-20. 12 min comfortably covers
// MAX_MATCH_ATTEMPTS (below) worth of matches in the realistic case; with
// Playwright's 1 CI retry, worst case is ~24 minutes (see deploy.yml's e2e
// job timeout-minutes).
test.setTimeout(12 * 60_000);

// engine/phases/attacks.py: every attack has an independent 20% chance to
// reflect the attacker's own damage back onto them (rng.random() < 0.2) --
// a real, working game mechanic, not a bug. This test's fixed "always
// attack, never defend" strategy never guards against it, so accumulated
// self-reflect damage over enough rounds can genuinely kill the local
// player and end the match in a loss instead of a win (confirmed directly
// against the live dev stack: two independent full runs both ended in
// "Game Over! TURTLE wins!" via reflect, around rounds 5-19). Retrying the
// whole match on a loss -- same pattern wheel-drop-bossfight.spec.ts already
// uses for its own probabilistic (25%-per-attempt) outcome -- turns that
// expected RNG variance into a bounded number of extra attempts instead of
// a test failure (or, before the loss was even detected, an indefinite
// hang: see lobbyCombat.ts and the loss-detection note below). Capped at 2,
// not more -- each extra attempt adds real time (see test.setTimeout above),
// and two attempts already bounds the false-negative rate on a single
// TURTLE-reflect death low enough for a smoke test.
const MAX_MATCH_ATTEMPTS = 2;

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

  let won = false;

  for (let matchAttempt = 1; matchAttempt <= MAX_MATCH_ATTEMPTS && !won; matchAttempt++) {
    // 3-12 chars, no spaces or "/\\@\"'-" (backend's regex_name_check). Fresh
    // name each attempt -- a new match needs a new lobby/player, not a retry
    // of the same one.
    const playerName = `E2E${Date.now().toString().slice(-8)}${matchAttempt}`;

    // The root page is the world map (WorldMapOverlay.tsx): "Create Lobby"
    // opens a blank name popup on a first visit -- but on a retry (this
    // player's guest identity is now persisted in localStorage from the
    // previous match attempt), it skips the prompt entirely and creates the
    // lobby directly under the existing name. Handle both: only fill the
    // popup if it actually shows up.
    await page.goto('/');
    await page.getByText('Create Lobby', { exact: true }).click();
    const namePrompt = page.getByPlaceholder('Your battle name');
    if (await namePrompt.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await namePrompt.click({ timeout: 20_000 });
      await page.keyboard.type(playerName);
      await page.getByText('Continue', { exact: true }).click({ timeout: 20_000 });
    }

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
    const wonBanner = page.getByText('You won! 👑', { exact: true });
    // LobbyOverlay.tsx's renderGameOver: "Game Over! {winner} wins!" on a
    // loss -- see the reflect-mechanic note above for why this can happen.
    const lostBanner = page.getByText(/^Game Over!/);
    const gameOver = page.getByText(/You won! 👑|^Game Over!/);

    await expect(attack).toBeVisible({ timeout: 20_000 });
    await expect(roundNumber).toHaveText('1', { timeout: 20_000 });

    // Round 1: attack + gain a coin. submitUntilRoundAdvances retries the
    // dispatchEvent click every few seconds instead of waiting out a single
    // dropped click against the backend's own ~40s per-round watcher timeout
    // -- see lobbyCombat.ts. gameOver as the `done` condition covers the
    // (unlikely but real) case of losing to a reflect on round 1 itself.
    await submitUntilRoundAdvances(
      roundNumber,
      async () => {
        // Explicit timeout -- see lobbyCombat.ts's attackAndAdvance comment:
        // an un-timed-out dispatchEvent can hang until the test's own
        // timeout if the locator vanishes between retries.
        await attack.dispatchEvent('click', undefined, { timeout: 5_000 }).catch(() => {});
        await coins.click({ timeout: 20_000, force: true }).catch(() => {});
      },
      gameOver,
    );

    if (!(await gameOver.isVisible().catch(() => false))) {
      // Round 2: The Well (proves the well-reward path) + spend that coin on
      // an attack upgrade (proves the resource-upgrade path).
      await submitUntilRoundAdvances(
        roundNumber,
        async () => {
          await well.dispatchEvent('click', undefined, { timeout: 5_000 }).catch(() => {});
          await atk.click({ timeout: 20_000, force: true }).catch(() => {});
        },
        gameOver,
      );
    }

    // Round 3 onward: always attack, buy an attack upgrade whenever
    // affordable, otherwise bank a coin toward the next one -- until
    // the match concludes, win or lose.
    for (let round = 3; round <= 100 && !(await gameOver.isVisible().catch(() => false)); round++) {
      await attackAndAdvance(roundNumber, attack, atk, coins, gameOver);
    }

    await expect(gameOver).toBeVisible({ timeout: 10_000 });
    won = await wonBanner.isVisible().catch(() => false);
    if (!won) {
      const lostText = await lostBanner.textContent().catch(() => null);
      console.log(`[match ${matchAttempt}/${MAX_MATCH_ATTEMPTS}] lost (${lostText ?? 'Game Over'}) -- retrying a fresh match`);
    }
  }

  expect(won, `did not win within ${MAX_MATCH_ATTEMPTS} match attempts`).toBe(true);
});
