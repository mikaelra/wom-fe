import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMerchantOffer } from '@/lib/useMerchantOffer';
import { getMerchantOffer } from '@/lib/api';

vi.mock('@/lib/api', () => ({ getMerchantOffer: vi.fn() }));
vi.mock('@/lib/http', () => ({ getStoredAccountToken: () => 't' }));

const mockedGet = vi.mocked(getMerchantOffer);

const offer = (over: Partial<{
  available: boolean; already_bought_this_period: boolean;
}> = {}) => ({
  offer_id: 1,
  merchant_name: 'The Merchant',
  item_name: 'Stone of Vitality',
  cost_hades_coins: 5,
  trigger_kind: 'full_moon',
  available: true,
  already_bought_this_period: false,
  period_start: '2026-09-26T16:49:32Z',
  ...over,
});

beforeEach(() => {
  mockedGet.mockReset();
  mockedGet.mockResolvedValue({ offer: null });
});

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
});
