import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import ShopSuccessPage from '@/app/shop/success/page';
import { getOrderStatus } from '@/lib/api';
import { SUPPORT_EMAIL } from '@/config';
import { setStoredAccountToken } from '@/lib/http';

const searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/api', () => ({
  getOrderStatus: vi.fn(),
}));

const mockedGetOrderStatus = vi.mocked(getOrderStatus);
const flush = () => act(async () => Promise.resolve());
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const pending = (product = 'ai_credits') => ({ status: 'pending', product, fulfilled: false });
const done = (product = 'ai_credits') => ({ status: 'fulfilled', product, fulfilled: true });

beforeEach(() => {
  vi.useFakeTimers();
  mockedGetOrderStatus.mockReset();
  searchParams.set('order', '42');
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

  it('goes straight to the timeout/support state when there is no order ref', async () => {
    searchParams.delete('order');
    setStoredAccountToken('sess-1');
    render(<ShopSuccessPage />);
    await flush();
    expect(screen.getByText(/Payment received/)).toBeInTheDocument();
    expect(mockedGetOrderStatus).not.toHaveBeenCalled();
  });

  it('shows "received" immediately when the webhook already fulfilled the order', async () => {
    setStoredAccountToken('sess-1');
    mockedGetOrderStatus.mockResolvedValue(done('ai_credits'));

    render(<ShopSuccessPage />);
    await advance(0);   // just the first poll -- no 2s wait needed

    expect(screen.getByText('Payment received!')).toBeInTheDocument();
    expect(mockedGetOrderStatus).toHaveBeenCalledTimes(1);
  });

  it('polls until the order flips to fulfilled', async () => {
    setStoredAccountToken('sess-1');
    mockedGetOrderStatus
      .mockResolvedValueOnce(pending())
      .mockResolvedValueOnce(done());

    render(<ShopSuccessPage />);
    await advance(0);
    expect(screen.queryByText('Payment received!')).not.toBeInTheDocument();

    await advance(2000);
    expect(screen.getByText('Payment received!')).toBeInTheDocument();
  });

  it('sends an ai_credits buyer to My AI, not the inventory', async () => {
    setStoredAccountToken('sess-1');
    mockedGetOrderStatus.mockResolvedValue(done('ai_credits'));

    render(<ShopSuccessPage />);
    await advance(0);

    expect(screen.getByText(/credits are on your account/)).toBeInTheDocument();
    expect(screen.getByText('Go to My AI')).toHaveAttribute('href', '/my-ai');
  });

  it('sends a skin/wheel buyer to the inventory', async () => {
    setStoredAccountToken('sess-1');
    mockedGetOrderStatus.mockResolvedValue(done('wheel_special'));

    render(<ShopSuccessPage />);
    await advance(0);

    expect(screen.getByText('Go to Inventory')).toHaveAttribute('href', '/inventory');
  });

  it('rotates the reassurance text every 10s while polling, replacing rather than stacking', async () => {
    setStoredAccountToken('sess-1');
    mockedGetOrderStatus.mockResolvedValue(pending());

    render(<ShopSuccessPage />);
    await advance(0);
    expect(screen.queryByText('Almost there…')).not.toBeInTheDocument();

    await advance(10_000);
    expect(screen.getByText('Almost there…')).toBeInTheDocument();

    await advance(10_000);
    expect(screen.queryByText('Almost there…')).not.toBeInTheDocument();
    expect(screen.getByText('So close…')).toBeInTheDocument();

    await advance(10_000);
    expect(screen.getByText('Any second now…')).toBeInTheDocument();

    await advance(10_000); // loops
    expect(screen.getByText('Almost there…')).toBeInTheDocument();
  });

  it('stops polling and shows the support message with the order number after 60s', async () => {
    setStoredAccountToken('sess-1');
    mockedGetOrderStatus.mockResolvedValue(pending());

    render(<ShopSuccessPage />);
    await advance(60_000);

    expect(screen.getByText(/order #42/)).toBeInTheDocument();
    expect(screen.getByText(SUPPORT_EMAIL)).toHaveAttribute('href', `mailto:${SUPPORT_EMAIL}`);

    const callsAtTimeout = mockedGetOrderStatus.mock.calls.length;
    await advance(10_000);
    expect(mockedGetOrderStatus.mock.calls.length).toBe(callsAtTimeout);
  });

  it('never claims the payment failed on timeout', async () => {
    setStoredAccountToken('sess-1');
    mockedGetOrderStatus.mockResolvedValue(pending());

    render(<ShopSuccessPage />);
    await advance(60_000);

    expect(screen.getByText(/Payment received/)).toBeInTheDocument();
    expect(screen.queryByText(/fail/i)).not.toBeInTheDocument();
  });
});
