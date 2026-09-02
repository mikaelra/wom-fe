import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MarketHistoryModal from '@/components/market/MarketHistoryModal';
import { getMarketTrades } from '@/lib/api';
import type { MarketTrade } from '@/lib/market';

vi.mock('@/lib/api', () => ({ getMarketTrades: vi.fn() }));
const mockedGet = vi.mocked(getMarketTrades);

const trade = (over: Partial<MarketTrade> = {}): MarketTrade => ({
  id: 5,
  listing_id: 50,
  kind: 'quick',
  seller_name: 'Alice',
  buyer_name: 'Bo',
  completed_at: '2026-09-02T12:00:00+00:00',
  give: [{ item_type: 'skin', skin: 'frog_gold_v1', relic_id: null, wheel_kind: null, quantity: 1 }],
  want: [{ item_type: 'wheel', skin: null, relic_id: null, wheel_kind: 'special', quantity: 2 }],
  ...over,
});

beforeEach(() => {
  mockedGet.mockReset();
});

describe('MarketHistoryModal', () => {
  it('loads the first page on open and renders each trade', async () => {
    mockedGet.mockResolvedValue({ trades: [trade()], has_more: false, next_before: null });

    render(<MarketHistoryModal catalog={null} onClose={vi.fn()} />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Special Wheel ×2')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledExactlyOnceWith({});
  });

  it('shows the empty state when nothing has traded', async () => {
    mockedGet.mockResolvedValue({ trades: [], has_more: false, next_before: null });

    render(<MarketHistoryModal catalog={null} onClose={vi.fn()} />);

    expect(await screen.findByText('No trades have completed yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('Load more fetches the next page with the keyset cursor and appends it', async () => {
    mockedGet
      .mockResolvedValueOnce({ trades: [trade({ id: 5, seller_name: 'Alice' })], has_more: true, next_before: 5 })
      .mockResolvedValueOnce({ trades: [trade({ id: 2, seller_name: 'Cy' })], has_more: false, next_before: null });

    render(<MarketHistoryModal catalog={null} onClose={vi.fn()} />);

    const more = await screen.findByRole('button', { name: 'Load more' });
    more.click();

    await waitFor(() => expect(screen.getByText('Cy')).toBeInTheDocument());
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenNthCalledWith(2, { before: 5 });
  });

  it('surfaces a load failure', async () => {
    mockedGet.mockRejectedValue(new Error('Failed to load trade history.'));

    render(<MarketHistoryModal catalog={null} onClose={vi.fn()} />);

    expect(await screen.findByText('Failed to load trade history.')).toBeInTheDocument();
  });

  it('the close button calls onClose', async () => {
    mockedGet.mockResolvedValue({ trades: [], has_more: false, next_before: null });
    const onClose = vi.fn();

    render(<MarketHistoryModal catalog={null} onClose={onClose} />);
    await screen.findByText('No trades have completed yet.');

    screen.getByRole('button', { name: 'Close' }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
