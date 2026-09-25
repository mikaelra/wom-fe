'use client';

import { useEffect, useState } from 'react';
import { getMerchantOffer, type MerchantOffer } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';

/**
 * The Merchant's current offer, for the globe to decide whether to draw the
 * ??? marker.
 *
 * Poll-only, unlike useBossfightRoster's push+poll: availability changes at
 * most once per full moon (~every two weeks), so there is no real-time
 * event worth a socket room for. A slow poll is the whole mechanism.
 */
export const MERCHANT_OFFER_POLL_MS = 60_000;

export function useMerchantOffer(pollMs: number = MERCHANT_OFFER_POLL_MS) {
  const [offer, setOffer] = useState<MerchantOffer | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const { offer: next } = await getMerchantOffer(getStoredAccountToken());
        if (!cancelled) setOffer(next);
      } catch {
        /* keep whatever we last saw -- a blink of a network error
           shouldn't make the marker disappear. */
      }
      if (!cancelled) timer = setTimeout(tick, pollMs);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollMs, refreshNonce]);

  /** Re-poll immediately -- called right after a purchase, so the marker
   * and already_bought_this_period reflect it without waiting a minute. */
  const refresh = () => setRefreshNonce((n) => n + 1);

  return { offer, refresh };
}
