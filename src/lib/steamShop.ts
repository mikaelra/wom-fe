// The shop inside the Steam build: Steam Wallet purchases.
//
// Valve requires in-game purchases in a Steam game to go through Steam, so
// there the shop doesn't send the player to Stripe. Instead the backend
// (wom-be routes/shop_steam.py) starts the purchase with Steam, Steam shows
// the player its approval dialog in the overlay, and the player's answer
// (MicroTxnAuthorizationResponse, passed on by the shell: electron/steam.js
// -> window.wom.onSteamPurchaseAnswer) goes back to the backend, which
// charges the wallet and grants the item through the same fulfilment path
// as Stripe.
//
// Nothing is charged before the backend's /finalize. If the game closes or
// the connection drops after the player approved, the backend's reconciler
// finishes the purchase on its own.
//
// The Linux build runs without the overlay (electron/linux/world-of-mythos.sh),
// so there it's a Steam web purchase instead: the shell opens Steam's
// approval page in the Steam client (window.wom.openSteamPurchasePage), and
// the game asks the backend for the result until there is one.

import { postSteamCheck, postSteamFinalize, postSteamInit } from '@/lib/api';
import { ApiError } from '@/lib/http';

type ShellWindow = Pick<Window, 'wom'>;

export type SteamBuyOutcome = 'fulfilled' | 'cancelled' | 'retry';

// Steam's dialog stays up until the player answers; the backend gives up on
// an unanswered purchase after 5 minutes (routes/shop_steam.py), so waiting
// longer than that is pointless.
const ANSWER_TIMEOUT_MS = 5 * 60 * 1000;
// How often a web purchase asks the backend whether it was approved.
const CHECK_INTERVAL_MS = 3000;

/** Buy `quantity` of a product with the Steam Wallet. Throws the backend's
 *  ApiError when it refuses to start (already_owned, region_blocked, ...). */
export async function buyWithSteam(
  token: string,
  product: string,
  quantity: number,
  confirmDuplicate = false,
  w: ShellWindow | undefined = globalThis.window,
  timeoutMs = ANSWER_TIMEOUT_MS,
  checkIntervalMs = CHECK_INTERVAL_MS
): Promise<SteamBuyOutcome> {
  const shell = w?.wom;
  if (shell?.openSteamPurchasePage) {
    const open = shell.openSteamPurchasePage.bind(shell);
    return buyOnSteamPage(token, product, quantity, confirmDuplicate, open, timeoutMs, checkIntervalMs);
  }
  if (!shell?.onSteamPurchaseAnswer) throw new Error('Steam is not running.');

  // Listen before starting: the answer must not slip past between the
  // backend's reply and the listener going up.
  const answers = new Map<string, boolean>();
  let waiting: { orderId: string; resolve: (authorized: boolean | null) => void } | null = null;
  const unsubscribe = shell.onSteamPurchaseAnswer(({ orderId, authorized }) => {
    if (waiting?.orderId === orderId) waiting.resolve(authorized);
    else answers.set(orderId, authorized);
  });

  try {
    const language = (globalThis.navigator?.language ?? 'en').slice(0, 2);
    const { order_id } = await postSteamInit(token, product, quantity, confirmDuplicate, language);
    const orderId = String(order_id);

    const authorized = await new Promise<boolean | null>((resolve) => {
      if (answers.has(orderId)) return resolve(answers.get(orderId) ?? false);
      const timer = setTimeout(() => resolve(null), timeoutMs);
      waiting = {
        orderId,
        resolve: (a) => {
          clearTimeout(timer);
          resolve(a);
        },
      };
    });
    if (authorized === null) return 'cancelled';

    try {
      const { status } = await postSteamFinalize(token, order_id, authorized);
      return status === 'fulfilled' ? 'fulfilled' : 'cancelled';
    } catch (e) {
      // Approved, but Steam or the backend didn't answer: the reconciler
      // finishes it.
      if (authorized && !(e instanceof ApiError && e.status < 500)) return 'retry';
      throw e;
    }
  } finally {
    unsubscribe();
  }
}

/** A Steam web purchase (Linux): open Steam's approval page and ask the
 *  backend until it's charged and granted ('fulfilled'), declined or
 *  failed ('cancelled'), or the player walks away ('cancelled' after
 *  timeoutMs -- the backend gives up on it too). Steam or the backend not
 *  answering for a while is no reason to stop asking. */
async function buyOnSteamPage(
  token: string,
  product: string,
  quantity: number,
  confirmDuplicate: boolean,
  open: (url: string) => void,
  timeoutMs: number,
  checkIntervalMs: number
): Promise<SteamBuyOutcome> {
  const language = (globalThis.navigator?.language ?? 'en').slice(0, 2);
  const { order_id, steam_url } = await postSteamInit(token, product, quantity, confirmDuplicate, language, true);
  if (!steam_url) throw new Error('Steam could not start the purchase.');
  open(steam_url);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, checkIntervalMs));
    try {
      const { status } = await postSteamCheck(token, order_id);
      if (status === 'fulfilled') return 'fulfilled';
      if (status !== 'pending') return 'cancelled';
    } catch (e) {
      // A refusal is final; a busy or unreachable backend is not.
      if (e instanceof ApiError && e.status < 500 && e.status !== 429) throw e;
    }
  }
  return 'cancelled';
}
