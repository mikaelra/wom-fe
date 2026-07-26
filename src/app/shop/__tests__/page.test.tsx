import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShopPage from '@/app/shop/page';
import { claimName, getShopProducts, postCheckout, resolveAccountSession } from '@/lib/api';
import { ApiError, setStoredAccountToken } from '@/lib/http';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  getShopProducts: vi.fn(),
  postCheckout: vi.fn(),
  resolveAccountSession: vi.fn(),
  claimName: vi.fn(),
  checkClaimVerified: vi.fn(),
}));

const mockedGetShopProducts = vi.mocked(getShopProducts);
const mockedPostCheckout = vi.mocked(postCheckout);
const mockedResolveAccountSession = vi.mocked(resolveAccountSession);
const mockedClaimName = vi.mocked(claimName);

const WHEEL_PRODUCT = {
  id: 'wheel_special',
  name: 'Special Wheel',
  price_cents: 500,
  currency: 'usd',
  kind: 'wheel' as const,
  odds_denominator: 30000,
  odds: [
    { skin: 'frog_silver_v1', weight: 18900, probability: 0.63 },
    { skin: 'frog_gold_v1', weight: 9000, probability: 0.3 },
    { skin: 'frog_rainbow_v2', weight: 2000, probability: 0.0667 },
    { skin: 'frog_bling_v1', weight: 100, probability: 0.0033 },
  ],
};

const SKIN_PRODUCT = {
  id: 'skin_cherub',
  name: 'Cherub',
  price_cents: 50000,
  currency: 'usd',
  kind: 'skin' as const,
  skin: 'cherub_v1',
};

const flush = () => act(async () => Promise.resolve());

function loginAs() {
  setStoredAccountToken('sess-1');
}

beforeEach(() => {
  push.mockClear();
  mockedGetShopProducts.mockReset();
  mockedPostCheckout.mockReset();
  mockedResolveAccountSession.mockReset();
  mockedClaimName.mockReset();
});

afterEach(() => {
  localStorage.clear();
  setStoredAccountToken(null);
});

describe('ShopPage', () => {
  it('shows a coming-soon message when the shop is disabled', async () => {
    mockedGetShopProducts.mockResolvedValue({ shop_enabled: false, terms_version: '2026-07', products: [] });
    render(<ShopPage />);
    await flush();

    expect(screen.getByText(/isn't open yet/)).toBeInTheDocument();
  });

  it('renders the wheel odds table with exactly the served numbers (§9.2)', async () => {
    mockedGetShopProducts.mockResolvedValue({
      shop_enabled: true, terms_version: '2026-07', products: [WHEEL_PRODUCT],
    });
    render(<ShopPage />);
    await flush();

    for (const entry of WHEEL_PRODUCT.odds) {
      expect(screen.getByText(`${(entry.probability * 100).toFixed(2)}%`)).toBeInTheDocument();
    }
  });

  it('renders a skin product generically', async () => {
    mockedGetShopProducts.mockResolvedValue({
      shop_enabled: true, terms_version: '2026-07', products: [SKIN_PRODUCT],
    });
    render(<ShopPage />);
    await flush();

    expect(screen.getByText('Cherub')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('shows a log-in CTA instead of Buy when logged out', async () => {
    mockedGetShopProducts.mockResolvedValue({
      shop_enabled: true, terms_version: '2026-07', products: [WHEEL_PRODUCT],
    });
    render(<ShopPage />);
    await flush();

    expect(screen.getByText('Log in to buy')).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Buy' })).not.toBeInTheDocument();
  });

  it('disables Buy until the terms checkbox is checked', async () => {
    loginAs();
    mockedGetShopProducts.mockResolvedValue({
      shop_enabled: true, terms_version: '2026-07', products: [WHEEL_PRODUCT],
    });
    render(<ShopPage />);
    await flush();

    const buyButton = screen.getByRole('button', { name: 'Buy' });
    expect(buyButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(buyButton).not.toBeDisabled();
  });

  it('redirects to the Stripe checkout url on success', async () => {
    loginAs();
    mockedGetShopProducts.mockResolvedValue({
      shop_enabled: true, terms_version: '2026-07', products: [WHEEL_PRODUCT],
    });
    mockedPostCheckout.mockResolvedValue({ checkout_url: 'https://checkout.stripe.com/pay/cs_1', order_id: 42 });
    const locationStub = { href: '' };
    vi.stubGlobal('location', locationStub);

    render(<ShopPage />);
    await flush();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await waitFor(() => expect(locationStub.href).toBe('https://checkout.stripe.com/pay/cs_1'));

    vi.unstubAllGlobals();
  });

  it('region_blocked shows an inline region message instead of navigating', async () => {
    loginAs();
    mockedGetShopProducts.mockResolvedValue({
      shop_enabled: true, terms_version: '2026-07', products: [WHEEL_PRODUCT],
    });
    mockedPostCheckout.mockRejectedValue(new ApiError(403, 'Not available in your region.', 'region_blocked'));

    render(<ShopPage />);
    await flush();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await flush();

    expect(screen.getByText(/not available for purchase in your region/)).toBeInTheDocument();
  });

  it('already_owned flips the card to a confirm-purchase state', async () => {
    loginAs();
    mockedGetShopProducts.mockResolvedValue({
      shop_enabled: true, terms_version: '2026-07', products: [SKIN_PRODUCT],
    });
    mockedPostCheckout.mockRejectedValue(new ApiError(409, 'You already own this.', 'already_owned'));

    render(<ShopPage />);
    await flush();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await flush();

    expect(screen.getByText('You already own this. Buy another copy anyway?')).toBeInTheDocument();

    mockedPostCheckout.mockResolvedValue({ checkout_url: 'https://checkout.stripe.com/pay/cs_2', order_id: 7 });
    const locationStub = { href: '' };
    vi.stubGlobal('location', locationStub);
    fireEvent.click(screen.getByRole('button', { name: 'Buy anyway' }));
    await waitFor(() => expect(mockedPostCheckout).toHaveBeenLastCalledWith('sess-1', 'skin_cherub', true));
    vi.unstubAllGlobals();
  });

  it('email_unverified opens the inline verification gate and resends the link', async () => {
    loginAs();
    mockedGetShopProducts.mockResolvedValue({
      shop_enabled: true, terms_version: '2026-07', products: [WHEEL_PRODUCT],
    });
    mockedPostCheckout.mockRejectedValue(new ApiError(403, 'Email not verified.', 'email_unverified'));
    mockedResolveAccountSession.mockResolvedValue({
      name: 'Alice', email: 'alice@example.com', always_verify_email: false, email_verified: false,
    });
    mockedClaimName.mockResolvedValue({ success: true, pending_verification: true });

    render(<ShopPage />);
    await flush();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await flush();

    expect(mockedClaimName).toHaveBeenCalledWith('Alice', 'alice@example.com');
    expect(screen.getByText('Check your inbox')).toBeInTheDocument();
    expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument();
  });

  it('a generic checkout error shows the server message inline', async () => {
    loginAs();
    mockedGetShopProducts.mockResolvedValue({
      shop_enabled: true, terms_version: '2026-07', products: [WHEEL_PRODUCT],
    });
    mockedPostCheckout.mockRejectedValue(new Error('Something went wrong.'));

    render(<ShopPage />);
    await flush();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await flush();

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });
});
