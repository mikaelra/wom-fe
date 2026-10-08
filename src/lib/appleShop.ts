// The shop inside the iOS app: App Store purchases through StoreKit 2.
//
// Apple guideline 3.1.1 rules out the web shop's Stripe Checkout in the
// app, so there the shop buys through the app's native WomStoreKit plugin
// (ios/App/App/WomStoreKitPlugin.swift) and hands each purchase's signed
// transaction to the backend (wom-be routes/shop_apple.py), which checks
// it and grants the item through the same fulfilment path as Stripe.
//
// A StoreKit transaction is finished only once the backend has given a
// final answer. Until then it stays in StoreKit's unfinished queue and is
// delivered again by deliverUnfinished / the `transaction` listener
// (<AppleTransactionSync>), so a purchase interrupted by a crash or a lost
// connection is retried on the next launch instead of being lost.

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { postApplePrepare, postAppleVerify } from '@/lib/api';
import { ApiError } from '@/lib/http';

export type SignedTransaction = { jws: string; transactionId: string; productId?: string };

export type PurchaseResult =
  | ({ status: 'purchased' } & SignedTransaction)
  | { status: 'cancelled' | 'pending' };

export type StoreKitProduct = { id: string; displayName: string; displayPrice: string };

export interface WomStoreKitPlugin {
  products(options: { ids: string[] }): Promise<{ products: StoreKitProduct[] }>;
  purchase(options: { id: string; quantity: number; appAccountToken: string }): Promise<PurchaseResult>;
  finish(options: { transactionId: string }): Promise<void>;
  unfinished(): Promise<{ transactions: SignedTransaction[] }>;
  storefront(): Promise<{ countryCode: string | null }>;
  /** The signed AppTransaction the app logs in with (src/lib/appleAccount.ts). */
  appTransaction(): Promise<{ jws: string }>;
  addListener(event: 'transaction', listener: (t: SignedTransaction) => void): Promise<PluginListenerHandle>;
}

export const WomStoreKit = registerPlugin<WomStoreKitPlugin>('WomStoreKit');

/** True inside the iOS app (the Capacitor build running on iOS). */
export function isIosApp(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

export type AppleShopProduct = {
  /** The shop's own product id (routes/shop.py PRODUCTS key). */
  product: string;
  appleProductId: string;
  kind: string;
  maxQuantity: number;
  /** The App Store's price, formatted for the player's storefront. */
  displayPrice: string;
};

export type AppleShop = { appAccountToken: string; products: AppleShopProduct[] };

/** What may be sold here, priced by the App Store. Products the App Store
 *  doesn't return (not yet approved, or not sold in this country) are left
 *  out. Throws the backend's ApiError (shop_disabled, email_unverified, ...). */
export async function loadAppleShop(token: string, plugin: WomStoreKitPlugin = WomStoreKit): Promise<AppleShop> {
  const { countryCode } = await plugin.storefront();
  const prepared = await postApplePrepare(token, countryCode ?? undefined);
  const { products } = await plugin.products({ ids: prepared.products.map((p) => p.apple_product_id) });
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    appAccountToken: prepared.app_account_token,
    products: prepared.products.flatMap((p) => {
      const sk = byId.get(p.apple_product_id);
      return sk
        ? [{
            product: p.product,
            appleProductId: p.apple_product_id,
            kind: p.kind,
            maxQuantity: p.max_quantity,
            displayPrice: sk.displayPrice,
          }]
        : [];
    }),
  };
}

// Backend refusals that retrying can never change: the transaction is done
// with. Anything else (a network error, an account mismatch another account
// on this phone could still claim, a misconfigured server) is retried later.
const FINAL_REFUSALS = new Set(['revoked', 'already_claimed']);

export type Delivery = 'fulfilled' | 'refused' | 'retry';

/** Hand one transaction to the backend; finish it once the answer is final. */
export async function deliver(
  token: string,
  transaction: SignedTransaction,
  plugin: WomStoreKitPlugin = WomStoreKit
): Promise<Delivery> {
  try {
    await postAppleVerify(token, transaction.jws);
  } catch (e) {
    if (e instanceof ApiError && e.code && FINAL_REFUSALS.has(e.code)) {
      await plugin.finish({ transactionId: transaction.transactionId });
      return 'refused';
    }
    return 'retry';
  }
  await plugin.finish({ transactionId: transaction.transactionId });
  return 'fulfilled';
}

export type BuyOutcome = Delivery | 'cancelled' | 'pending';

/** Buy `quantity` of a product through the App Store and deliver it. */
export async function buyWithApple(
  token: string,
  shop: AppleShop,
  product: AppleShopProduct,
  quantity: number,
  plugin: WomStoreKitPlugin = WomStoreKit
): Promise<BuyOutcome> {
  const result = await plugin.purchase({
    id: product.appleProductId,
    quantity: Math.max(1, Math.min(quantity, product.maxQuantity)),
    appAccountToken: shop.appAccountToken,
  });
  if (result.status !== 'purchased') return result.status;
  return deliver(token, result, plugin);
}

/** Deliver every purchase still waiting in StoreKit's queue; returns how
 *  many were granted. */
export async function deliverUnfinished(token: string, plugin: WomStoreKitPlugin = WomStoreKit): Promise<number> {
  const { transactions } = await plugin.unfinished();
  let granted = 0;
  for (const t of transactions) {
    if ((await deliver(token, t, plugin)) === 'fulfilled') granted += 1;
  }
  return granted;
}

/** Deliver purchases that complete outside the shop's Buy button (Ask to
 *  Buy approvals, a purchase finished after the app was closed). */
export function listenForTransactions(
  getToken: () => string | null,
  plugin: WomStoreKitPlugin = WomStoreKit
): Promise<PluginListenerHandle> {
  return plugin.addListener('transaction', (t) => {
    const token = getToken();
    if (token) void deliver(token, t, plugin);
  });
}
