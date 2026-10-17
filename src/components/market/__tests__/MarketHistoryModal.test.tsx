import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MarketHistoryModal from '@/components/market/MarketHistoryModal';
import { getMarketTrades } from '@/lib/api';
import type { MarketTrade } from '@/lib/market';

vi.mock('@/lib/api', () => ({ getMarketTrades: vi.fn() }));
const mockedGet = vi.mocked(getMarketTrades);

const GOLD = { item_type: 'skin' as const, skin: 'frog_gold_v1', relic_id: null, wheel_kind: null, quantity: 1 };
const WHEELS = { item_type: 'wheel' as const, skin: null, relic_id: null, wheel_kind: 'special', quantity: 2 };

const trade = (over: Partial<MarketTrade> = {}): MarketTrade => ({
  id: 5,
  listing_id: 50,
  kind: 'quick',
  role: 'seller',
  counterparty_name: 'Bo',
  completed_at: '2026-09-02T12:00:00+00:00',
  gave: [GOLD],
  got: [WHEELS],
  ...over,
});

beforeEach(() => {
  mockedGet.mockReset();
});

describe('MarketHistoryModal', () => {
  it('loads my first page on open, from my side', async () => {
    mockedGet.mockResolvedValue({ trades: [trade()], has_more: false, next_before: null });

    render(<MarketHistoryModal token="sess-1" catalog={null} onClose={vi.fn()} />);

    expect(await screen.findByText('Bo')).toBeInTheDocument();
    expect(screen.getByText(/traded with/)).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Special Wheel ×2')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledExactlyOnceWith('sess-1', {});
  });

  it('names the counterparty the same way whichever side I was on', async () => {
    mockedGet.mockResolvedValue({
      trades: [trade({ role: 'buyer', counterparty_name: 'Cy' })],
      has_more: false,
      next_before: null,
    });

    render(<MarketHistoryModal token="sess-1" catalog={null} onClose={vi.fn()} />);

    expect(await screen.findByText(/traded with/)).toBeInTheDocument();
    expect(screen.getByText('Cy')).toBeInTheDocument();
  });

  it('shows the empty state when I have no trades', async () => {
    mockedGet.mockResolvedValue({ trades: [], has_more: false, next_before: null });

    render(<MarketHistoryModal token="sess-1" catalog={null} onClose={vi.fn()} />);

    expect(await screen.findByText("You haven't completed any trades yet.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('Load more fetches the next page with the keyset cursor and appends it', async () => {
    mockedGet
      .mockResolvedValueOnce({ trades: [trade({ id: 5, counterparty_name: 'Bo' })], has_more: true, next_before: 5 })
      .mockResolvedValueOnce({ trades: [trade({ id: 2, counterparty_name: 'Cy' })], has_more: false, next_before: null });

    render(<MarketHistoryModal token="sess-1" catalog={null} onClose={vi.fn()} />);

    const more = await screen.findByRole('button', { name: 'Load more' });
    more.click();

    await waitFor(() => expect(screen.getByText('Cy')).toBeInTheDocument());
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenNthCalledWith(2, 'sess-1', { before: 5 });
  });

  it('surfaces a load failure', async () => {
    mockedGet.mockRejectedValue(new Error('Failed to load your trade history.'));

    render(<MarketHistoryModal token="sess-1" catalog={null} onClose={vi.fn()} />);

    expect(await screen.findByText('Failed to load your trade history.')).toBeInTheDocument();
  });

  it('the close button calls onClose', async () => {
    mockedGet.mockResolvedValue({ trades: [], has_more: false, next_before: null });
    const onClose = vi.fn();

    render(<MarketHistoryModal token="sess-1" catalog={null} onClose={onClose} />);
    await screen.findByText("You haven't completed any trades yet.");

    screen.getByRole('button', { name: 'Close' }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
