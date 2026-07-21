import { expect, test } from '@playwright/test';

// Confirms the boss-fight Wheel drop end to end (engine/combat.py's
// _roll_wheel_drop: 25% independent chance per non-spectator, non-bot
// participant on ANY match end). A prior bug had register_player_stats treat
// the boss NPC's bot=True flag as a practice-bot match, silently zeroing
// wheel rolls for every boss fight; that's fixed (backend commit dce1835,
// "Fix boss-fight wheel drops being silently skipped"), but this is the only
// way to verify the fix holds through the real UI, not just backend unit
// tests: create a fresh account, play one throwaway PvP match (the backend
// 403s a boss-fight join for any name with zero games played), then repeat
// boss fights against Athens/Hades until the "You won a Wheel!" claim modal
// (WheelClaimNudge.tsx) appears.
//
// A guest account here never verifies an email, so every wheel this test
// wins takes the "hold pending" branch (_deliver_wheel in engine/combat.py):
// `pending_wheel_nudge` on our Player, surfaced by LobbyOverlay.tsx as the
// WheelClaimNudge modal -- not the instant `wheel_awarded` banner on the
// game-over screen (that only fires for an already-verified account).
//
// At p=0.25 per attempt, 20 attempts bounds the false-negative rate at
// 0.75^20 ~= 0.32%. The dev stack's game_backend container is configured
// with BOSSFIGHT_INTERVAL_MINUTES=0.1 (6s instead of the 60s default) --
// same knob wom-e2e's shortBossfightIntervalMinutes()/requiresShortBossfightInterval()
// (wom-e2e/lib/knobs.ts) use against config.py's env-overridable
// BOSSFIGHT_INTERVAL_MINUTES -- so each attempt's pre-game wait is ~6s, not
// ~60s. ROUND_DURATION_SECONDS deliberately isn't shortened: rounds resolve
// immediately on submit_choice via attempt_round_resolution, not on the
// watcher's timeout, so the 40s default doesn't slow this down (already
// proven by lobby-smoke.spec.ts blowing through many rounds fast with it
// untouched).
test.setTimeout(25 * 60_000);
// lobby-smoke.spec.ts's 320x240 is deliberately tiny to cut WebGL fill-rate
// cost on this box's GPU-less (SwiftShader) headless Chromium, but at that
// size the world map's Athens marker (once centred by the catch-up pan, see
// CameraRig in WorldMap.tsx) renders directly under WorldMapOverlay's
// join-lobby-code input, so a coordinate click there hits the input instead
// of the canvas -- confirmed empirically (elementFromPoint at Athens'
// bounding-box centre resolves to the <input>, not <canvas>, at 320x240, but
// correctly resolves to <canvas> at 480x360 and up). 480x360 is the smallest
// size that clears the overlap.
test.use({ viewport: { width: 480, height: 360 } });

const MAX_ATTEMPTS = 20;

test('a fresh account eventually gets a Wheel drop from repeated boss fights', async ({ page }) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[browser console error]', msg.text());
  });
  page.on('pageerror', (err) => console.log('[browser page error]', err.message));
  page.on('response', (res) => {
    if (!res.ok()) console.log('[failed response]', res.status(), res.url());
  });

  await page.addInitScript(() => localStorage.setItem('womGuideEnabled', 'false'));

  const playerName = `WHL${Date.now().toString().slice(-9)}`;

  // ---- Create the account and play one throwaway PvP match -----------------
  // (Boss-fight join 403s with "You need to have played at least one game or
  // create an account to fight boss" until this player has a row in the
  // `players` table -- only written by register_player_stats' non-boss-fight
  // branch on match end.)
  await page.goto('/');
  await page.getByText('Create Lobby', { exact: true }).click();
  await page.getByPlaceholder('Your battle name').click({ timeout: 20_000 });
  await page.keyboard.type(playerName);
  await page.getByText('Continue', { exact: true }).click({ timeout: 20_000 });
  await page.waitForURL(/\/lobby\//, { timeout: 20_000 });
  await expect(page.getByText(/^Lobby ID:/)).toBeVisible({ timeout: 20_000 });

  await page.getByText('Add Bot', { exact: true }).click({ timeout: 20_000, force: true });
  await expect(page.getByRole('list').getByText('TURTLE', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByText('Start Game', { exact: true }).click({ timeout: 20_000, force: true });

  // .first(): a boss fight can have more than one attackable target (the
  // boss itself plus any Lost Souls Hades has summoned, see
  // engine/bosses.py's hades_ability), each rendering their own "⚔ ATTACK"
  // button (PlayerAvatars.tsx) -- confirmed for real (two matched here).
  // Which target we hit doesn't matter for this test, only that the match
  // concludes.
  const attack = page.getByText('⚔ ATTACK', { exact: true }).first();
  const well = page.getByText('🏴 The Well', { exact: true });
  const atk = page.getByText('ATK', { exact: true });
  const coins = page.getByText('Coins', { exact: true });
  const roundNumber = page.locator('.round-zoom');
  // Any match conclusion registers the "played a game" row, not just a win --
  // the TURTLE dummy can still block-and-reflect a killing blow back at us
  // (confirmed for real: one run here died to exactly that at round 22), so
  // this must not require `wonPvp` specifically or a loss hangs forever
  // waiting for a button that's gone once dead.
  const gameOverBanner = page.getByText(/You won! 👑|Game Over!/);

  await expect(attack).toBeVisible({ timeout: 20_000 });
  await expect(roundNumber).toHaveText('1', { timeout: 20_000 });

  // Same economy lobby-smoke.spec.ts already proved reliable against the
  // TURTLE dummy: round 1 attack + bank a coin, round 2 Well + buy the ATK
  // upgrade, then always attack and buy ATK whenever affordable (otherwise
  // bank) -- omitting the ATK purchases (as an earlier version of this file
  // did) leaves damage flat at 1 forever and the match never concludes.
  await attack.dispatchEvent('click');
  await coins.click({ timeout: 20_000, force: true });
  await expect(roundNumber).not.toHaveText('1', { timeout: 30_000 });

  if (!(await gameOverBanner.isVisible().catch(() => false))) {
    await well.dispatchEvent('click');
    await atk.click({ timeout: 20_000, force: true });
    await expect(roundNumber).not.toHaveText('2', { timeout: 30_000 }).catch(() => {});
  }

  for (let round = 3; round <= 100; round++) {
    if (await gameOverBanner.isVisible().catch(() => false)) break;
    const currentRound = await roundNumber.textContent();
    await attack.dispatchEvent('click');
    if (await atk.isEnabled().catch(() => false)) {
      await atk.click({ timeout: 20_000, force: true });
    } else {
      await coins.click({ timeout: 20_000, force: true }).catch(() => {});
    }
    await expect(roundNumber).not.toHaveText(currentRound ?? String(round), { timeout: 30_000 }).catch(() => {});
    if (round % 5 === 0) console.log(`[setup] round ${round}, still fighting TURTLE...`);
  }
  await expect(gameOverBanner).toBeVisible({ timeout: 20_000 });
  console.log(`[setup] ${playerName} has now played one game; eligible for boss fights.`);

  // Two matches for this text once the game-over banner is up: SceneOverlay's
  // persistent top-left back link (always rendered, from lobbyConfig.backLabel)
  // and renderGameOver's own copy -- either navigates home, so .first() avoids
  // the strict-mode ambiguity.
  await page.getByText('← Back to Home', { exact: true }).first().click({ timeout: 20_000, force: true });
  await page.waitForURL('/', { timeout: 20_000 });

  // ---- Repeated boss fights until a Wheel drops -----------------------------
  // gameOverBanner (declared above) is a live query, not a page-state
  // snapshot, so it's reused as-is after the navigation below.
  const wheelHeading = page.getByRole('heading', { name: 'You won a Wheel!' });
  let wheelFound = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !wheelFound; attempt++) {
    console.log(`[boss-fight] attempt ${attempt}/${MAX_ATTEMPTS}: entering Athens raid...`);

    // Athens' city marker on the 3D globe (CityMarker.tsx) is a raycasted
    // Object3D click, not a DOM handler -- its Html label text is
    // pointer-events:none, so a real coordinate-based click (force:true,
    // which still dispatches a genuine mouse event at that position) falls
    // through to the canvas underneath and reaches R3F's raycaster, where
    // dispatchEvent would not (there's no DOM click listener on the label
    // itself to fire).
    //
    // No exact:true here -- the label div renders `{city.name}` as a bare
    // text node directly beside a `{raidInfo && <>...}` fragment with its own
    // <span>Hades</span>/<span>RAID ACTIVE</span> children, so no element's
    // own normalized text is ever exactly "Athens" (it's "AthensHadesRAID
    // ACTIVE" on the shared parent) -- confirmed with a standalone script:
    // exact:true permanently resolves 0 elements (not a timing issue, it was
    // misread as one from the accessibility-tree failure snapshot, which
    // renders text nodes as separate lines and made it look present), while
    // a substring match finds exactly one visible element with a real
    // bounding box within ~10s.
    const athens = page.getByText('Athens');
    await athens.waitFor({ state: 'visible', timeout: 60_000 });
    await athens.click({ timeout: 60_000, force: true });
    await page.waitForURL(/\/lobby\//, { timeout: 20_000 });

    // Boss fight lobbies auto-start ~BOSSFIGHT_INTERVAL_MINUTES after
    // creation/join -- this dev stack overrides it to 6s (see file header).
    // But routes/bossfight.py's get_bossfight_lobby has a separate reset path
    // for rejoining an already-past-due, zero-player lobby that hardcodes a
    // full 1-minute countdown regardless of that override (a leftover boss
    // lobby from an earlier aborted run here hit exactly that path, showing
    // "Boss-fight starts in 0m 28s" well past the expected 6s) -- 120s covers
    // both the intended fast path and that fallback with margin.
    await expect(roundNumber).not.toHaveText('0', { timeout: 120_000 });
    console.log(`[boss-fight] attempt ${attempt}: fight started, round ${await roundNumber.textContent()}`);

    // Same economy as the setup match: attack every round, buy ATK whenever
    // affordable (otherwise bank the coin) -- each boss fight is a fresh
    // lobby/player, so ATK resets to 1 and must be re-bought, same as the
    // reasoning in the setup match above.
    for (let round = 1; round <= 50; round++) {
      const done = await gameOverBanner.isVisible().catch(() => false);
      if (done) break;
      const currentRound = await roundNumber.textContent();
      await attack.dispatchEvent('click');
      if (await atk.isEnabled().catch(() => false)) {
        await atk.click({ timeout: 20_000, force: true });
      } else {
        await coins.click({ timeout: 20_000, force: true }).catch(() => {});
      }
      await expect(roundNumber).not.toHaveText(currentRound ?? String(round), { timeout: 30_000 })
        .catch(() => {}); // the round may not advance if this exact click ended the match
      if (await gameOverBanner.isVisible().catch(() => false)) break;
      if (round % 5 === 0) console.log(`[boss-fight] attempt ${attempt}: round ${round}, still fighting...`);
    }
    await expect(gameOverBanner).toBeVisible({ timeout: 20_000 });

    wheelFound = await wheelHeading.isVisible().catch(() => false);
    console.log(`[boss-fight] attempt ${attempt}: match concluded, wheel dropped = ${wheelFound}`);

    if (!wheelFound) {
      // Two matches for this text once the game-over banner is up: SceneOverlay's
      // persistent top-left back link (always rendered, from lobbyConfig.backLabel)
      // and renderGameOver's own copy -- either navigates home, so .first() avoids
      // the strict-mode ambiguity.
      await page.getByText('← Back to Home', { exact: true }).first().click({ timeout: 20_000, force: true });
      await page.waitForURL('/', { timeout: 20_000 });
    }
  }

  expect(wheelFound, `no Wheel dropped in ${MAX_ATTEMPTS} boss-fight attempts (p=0.25 each)`).toBe(true);
  await expect(wheelHeading).toBeVisible();
});
