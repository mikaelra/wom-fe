import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMerchantOffer } from '@/lib/useMerchantOffer';
import { getMerchantOffer } from '@/lib/api';
import { _resetSkyCache, getSky } from '@/lib/astrology';

vi.mock('@/lib/api', () => ({ getMerchantOffer: vi.fn() }));
vi.mock('@/lib/http', () => ({ getStoredAccountToken: () => 't' }));

const mockedGet = vi.mocked(getMerchantOffer);

const offer = (over: Partial<{
  active: boolean; available: boolean; already_bought_this_period: boolean;
  reverted: boolean; revert_to_date: string | null;
}> = {}) => ({
  offer_id: 1,
  merchant_name: 'The Merchant',
  item_name: 'Stone of Vitality',
  cost_hades_coins: 5,
  trigger_kind: 'full_moon',
  active: true,
  available: true,
  already_bought_this_period: false,
  period_start: '2026-09-26T16:49:32Z',
  reverted: false,
  revert_expires_at: null,
  revert_to_date: null,
  ...over,
});

beforeEach(() => {
  mockedGet.mockReset();
  mockedGet.mockResolvedValue({ offer: null });
});

afterEach(() => _resetSkyCache());

describe('useMerchantOffer', () => {
  it('starts with no offer until the first poll answers', async () => {
    const { result } = renderHook(() => useMerchantOffer());
    expect(result.current.offer).toBeNull();
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
  });

  it('picks up an active offer from the poll', async () => {
    mockedGet.mockResolvedValue({ offer: offer() });
    const { result } = renderHook(() => useMerchantOffer());

    await waitFor(() => expect(result.current.offer?.item_name).toBe('Stone of Vitality'));
  });

  it('keeps the last offer when a poll fails', async () => {
    // Polled fast here so several attempts land inside the test, same
    // approach as useBossfightRoster's equivalent test -- a persistent
    // mock (not mockResolvedValueOnce) for each phase, so there is no race
    // between "once" being consumed and switching to rejection.
    mockedGet.mockResolvedValue({ offer: offer() });
    const { result } = renderHook(() => useMerchantOffer(20));
    await waitFor(() => expect(result.current.offer).not.toBeNull());

    mockedGet.mockRejectedValue(new Error('offline'));
    await new Promise((r) => setTimeout(r, 80));

    expect(result.current.offer?.item_name).toBe('Stone of Vitality');
  });

  it('refresh() re-polls immediately, without waiting the full interval', async () => {
    mockedGet.mockResolvedValue({ offer: offer({ already_bought_this_period: false }) });
    const { result } = renderHook(() => useMerchantOffer(60_000));
    await waitFor(() => expect(result.current.offer).not.toBeNull());

    mockedGet.mockResolvedValue({ offer: offer({ already_bought_this_period: true }) });
    act(() => { result.current.refresh(); });

    await waitFor(() => expect(result.current.offer?.already_bought_this_period).toBe(true));
  });

  it('stops polling after unmount', async () => {
    mockedGet.mockResolvedValue({ offer: null });
    const { unmount } = renderHook(() => useMerchantOffer(20));
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    const callsAtUnmount = mockedGet.mock.calls.length;

    unmount();
    await new Promise((r) => setTimeout(r, 80));

    expect(mockedGet.mock.calls.length).toBe(callsAtUnmount);
  });

  // docs/MERCHANT_PLAN.md §7 -- a reverted offer also rewinds getSky(),
  // the app's one shared sky singleton, to the instant the sacrificed
  // Stone of Vitality was bought.
  it('a reverted offer rewinds getSky() to revert_to_date', async () => {
    const revertedTo = '2026-01-01T00:00:00Z';
    mockedGet.mockResolvedValue({ offer: offer({ reverted: true, revert_to_date: revertedTo }) });

    renderHook(() => useMerchantOffer());

    await waitFor(() => expect(getSky().date.getTime()).toBe(new Date(revertedTo).getTime()));
  });

  it('a non-reverted offer leaves getSky() on the live clock', async () => {
    mockedGet.mockResolvedValue({ offer: offer({ reverted: false, revert_to_date: null }) });

    renderHook(() => useMerchantOffer());
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());

    const before = Date.now();
    expect(getSky().date.getTime()).toBeGreaterThanOrEqual(before);
  });
});
