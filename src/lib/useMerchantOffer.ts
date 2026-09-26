'use client';

import { useEffect, useState } from 'react';
import { getMerchantOffer, type MerchantState } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { setSkyRevertOverride } from '@/lib/astrology';

/**
 * Every merchant in town right now, and the state of the sky they came
 * under -- whether time is turned back, and to when.
 *
 * Poll-only, unlike useBossfightRoster's push+poll: merchants come and go
 * with full moons and conjunctions, days apart, so there is no real-time
 * event worth a socket room for. A slow poll is the whole mechanism.
 */
export const MERCHANT_OFFER_POLL_MS = 60_000;

export function useMerchantOffer(pollMs: number = MERCHANT_OFFER_POLL_MS) {
  const [merchant, setMerchant] = useState<MerchantState | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const next = await getMerchantOffer(getStoredAccountToken());
        if (!cancelled) {
          setMerchant(next);
          // docs/MERCHANT_PLAN.md §7: this is the one place the whole app
          // learns whether the sky is somewhere other than now -- a revert,
          // or the dev clock -- so it's also where the globe's sky is told
          // to follow (or return to live). Every getSky() caller picks this
          // up on its next read, no separate plumbing needed.
          setSkyRevertOverride(next.sky_date ? new Date(next.sky_date) : null);
        }
      } catch {
        /* keep whatever we last saw -- a blink of a network error
           shouldn't make the markers disappear. */
      }
      if (!cancelled) timer = setTimeout(tick, pollMs);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollMs, refreshNonce]);

  /** Re-poll immediately -- called right after a purchase, so the markers
   * and already_bought_this_period reflect it without waiting a minute. */
  const refresh = () => setRefreshNonce((n) => n + 1);

  /** The merchants actually in town (their event is live). */
  const offers = (merchant?.offers ?? []).filter((o) => o.active);
  /** Is time turned back right now -- read from the response, falling back
   *  to the legacy per-offer fields a backend from before stacking sends. */
  const reverted = merchant?.reverted ?? merchant?.offer?.reverted ?? false;
  const revertExpiresAt = merchant?.revert_expires_at ?? merchant?.offer?.revert_expires_at ?? null;
  const revertToDate = merchant?.revert_to_date ?? merchant?.offer?.revert_to_date ?? null;

  return { merchant, offers, reverted, revertExpiresAt, revertToDate, refresh };
}
