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

import { postSteamFinalize, postSteamInit } from '@/lib/api';
import { ApiError } from '@/lib/http';

type ShellWindow = Pick<Window, 'wom'>;

export type SteamBuyOutcome = 'fulfilled' | 'cancelled' | 'retry';

// Steam's dialog stays up until the player answers; the backend gives up on
// an unanswered purchase after 5 minutes (routes/shop_steam.py), so waiting
// longer than that is pointless.
const ANSWER_TIMEOUT_MS = 5 * 60 * 1000;

/** Buy `quantity` of a product with the Steam Wallet. Throws the backend's
 *  ApiError when it refuses to start (already_owned, region_blocked, ...). */
export async function buyWithSteam(
  token: string,
  product: string,
  quantity: number,
  confirmDuplicate = false,
  w: ShellWindow | undefined = globalThis.window,
  timeoutMs = ANSWER_TIMEOUT_MS
): Promise<SteamBuyOutcome> {
  const shell = w?.wom;
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
