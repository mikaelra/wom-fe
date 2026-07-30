import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import ShopSuccessPage from '@/app/shop/success/page';
import { getInventory } from '@/lib/api';
import { SUPPORT_EMAIL } from '@/config';
import { setStoredAccountToken } from '@/lib/http';

const searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/api', () => ({
  getInventory: vi.fn(),
}));

const mockedGetInventory = vi.mocked(getInventory);
const flush = () => act(async () => Promise.resolve());
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  mockedGetInventory.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  setStoredAccountToken(null);
  searchParams.delete('order');
});

describe('ShopSuccessPage', () => {
  it('shows an error state when not logged in', async () => {
    render(<ShopSuccessPage />);
    await flush();
    expect(screen.getByText(/must be logged in/)).toBeInTheDocument();
  });

  it('shows the received state once the inventory item count changes', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory
      .mockResolvedValueOnce({ equipped_skin: 'frog_green_v1', skins: [], wheels: [] })
      .mockResolvedValueOnce({ equipped_skin: 'frog_green_v1', skins: [], wheels: [{ id: 1, kind: 'special' }] });

    render(<ShopSuccessPage />);
    await advance(0);
    await advance(2000);

    expect(screen.getByText('Payment received!')).toBeInTheDocument();
    expect(screen.getByText('Go to Inventory')).toHaveAttribute('href', '/inventory');
  });

  it('rotates the reassurance text every 10s while polling, replacing rather than stacking', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({ equipped_skin: 'frog_green_v1', skins: [], wheels: [] });

    render(<ShopSuccessPage />);
    await advance(0);
    expect(screen.queryByText('Almost there…')).not.toBeInTheDocument();
    expect(screen.queryByText('So close…')).not.toBeInTheDocument();
    expect(screen.queryByText('Any second now…')).not.toBeInTheDocument();

    await advance(10_000);
    expect(screen.getByText('Almost there…')).toBeInTheDocument();

    await advance(10_000); // 20s total
    expect(screen.queryByText('Almost there…')).not.toBeInTheDocument();
    expect(screen.getByText('So close…')).toBeInTheDocument();

    await advance(10_000); // 30s total
    expect(screen.queryByText('So close…')).not.toBeInTheDocument();
    expect(screen.getByText('Any second now…')).toBeInTheDocument();

    await advance(10_000); // 40s total -- loops back to the first line
    expect(screen.queryByText('Any second now…')).not.toBeInTheDocument();
    expect(screen.getByText('Almost there…')).toBeInTheDocument();
  });

  it('stops polling and shows the support message with the order number after 60s with no change', async () => {
    searchParams.set('order', '42');
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({ equipped_skin: 'frog_green_v1', skins: [], wheels: [] });

    render(<ShopSuccessPage />);
    await advance(60_000);

    expect(screen.getByText(/order #42/)).toBeInTheDocument();
    expect(screen.getByText(SUPPORT_EMAIL)).toHaveAttribute('href', `mailto:${SUPPORT_EMAIL}`);

    const callsAtTimeout = mockedGetInventory.mock.calls.length;
    await advance(10_000);
    expect(mockedGetInventory.mock.calls.length).toBe(callsAtTimeout);
  });

  it('never claims the payment failed on timeout', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({ equipped_skin: 'frog_green_v1', skins: [], wheels: [] });

    render(<ShopSuccessPage />);
    await advance(60_000);

    expect(screen.getByText(/Payment received/)).toBeInTheDocument();
    expect(screen.queryByText(/fail/i)).not.toBeInTheDocument();
  });
});
