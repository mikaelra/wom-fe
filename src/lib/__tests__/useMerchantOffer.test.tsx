import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMerchantOffer } from '@/lib/useMerchantOffer';
import { getMerchantOffer } from '@/lib/api';
import { _resetSkyCache, getSky } from '@/lib/astrology';
import { merchantState, paperOffer, revertedState, stoneOffer } from '@/lib/__tests__/merchantFixtures';

vi.mock('@/lib/api', () => ({ getMerchantOffer: vi.fn() }));
vi.mock('@/lib/http', () => ({ getStoredAccountToken: () => 't' }));

const mockedGet = vi.mocked(getMerchantOffer);

beforeEach(() => {
  mockedGet.mockReset();
  mockedGet.mockResolvedValue(merchantState());
});

afterEach(() => _resetSkyCache());

describe('useMerchantOffer', () => {
  it('starts with nobody in town until the first poll answers', async () => {
    const { result } = renderHook(() => useMerchantOffer());
    expect(result.current.merchant).toBeNull();
    expect(result.current.offers).toEqual([]);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
  });

  it('picks up every merchant in town from the poll', async () => {
    mockedGet.mockResolvedValue(merchantState({ offers: [stoneOffer(), paperOffer()] }));
    const { result } = renderHook(() => useMerchantOffer());

    await waitFor(() =>
      expect(result.current.offers.map((o) => o.item_name)).toEqual(['Stone of Vitality', 'Paper']),
    );
  });

  it('leaves out a merchant whose event is not live', async () => {
    mockedGet.mockResolvedValue(merchantState({ offers: [stoneOffer({ active: false }), paperOffer()] }));
    const { result } = renderHook(() => useMerchantOffer());

    await waitFor(() => expect(result.current.offers.map((o) => o.item_name)).toEqual(['Paper']));
  });

  it('keeps the last answer when a poll fails', async () => {
    // Polled fast here so several attempts land inside the test, same
    // approach as useBossfightRoster's equivalent test -- a persistent
    // mock (not mockResolvedValueOnce) for each phase, so there is no race
    // between "once" being consumed and switching to rejection.
    mockedGet.mockResolvedValue(merchantState({ offers: [stoneOffer()] }));
    const { result } = renderHook(() => useMerchantOffer(20));
    await waitFor(() => expect(result.current.offers).toHaveLength(1));

    mockedGet.mockRejectedValue(new Error('offline'));
    await new Promise((r) => setTimeout(r, 80));

    expect(result.current.offers[0]?.item_name).toBe('Stone of Vitality');
  });

  it('refresh() re-polls immediately, without waiting the full interval', async () => {
    mockedGet.mockResolvedValue(merchantState({ offers: [paperOffer()] }));
    const { result } = renderHook(() => useMerchantOffer(60_000));
    await waitFor(() => expect(result.current.offers).toHaveLength(1));

    mockedGet.mockResolvedValue(merchantState({ offers: [paperOffer({ already_bought_this_period: true })] }));
    act(() => { result.current.refresh(); });

    await waitFor(() => expect(result.current.offers[0]?.already_bought_this_period).toBe(true));
  });

  it('stops polling after unmount', async () => {
    const { unmount } = renderHook(() => useMerchantOffer(20));
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    const callsAtUnmount = mockedGet.mock.calls.length;

    unmount();
    await new Promise((r) => setTimeout(r, 80));

    expect(mockedGet.mock.calls.length).toBe(callsAtUnmount);
  });

  it('reports a revert and when it ends', async () => {
    mockedGet.mockResolvedValue(revertedState('2026-01-01T00:00:00Z'));
    const { result } = renderHook(() => useMerchantOffer());

    await waitFor(() => expect(result.current.reverted).toBe(true));
    expect(result.current.revertToDate).toBe('2026-01-01T00:00:00Z');
    expect(result.current.revertExpiresAt).toBe('2026-09-25T17:49:32Z');
  });

  it('reads a revert off the legacy offer from a backend that predates stacking', async () => {
    mockedGet.mockResolvedValue({
      offer: stoneOffer({ reverted: true, revert_to_date: '2026-01-01T00:00:00Z', revert_expires_at: 'x' }),
      offers: [],
      sky_date: null,
    });
    const { result } = renderHook(() => useMerchantOffer());

    await waitFor(() => expect(result.current.reverted).toBe(true));
    expect(result.current.revertToDate).toBe('2026-01-01T00:00:00Z');
  });

  // docs/MERCHANT_PLAN.md §7 -- a sky somewhere other than now (a revert,
  // or the dev clock) moves getSky(), the app's one shared sky singleton.
  it('sky_date rewinds getSky() to it', async () => {
    const revertedTo = '2026-01-01T00:00:00Z';
    mockedGet.mockResolvedValue(revertedState(revertedTo));

    renderHook(() => useMerchantOffer());

    await waitFor(() => expect(getSky().date.getTime()).toBe(new Date(revertedTo).getTime()));
  });

  it('no sky_date leaves getSky() on the live clock', async () => {
    renderHook(() => useMerchantOffer());
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());

    const before = Date.now();
    expect(getSky().date.getTime()).toBeGreaterThanOrEqual(before);
  });
});
