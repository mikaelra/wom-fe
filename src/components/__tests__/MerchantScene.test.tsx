import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import MerchantScene from '@/components/merchant/MerchantScene';
import { purchaseMerchantOffer } from '@/lib/api';
import type { MerchantOffer } from '@/lib/api';

vi.mock('@/lib/api', () => ({ purchaseMerchantOffer: vi.fn() }));

// SpinningModelViewer wraps @react-three/fiber's Canvas, which needs a real
// WebGL context jsdom can't provide (same reasoning as app/__tests__/page.test.tsx's
// Canvas mock) -- stubbed to a plain element so MerchantScene's own logic
// (buy/error/close) is what's under test, not R3F.
vi.mock('@/components/SpinningModelViewer', () => ({
  default: () => <div data-testid="merchant-model" />,
}));

const mockedPurchase = vi.mocked(purchaseMerchantOffer);

const OFFER: MerchantOffer = {
  offer_id: 1,
  merchant_name: 'The Merchant',
  item_name: 'Stone of Vitality',
  active: true,
  cost_hades_coins: 5,
  trigger_kind: 'full_moon',
  available: true,
  already_bought_this_period: false,
  period_start: '2026-09-26T16:49:32Z',
  reverted: false,
  revert_expires_at: null,
  revert_to_date: null,
};

beforeEach(() => {
  mockedPurchase.mockReset();
});

describe('MerchantScene', () => {
  it('shows the offer and makes no API call until Trade is clicked', () => {
    render(<MerchantScene offer={OFFER} token="t" onClose={vi.fn()} onPurchased={vi.fn()} />);

    expect(screen.getByText('Stone of Vitality')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === "5 Hades’ Coins")).toBeInTheDocument();
    expect(mockedPurchase).not.toHaveBeenCalled();
  });

  it('Close calls onClose without calling the API', () => {
    const onClose = vi.fn();
    render(<MerchantScene offer={OFFER} token="t" onClose={onClose} onPurchased={vi.fn()} />);

    act(() => screen.getByRole('button', { name: 'Close' }).click());

    expect(onClose).toHaveBeenCalled();
    expect(mockedPurchase).not.toHaveBeenCalled();
  });

  it('a successful trade calls the API with the token and shows the result', async () => {
    mockedPurchase.mockResolvedValue({ ok: true, item_name: 'Stone of Vitality' });
    const onPurchased = vi.fn();
    render(<MerchantScene offer={OFFER} token="sess-1" onClose={vi.fn()} onPurchased={onPurchased} />);

    act(() => screen.getByRole('button', { name: /Trade for 5/ }).click());

    await waitFor(() => expect(screen.getByText('Deal struck.')).toBeInTheDocument());
    expect(mockedPurchase).toHaveBeenCalledWith('sess-1');
    expect(onPurchased).toHaveBeenCalled();
  });

  it('shows the server error and stays on the offer when the trade is rejected', async () => {
    const { ApiError } = await import('@/lib/http');
    mockedPurchase.mockRejectedValue(new ApiError(409, "You don't have that many.", 'insufficient_coins'));
    render(<MerchantScene offer={OFFER} token="sess-1" onClose={vi.fn()} onPurchased={vi.fn()} />);

    act(() => screen.getByRole('button', { name: /Trade for 5/ }).click());

    await waitFor(() => expect(screen.getByText("You don't have that many.")).toBeInTheDocument());
    expect(screen.queryByText('Deal struck.')).not.toBeInTheDocument();
  });

  it('the Trade button is disabled when the offer is not available', () => {
    render(
      <MerchantScene offer={{ ...OFFER, available: false }} token="t" onClose={vi.fn()} onPurchased={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /Trade for 5/ })).toBeDisabled();
  });

  it('explains why the button is disabled when this player already traded this moon', () => {
    render(
      <MerchantScene
        offer={{ ...OFFER, available: false, already_bought_this_period: true }}
        token="t"
        onClose={vi.fn()}
        onPurchased={vi.fn()}
      />,
    );

    expect(screen.getByText('You’ve already traded this moon.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trade for 5/ })).toBeDisabled();
  });

  it('asks to log in rather than calling the API when there is no token', async () => {
    render(<MerchantScene offer={OFFER} token={null} onClose={vi.fn()} onPurchased={vi.fn()} />);

    act(() => screen.getByRole('button', { name: /Trade for 5/ }).click());

    await waitFor(() =>
      expect(screen.getByText('Log in to trade with the Merchant.')).toBeInTheDocument(),
    );
    expect(mockedPurchase).not.toHaveBeenCalled();
  });
});
