import { expect, type Locator } from '@playwright/test';

// Shared by lobby-smoke.spec.ts and wheel-drop-bossfight.spec.ts: both fight
// a TURTLE/boss dummy round-by-round via dispatchEvent('click') on the
// in-scene action buttons (see lobby-smoke.spec.ts's header comment for why
// dispatchEvent, not a real click, is used for those specifically).
//
// That dispatchEvent occasionally doesn't reach the real handler -- reproduced
// directly against the live dev stack: this box's headless Chromium has no
// GPU (SwiftShader software rendering), and under sustained render-thread
// stall the dispatched click is dropped with no error on either end. When
// that happens, the backend's own per-round watcher force-advances the round
// after ~40s with no player action -- but the two callers here previously
// only waited 30s, or (wheel-drop-bossfight) swallowed that wait's failure
// and moved on to redundantly re-attempt the *same* round, so a single
// dropped click either failed the test outright or chained into repeated
// 30-40s dead waits that blew the job's overall timeout (observed: a round
// stuck for the test's full 10-minute per-attempt budget in CI).
//
// Retrying the action well inside that 40s window turns a dropped click into
// a few extra seconds of delay instead of a stall.
//
// This also covers the game-over reveal itself: SceneOverlay.tsx holds the
// win/loss banner behind an "eliminating kill animation" and only force-
// reveals it after its own GAMEOVER_REVEAL_FALLBACK_MS (4s) -- but that
// reveal is itself driven by the same render loop that can stall under this
// box's software rendering, so it can occasionally take noticeably longer
// than 4s in practice.
const RETRY_INTERVAL_MS = 10_000;
const MAX_RETRIES = 12; // 12 * 10s = 120s -- generous margin over both the backend's ~40s watcher and the client's 4s reveal fallback

/**
 * Repeats `submitAction` every RETRY_INTERVAL_MS until the round number
 * changes or `done` becomes visible (the match/attempt concluded on this
 * exact click, so the round may never advance).
 */
export async function submitUntilRoundAdvances(
  roundNumber: Locator,
  submitAction: () => Promise<void>,
  done?: Locator,
): Promise<void> {
  const before = (await roundNumber.textContent().catch(() => null)) ?? '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await submitAction();
    try {
      await expect(roundNumber).not.toHaveText(before, { timeout: RETRY_INTERVAL_MS });
      return;
    } catch {
      if (done && (await done.isVisible().catch(() => false))) return;
      if (attempt === MAX_RETRIES) {
        throw new Error(`round stuck on "${before}" after ${MAX_RETRIES} action retries (~${(MAX_RETRIES * RETRY_INTERVAL_MS) / 1000}s)`);
      }
    }
  }
}

/** The common case: attack, then spend/bank whatever resource click is passed in. */
export async function attackAndAdvance(
  roundNumber: Locator,
  attack: Locator,
  atk: Locator,
  coins: Locator,
  done?: Locator,
): Promise<void> {
  await submitUntilRoundAdvances(
    roundNumber,
    async () => {
      await attack.dispatchEvent('click').catch(() => {});
      if (await atk.isEnabled().catch(() => false)) {
        await atk.click({ timeout: 20_000, force: true }).catch(() => {});
      } else {
        await coins.click({ timeout: 20_000, force: true }).catch(() => {});
      }
    },
    done,
  );
}
