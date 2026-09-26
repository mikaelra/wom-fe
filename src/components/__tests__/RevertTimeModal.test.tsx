import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import RevertTimeModal from '@/components/merchant/RevertTimeModal';
import { getMerchantSkyEvents, revertMerchantTime } from '@/lib/api';
import { ApiError, setStoredAccountToken } from '@/lib/http';
import { blendPlanetColors, FULL_MOON_MERCHANT_COLOR } from '@/lib/merchant';
import { FULL_MOON_EVENT, MERCURY_JUPITER_EVENT } from '@/lib/__tests__/merchantFixtures';
import type { Relic } from '@/types/game';

vi.mock('@/lib/api', () => ({ revertMerchantTime: vi.fn(), getMerchantSkyEvents: vi.fn() }));

const mockedRevert = vi.mocked(revertMerchantTime);
const mockedSkyEvents = vi.mocked(getMerchantSkyEvents);

const STONE: Relic = {
  id: 9,
  boss_id: null,
  created_at: '2026-01-01T00:00:00+00:00',
  newest_copy_created_at: '2026-09-11T21:00:00+00:00',
  name: 'Stone of Vitality',
  power_category: 'HEALTH',
  count: 1,
};

const PAPER: Relic = {
  ...STONE,
  id: 10,
  name: 'Paper',
  power_category: 'KNOWLEDGE',
  newest_copy_created_at: '2028-10-03T12:00:00+00:00',
};

beforeEach(() => {
  mockedRevert.mockReset();
  mockedSkyEvents.mockReset().mockResolvedValue([FULL_MOON_EVENT]);
  setStoredAccountToken('sess-1');
});

const openConfirm = () => act(() => screen.getByRole('button', { name: 'Turn Back Time' }).click());
const confirm = () => act(() => screen.getByRole('button', { name: 'Yes, turn back time' }).click());

const renderModal = (props: Partial<Parameters<typeof RevertTimeModal>[0]> = {}) =>
  render(
    <RevertTimeModal
      relic={STONE}
      blocked={false}
      blockedUntil={null}
      onClose={vi.fn()}
      onReverted={vi.fn()}
      {...props}
    />,
  );

describe('RevertTimeModal', () => {
  it('shows the exact purchase instant and what was in the sky then, and calls no revert yet', async () => {
    renderModal();

    expect(screen.getByText('This Stone of Vitality was bought')).toBeInTheDocument();
    expect(await screen.findByText('Full moon in Aries')).toBeInTheDocument();
    expect(mockedSkyEvents).toHaveBeenCalledWith(STONE.newest_copy_created_at);
    expect(mockedRevert).not.toHaveBeenCalled();
  });

  it('lists every event of a moment that was a full moon and a conjunction, each in its colour', async () => {
    mockedSkyEvents.mockResolvedValue([FULL_MOON_EVENT, MERCURY_JUPITER_EVENT]);
    renderModal({ relic: PAPER });

    expect(screen.getByText('This Paper was bought')).toBeInTheDocument();
    const moon = await screen.findByText('Full moon in Aries');
    const conj = screen.getByText('Conjunction between Mercury and Jupiter in Libra');
    expect(moon).toHaveStyle({ color: FULL_MOON_MERCHANT_COLOR });
    expect(conj).toHaveStyle({ color: blendPlanetColors('Mercury', 'Jupiter') });
  });

  it('says so while it is still reading the sky', () => {
    mockedSkyEvents.mockReturnValue(new Promise(() => {}));
    renderModal();

    expect(screen.getByText('Reading the sky…')).toBeInTheDocument();
  });

  it('says so when no merchant was in town then', async () => {
    mockedSkyEvents.mockResolvedValue([]);
    renderModal();

    expect(await screen.findByText('No merchant was in town then.')).toBeInTheDocument();
  });

  it('says so when the sky could not be read, and still lets the player act', async () => {
    mockedSkyEvents.mockRejectedValue(new Error('offline'));
    renderModal();

    expect(await screen.findByText('Couldn’t read the sky right now.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn Back Time' })).toBeInTheDocument();
  });

  it('Cancel calls onClose without calling the API', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    act(() => screen.getByRole('button', { name: 'Cancel' }).click());

    expect(onClose).toHaveBeenCalled();
    expect(mockedRevert).not.toHaveBeenCalled();
  });

  it('requires a second confirm before calling the API', () => {
    renderModal();

    openConfirm();

    expect(screen.getByRole('button', { name: 'Yes, turn back time' })).toBeInTheDocument();
    expect(screen.getByText(/This sacrifices 1 Stone of Vitality/)).toBeInTheDocument();
    expect(mockedRevert).not.toHaveBeenCalled();
  });

  it('Back from the confirm step returns to the preview without calling the API', () => {
    renderModal();

    openConfirm();
    act(() => screen.getByRole('button', { name: 'Back' }).click());

    expect(screen.getByRole('button', { name: 'Turn Back Time' })).toBeInTheDocument();
    expect(mockedRevert).not.toHaveBeenCalled();
  });

  it('confirming twice sacrifices this relic with the session token, then reports success and closes', async () => {
    mockedRevert.mockResolvedValue({
      ok: true, expires_at: '2026-09-25T21:00:00+00:00', revert_to_date: '2026-09-11T21:00:00+00:00', events: [],
    });
    const onClose = vi.fn();
    const onReverted = vi.fn();
    renderModal({ onClose, onReverted });

    openConfirm();
    confirm();

    await waitFor(() => expect(onReverted).toHaveBeenCalled());
    expect(mockedRevert).toHaveBeenCalledWith('sess-1', 'Stone of Vitality');
    expect(onClose).toHaveBeenCalled();
  });

  it('sacrifices a Paper when a Paper is open', async () => {
    mockedRevert.mockResolvedValue({
      ok: true, expires_at: '2026-09-25T21:00:00+00:00', revert_to_date: PAPER.newest_copy_created_at, events: [],
    });
    const onReverted = vi.fn();
    renderModal({ relic: PAPER, onReverted });

    openConfirm();
    confirm();

    await waitFor(() => expect(onReverted).toHaveBeenCalled());
    expect(mockedRevert).toHaveBeenCalledWith('sess-1', 'Paper');
  });

  it('asks to log in rather than calling the API without a session', async () => {
    setStoredAccountToken(null);
    renderModal();

    openConfirm();
    confirm();

    expect(await screen.findByText('Log in to do this.')).toBeInTheDocument();
    expect(mockedRevert).not.toHaveBeenCalled();
  });

  it('shows the server error and does not report success when the sacrifice is rejected', async () => {
    mockedRevert.mockRejectedValue(new ApiError(409, 'Someone has already turned back time.', 'already_reverted'));
    const onReverted = vi.fn();
    renderModal({ onReverted });

    openConfirm();
    confirm();

    await waitFor(() => expect(screen.getByText('Someone has already turned back time.')).toBeInTheDocument());
    expect(onReverted).not.toHaveBeenCalled();
  });

  describe('blocked by someone else\'s active revert', () => {
    // Built fresh per test, right before render, so the countdown's
    // floor(diff/1000) can't drift across a whole second between this
    // being computed and the component's own Date.now() read.
    const until = () => new Date(Date.now() + 5 * 60_000).toISOString();

    it('shows the block reason and a countdown, with no way to confirm', () => {
      renderModal({ blocked: true, blockedUntil: until() });

      expect(screen.getByText('Someone has already turned back time.')).toBeInTheDocument();
      // Real time, not fake timers here -- a few ms of real test execution
      // can floor the countdown to 4:59 instead of 5:00, so match the
      // format rather than an exact value.
      expect(screen.getByText(/^[45]:\d{2}$/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Turn Back Time' })).not.toBeInTheDocument();
      expect(mockedRevert).not.toHaveBeenCalled();
    });

    it('names the relic in the block reason', () => {
      renderModal({ relic: PAPER, blocked: true, blockedUntil: until() });

      expect(screen.getByText(/can’t use Paper this way/)).toBeInTheDocument();
    });

    it('still shows this copy\'s own purchase instant and events even though the action is blocked', async () => {
      renderModal({ blocked: true, blockedUntil: until() });

      expect(screen.getByText('This Stone of Vitality was bought')).toBeInTheDocument();
      expect(await screen.findByText('Full moon in Aries')).toBeInTheDocument();
    });

    it('Close calls onClose', () => {
      const onClose = vi.fn();
      renderModal({ blocked: true, blockedUntil: until(), onClose });

      act(() => screen.getByRole('button', { name: 'Close' }).click());

      expect(onClose).toHaveBeenCalled();
    });
  });

  it('Escape closes from the preview step', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(onClose).toHaveBeenCalled();
  });

  it('Escape backs out of the confirm step instead of closing', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    openConfirm();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Turn Back Time' })).toBeInTheDocument();
  });
});
