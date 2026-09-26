import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import RevertTimeModal from '@/components/merchant/RevertTimeModal';
import { revertMerchantTime, type MerchantOffer } from '@/lib/api';
import { ApiError, setStoredAccountToken } from '@/lib/http';
import { moonZodiacSign } from '@/lib/astrology';
import type { Relic } from '@/types/game';

vi.mock('@/lib/api', () => ({ revertMerchantTime: vi.fn() }));

const mockedRevert = vi.mocked(revertMerchantTime);

const STONE: Relic = {
  id: 9,
  boss_id: null,
  created_at: '2026-01-01T00:00:00+00:00',
  newest_copy_created_at: '2026-09-11T21:00:00+00:00',
  name: 'Stone of Vitality',
  power_category: 'HEALTH',
  count: 1,
};

const OFFER: MerchantOffer = {
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
};

beforeEach(() => {
  mockedRevert.mockReset();
  setStoredAccountToken('sess-1');
});

const openConfirm = () => act(() => screen.getByRole('button', { name: 'Turn Back Time' }).click());
const confirm = () => act(() => screen.getByRole('button', { name: 'Yes, turn back time' }).click());

describe('RevertTimeModal', () => {
  it('shows the exact purchase instant and the Moon\'s zodiac sign, and calls no API yet', () => {
    render(<RevertTimeModal relic={STONE} offer={OFFER} onClose={vi.fn()} onReverted={vi.fn()} />);

    expect(screen.getByText('This Stone was bought')).toBeInTheDocument();
    const sign = moonZodiacSign(new Date(STONE.newest_copy_created_at));
    expect(screen.getByText(`Full Moon in ${sign}`)).toBeInTheDocument();
    expect(mockedRevert).not.toHaveBeenCalled();
  });

  it('Cancel calls onClose without calling the API', () => {
    const onClose = vi.fn();
    render(<RevertTimeModal relic={STONE} offer={OFFER} onClose={onClose} onReverted={vi.fn()} />);

    act(() => screen.getByRole('button', { name: 'Cancel' }).click());

    expect(onClose).toHaveBeenCalled();
    expect(mockedRevert).not.toHaveBeenCalled();
  });

  it('requires a second confirm before calling the API', () => {
    render(<RevertTimeModal relic={STONE} offer={OFFER} onClose={vi.fn()} onReverted={vi.fn()} />);

    openConfirm();

    expect(screen.getByRole('button', { name: 'Yes, turn back time' })).toBeInTheDocument();
    expect(mockedRevert).not.toHaveBeenCalled();
  });

  it('Back from the confirm step returns to the preview without calling the API', () => {
    render(<RevertTimeModal relic={STONE} offer={OFFER} onClose={vi.fn()} onReverted={vi.fn()} />);

    openConfirm();
    act(() => screen.getByRole('button', { name: 'Back' }).click());

    expect(screen.getByRole('button', { name: 'Turn Back Time' })).toBeInTheDocument();
    expect(mockedRevert).not.toHaveBeenCalled();
  });

  it('confirming twice calls the API with the session token, then reports success and closes', async () => {
    mockedRevert.mockResolvedValue({
      ok: true, expires_at: '2026-09-25T21:00:00+00:00', revert_to_date: '2026-09-11T21:00:00+00:00',
    });
    const onClose = vi.fn();
    const onReverted = vi.fn();
    render(<RevertTimeModal relic={STONE} offer={OFFER} onClose={onClose} onReverted={onReverted} />);

    openConfirm();
    confirm();

    await waitFor(() => expect(onReverted).toHaveBeenCalled());
    expect(mockedRevert).toHaveBeenCalledWith('sess-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the server error and does not report success when the sacrifice is rejected', async () => {
    mockedRevert.mockRejectedValue(new ApiError(409, "Someone has already turned back time.", 'already_reverted'));
    const onReverted = vi.fn();
    render(<RevertTimeModal relic={STONE} offer={OFFER} onClose={vi.fn()} onReverted={onReverted} />);

    openConfirm();
    confirm();

    await waitFor(() => expect(screen.getByText('Someone has already turned back time.')).toBeInTheDocument());
    expect(onReverted).not.toHaveBeenCalled();
  });

  describe('blocked by someone else\'s active revert', () => {
    // Built fresh per test, right before render -- not shared at describe
    // scope -- so the countdown's floor(diff/1000) can't drift across a
    // whole second between this being computed and the component's own
    // Date.now() read.
    const revertedOffer = (): MerchantOffer => ({
      ...OFFER,
      reverted: true,
      revert_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      revert_to_date: '2026-09-11T21:00:00+00:00',
    });

    it('shows the block reason and a countdown, with no way to confirm', () => {
      render(<RevertTimeModal relic={STONE} offer={revertedOffer()} onClose={vi.fn()} onReverted={vi.fn()} />);

      expect(screen.getByText('Someone has already turned back time.')).toBeInTheDocument();
      // Real time, not fake timers here -- a few ms of real test execution
      // can floor the countdown to 4:59 instead of 5:00, so match the
      // format rather than an exact value.
      expect(screen.getByText(/^[45]:\d{2}$/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Turn Back Time' })).not.toBeInTheDocument();
      expect(mockedRevert).not.toHaveBeenCalled();
    });

    it('still shows this Stone\'s own purchase instant and zodiac sign even though the action is blocked', () => {
      render(<RevertTimeModal relic={STONE} offer={revertedOffer()} onClose={vi.fn()} onReverted={vi.fn()} />);

      expect(screen.getByText('This Stone was bought')).toBeInTheDocument();
      const sign = moonZodiacSign(new Date(STONE.newest_copy_created_at));
      expect(screen.getByText(`Full Moon in ${sign}`)).toBeInTheDocument();
    });

    it('Close calls onClose', () => {
      const onClose = vi.fn();
      render(<RevertTimeModal relic={STONE} offer={revertedOffer()} onClose={onClose} onReverted={vi.fn()} />);

      act(() => screen.getByRole('button', { name: 'Close' }).click());

      expect(onClose).toHaveBeenCalled();
    });
  });

  it('treats a not-yet-loaded offer (null) as not blocked', () => {
    render(<RevertTimeModal relic={STONE} offer={null} onClose={vi.fn()} onReverted={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Turn Back Time' })).toBeInTheDocument();
  });

  it('Escape closes from the preview step', () => {
    const onClose = vi.fn();
    render(<RevertTimeModal relic={STONE} offer={OFFER} onClose={onClose} onReverted={vi.fn()} />);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(onClose).toHaveBeenCalled();
  });

  it('Escape backs out of the confirm step instead of closing', () => {
    const onClose = vi.fn();
    render(<RevertTimeModal relic={STONE} offer={OFFER} onClose={onClose} onReverted={vi.fn()} />);

    openConfirm();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Turn Back Time' })).toBeInTheDocument();
  });
});
