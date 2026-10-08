'use client';

import { useEffect } from 'react';
import { deliverUnfinished, isIosApp, listenForTransactions } from '@/lib/appleShop';
import { getStoredAccountToken } from '@/lib/http';

/**
 * Inside the iOS app: delivers App Store purchases that didn't finish in the
 * shop -- left unfinished by a crash or a lost connection, or completing
 * later (Ask to Buy) -- as soon as the app starts, and whenever StoreKit
 * reports one. Renders nothing; mounted once, in the root layout. A no-op
 * everywhere else.
 */
export default function AppleTransactionSync() {
  useEffect(() => {
    if (!isIosApp()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    let cancelled = false;
    const token = getStoredAccountToken();
    if (token) void deliverUnfinished(token).catch(() => undefined);
    void listenForTransactions(getStoredAccountToken).then((h) => {
      if (cancelled) void h.remove();
      else handle = h;
    });
    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, []);
  return null;
}
