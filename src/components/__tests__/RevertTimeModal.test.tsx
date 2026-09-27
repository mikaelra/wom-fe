import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import RevertTimeModal from '@/components/merchant/RevertTimeModal';
import { formatWorldClock } from '@/lib/worldClock';
import { getMerchantSkyEvents, revertMerchantTime } from '@/lib/api';
import { ApiError, setStoredAccountToken } from '@/lib/http';
import { CONJUNCTION_COLOR, FULL_MOON_MERCHANT_COLOR } from '@/lib/merchant';
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

/** The date part formatExact renders -- enough to find the confirm text. */
const formatExactFor = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

const openConfirm = () => act(() => screen.getByRole('button', { name: 'Timewarp' }).click());
const confirm = () => act(() => screen.getByRole('button', { name: 'Yes, turn back time' }).click());

const renderModal = (props: Partial<Parameters<typeof RevertTimeModal>[0]> = {}) =>
  render(
    <RevertTimeModal
      relic={STONE}
      reverted={false}
      revertedTo={null}
      blocked={false}
      blockedUntil={null}
      statusKnown
      onClose={vi.fn()}
      onReverted={vi.fn()}
      {...props}
    />,
  );

describe('RevertTimeModal', () => {
  it('shows the exact purchase instant and what was in the sky then, and calls no revert yet', async () => {
    renderModal();

    expect(screen.getByText('This Stone of Vitality was bought')).toBeInTheDocument();
    expect(await screen.findByText('Full moon')).toBeInTheDocument();
    expect(mockedSkyEvents).toHaveBeenCalledWith(new Date(STONE.newest_copy_created_at).toISOString());
    expect(mockedRevert).not.toHaveBeenCalled();
  });

  it('lists only "Full moon" in purple and "Conjunction" in orange for a moment with both', async () => {
    mockedSkyEvents.mockResolvedValue([FULL_MOON_EVENT, MERCURY_JUPITER_EVENT]);
    renderModal({ relic: PAPER });

    expect(screen.getByText('This Paper was bought')).toBeInTheDocument();
    const moon = await screen.findByText('Full moon');
    const conj = screen.getByText('Conjunction');
    expect(moon).toHaveStyle({ color: FULL_MOON_MERCHANT_COLOR });
    expect(conj).toHaveStyle({ color: CONJUNCTION_COLOR });
    // Only the kind -- no sign, no planets.
    expect(screen.queryByText(/Aries|Libra|Mercury|Jupiter/)).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Timewarp' })).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: 'Timewarp' })).toBeInTheDocument();
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
    expect(mockedRevert).toHaveBeenCalledWith('sess-1', 'Stone of Vitality', null);
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
    expect(mockedRevert).toHaveBeenCalledWith('sess-1', 'Paper', null);
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

  describe('for a minute after someone timewarps', () => {
    // Built fresh per test, right before render, so the countdown's
    // floor(diff/1000) can't drift across a whole second between this
    // being computed and the component's own Date.now() read.
    const until = (ms = 42_000) => new Date(Date.now() + ms).toISOString();

    it('disables Timewarp and shows the time left in its place', () => {
      renderModal({ reverted: true, blocked: true, blockedUntil: until() });

      // Real time, not fake timers here -- a few ms of real test execution
      // can floor the countdown to 0:41 instead of 0:42, so match the
      // format rather than an exact value.
      const button = screen.getByRole('button', { name: /^Timewarp available in 0:4[12]$/ });
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(/^0:4[12]$/);
      expect(screen.queryByRole('button', { name: 'Timewarp' })).not.toBeInTheDocument();
      expect(mockedRevert).not.toHaveBeenCalled();
    });

    it('brings Timewarp back by itself when the minute is up', () => {
      vi.useFakeTimers({ now: Date.now() });
      try {
        renderModal({ reverted: true, blocked: true, blockedUntil: until(2_000) });
        expect(screen.getByRole('button', { name: /Timewarp available in/ })).toBeDisabled();

        act(() => { vi.advanceTimersByTime(3_000); });

        expect(screen.getByRole('button', { name: 'Timewarp' })).toBeEnabled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('still lists each copy\'s time while it waits', async () => {
      renderModal({ reverted: true, blocked: true, blockedUntil: until(), revertedTo: '2026-09-11T21:00:00+00:00' });

      expect(screen.getByText('This Stone of Vitality was bought')).toBeInTheDocument();
      expect(await screen.findByText('Full moon')).toBeInTheDocument();
    });

    it('Cancel still closes', () => {
      const onClose = vi.fn();
      renderModal({ reverted: true, blocked: true, blockedUntil: until(), onClose });

      act(() => screen.getByRole('button', { name: 'Cancel' }).click());

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('the header', () => {
    it('is the relic\'s name and its card text, then Time Warp', () => {
      renderModal({ relic: { ...PAPER, flavour_text: 'For writing on' } });

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Paper');
      expect(screen.getByText('For writing on')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Time Warp');
      expect(screen.queryByText('Turn Back Time')).not.toBeInTheDocument();
    });
  });

  describe('where time stands (moved here from the inventory card)', () => {
    it('says Normal time when nobody has reverted', () => {
      renderModal();
      expect(screen.getByText('Normal time')).toBeInTheDocument();
    });

    it('says what time is reverted to, in red, while someone has', () => {
      renderModal({
        reverted: true,
        blocked: true,
        blockedUntil: new Date(Date.now() + 42 * 60_000).toISOString(),
        revertedTo: '2026-09-11T21:00:00+00:00',
      });
      expect(screen.getByText(
        `Someone has currently warped time to ${formatWorldClock(new Date('2026-09-11T21:00:00+00:00'))}.`,
      )).toHaveClass('text-red-400');
      expect(screen.queryByText('Normal time')).not.toBeInTheDocument();
    });

    it('once past the first minute, still says reverted but lets the player Timewarp', () => {
      renderModal({ reverted: true, blocked: false, revertedTo: '2026-09-11T21:00:00+00:00' });

      expect(screen.getByText(/Someone has currently warped time to/)).toHaveClass('text-red-400');
      expect(screen.queryByText('Normal time')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Timewarp' })).toBeEnabled();
    });

    it('says nothing until the merchant poll has answered', () => {
      renderModal({ statusKnown: false });
      expect(screen.queryByText('Normal time')).not.toBeInTheDocument();
      expect(screen.queryByText(/warped time to/)).not.toBeInTheDocument();
    });
  });

  describe('choosing which copy\'s time', () => {
    const PAPERS: Relic = {
      ...PAPER,
      count: 2,
      copies: [
        { id: 42, created_at: '2028-10-03T12:00:00+00:00' },
        { id: 41, created_at: '2026-11-16T06:00:00+00:00' },
      ],
    };

    it('lists every copy\'s time with its own events, newest chosen', async () => {
      mockedSkyEvents.mockImplementation(async (at: string) =>
        at.startsWith('2028') ? [FULL_MOON_EVENT, MERCURY_JUPITER_EVENT] : [],
      );
      renderModal({ relic: PAPERS });

      expect(screen.getByText('Choose a time')).toBeInTheDocument();
      const options = screen.getAllByRole('radio');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveAttribute('aria-checked', 'true');
      expect(options[1]).toHaveAttribute('aria-checked', 'false');
      expect(await within(options[0]).findByText('Full moon')).toBeInTheDocument();
      expect(await within(options[1]).findByText('No merchant was in town then.')).toBeInTheDocument();
    });

    it('timewarps with the copy the player chose', async () => {
      mockedRevert.mockResolvedValue({ ok: true, expires_at: 'x', revert_to_date: 'y', events: [] });
      const onReverted = vi.fn();
      renderModal({ relic: PAPERS, onReverted });

      act(() => screen.getAllByRole('radio')[1].click());
      expect(screen.getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true');
      openConfirm();
      expect(screen.getByText(new RegExp(formatExactFor('2026-11-16T06:00:00+00:00')))).toBeInTheDocument();
      confirm();

      await waitFor(() => expect(onReverted).toHaveBeenCalled());
      expect(mockedRevert).toHaveBeenCalledWith('sess-1', 'Paper', 41);
    });

    it('asks the sky about a copy\'s time as ISO, whatever form it came in', async () => {
      renderModal({ relic: { ...STONE, newest_copy_created_at: 'Tue, 03 Oct 2028 12:00:00 GMT' } });

      await waitFor(() => expect(mockedSkyEvents).toHaveBeenCalledWith('2028-10-03T12:00:00.000Z'));
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
    expect(screen.getByRole('button', { name: 'Timewarp' })).toBeInTheDocument();
  });
});
