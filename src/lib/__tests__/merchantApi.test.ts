// The merchant endpoints' client calls (docs/MERCHANT_PLAN.md) -- what they
// send, and that the response parses, including from a backend that
// predates stacked merchants.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BACKEND_URL } from '@/config';
import { getMerchantOffer, getMerchantSkyEvents, purchaseMerchantOffer, revertMerchantTime } from '@/lib/api';
import { FULL_MOON_EVENT, MERCURY_JUPITER_EVENT, paperOffer, stoneOffer } from '@/lib/__tests__/merchantFixtures';

const jsonResponse = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as unknown as Response;

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
};

describe('merchant api', () => {
  it('getMerchantOffer returns every merchant and the sky date', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      offer: stoneOffer(),
      offers: [stoneOffer(), paperOffer()],
      sky_date: '2028-10-03T12:00:00Z',
      reverted: false,
      revert_expires_at: null,
      revert_to_date: null,
    }));

    const res = await getMerchantOffer(null);

    expect(res.offers.map((o) => o.item_name)).toEqual(['Stone of Vitality', 'Paper']);
    expect(res.offers[1].event).toEqual(MERCURY_JUPITER_EVENT);
    expect(res.sky_date).toBe('2028-10-03T12:00:00Z');
    expect(sent()).toMatchObject({ url: `${BACKEND_URL}/merchant/offer`, method: 'POST', body: { token: '' } });
  });

  it('getMerchantOffer parses a response from before merchants stacked', async () => {
    const legacy = { ...stoneOffer() } as Record<string, unknown>;
    delete legacy.event_key;
    delete legacy.event;
    fetchMock.mockResolvedValue(jsonResponse({ offer: legacy }));

    const res = await getMerchantOffer('tok');

    expect(res.offers).toEqual([]);
    expect(res.sky_date).toBeNull();
    expect(res.offer).toMatchObject({ item_name: 'Stone of Vitality', event_key: '', event: null });
  });

  it('purchaseMerchantOffer names the merchant by offer and event', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, item_name: 'Paper' }));

    await purchaseMerchantOffer('tok', paperOffer());

    expect(sent().body).toEqual({ token: 'tok', offer_id: 3, event_key: 'Mercury-Jupiter' });
  });

  it('revertMerchantTime names the relic sacrificed', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      ok: true, expires_at: 'x', revert_to_date: 'y', events: [FULL_MOON_EVENT, MERCURY_JUPITER_EVENT],
    }));

    const res = await revertMerchantTime('tok', 'Paper');

    expect(sent().body).toEqual({ token: 'tok', relic: 'Paper' });
    expect(res.events).toHaveLength(2);
  });

  it('getMerchantSkyEvents GETs the instant, encoded', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ at: 'x', events: [FULL_MOON_EVENT] }));

    const events = await getMerchantSkyEvents('2028-10-03T12:00:00+00:00');

    expect(events).toEqual([FULL_MOON_EVENT]);
    expect(sent()).toMatchObject({
      url: `${BACKEND_URL}/merchant/sky_events?at=2028-10-03T12%3A00%3A00%2B00%3A00`,
      method: 'GET',
    });
  });
});
