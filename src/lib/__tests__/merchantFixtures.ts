// Shared /merchant/offer fixtures for the tests that mock getMerchantOffer
// (docs/MERCHANT_PLAN.md). Not a test file itself.
import type { MerchantEvent, MerchantOffer, MerchantState } from '@/lib/api';

export const FULL_MOON_EVENT: MerchantEvent = {
  kind: 'full_moon', key: '', bodies: ['Moon'], sign: 'Aries', at: '2028-10-03T23:10:43Z',
};

export const MERCURY_JUPITER_EVENT: MerchantEvent = {
  kind: 'conjunction', key: 'Mercury-Jupiter', bodies: ['Mercury', 'Jupiter'], sign: 'Libra',
  at: '2028-10-03T12:46:50Z',
};

/** The full moon's Merchant, in town and unbought. */
export function stoneOffer(over: Partial<MerchantOffer> = {}): MerchantOffer {
  return {
    offer_id: 1,
    merchant_name: 'The Merchant',
    item_name: 'Stone of Vitality',
    cost_hades_coins: 5,
    trigger_kind: 'full_moon',
    active: true,
    available: true,
    already_bought_this_period: false,
    period_start: FULL_MOON_EVENT.at,
    event_key: '',
    event: FULL_MOON_EVENT,
    reverted: false,
    revert_expires_at: null,
    revert_to_date: null,
    ...over,
  };
}

/** A conjunction's Scribe, selling Paper, in town and unbought. */
export function paperOffer(over: Partial<MerchantOffer> = {}): MerchantOffer {
  return stoneOffer({
    offer_id: 3,
    merchant_name: 'The Scribe',
    item_name: 'Paper',
    cost_hades_coins: 3,
    trigger_kind: 'conjunction',
    period_start: MERCURY_JUPITER_EVENT.at,
    event_key: MERCURY_JUPITER_EVENT.key,
    event: MERCURY_JUPITER_EVENT,
    ...over,
  });
}

/** A whole /merchant/offer response: nobody in town unless given. */
export function merchantState(over: Partial<MerchantState> = {}): MerchantState {
  const offers = over.offers ?? [];
  return {
    offer: offers.find((o) => o.trigger_kind === 'full_moon') ?? null,
    offers,
    sky_date: null,
    reverted: false,
    revert_expires_at: null,
    revert_to_date: null,
    ...over,
  };
}

/** A response while time is turned back to `revertedTo`. */
export function revertedState(revertedTo: string, over: Partial<MerchantState> = {}): MerchantState {
  return merchantState({
    sky_date: revertedTo,
    reverted: true,
    revert_expires_at: '2026-09-25T17:49:32Z',
    revert_to_date: revertedTo,
    ...over,
  });
}
