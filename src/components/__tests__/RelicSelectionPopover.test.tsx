import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import RelicSelectionPopover from '@/components/RelicSelectionPopover';
import { getPlayerRelics } from '@/lib/api';
import { COIN_RELIC_ID } from '@/types/game';

vi.mock('@/lib/api', () => ({
  getPlayerRelics: vi.fn(),
}));

// Real RelicCoin renders a react-three-fiber <Canvas>, which needs a WebGL
// context jsdom can't provide -- mocked out wholesale, same as
// inventory/__tests__/page.test.tsx and LobbyOverlay.test.tsx.
vi.mock('@/components/RelicCoin', () => ({
  default: () => <div data-testid="relic-coin" />,
}));

const mockedGetPlayerRelics = vi.mocked(getPlayerRelics);

const openPopover = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTitle('View your relics'));
    await Promise.resolve();
  });
};

beforeEach(() => {
  mockedGetPlayerRelics.mockReset();
  mockedGetPlayerRelics.mockResolvedValue({
    relics: [
      { id: COIN_RELIC_ID, boss_id: 6, created_at: '', name: 'Coin', power_category: 'MONETARY', count: 3 },
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RelicSelectionPopover: unselected state', () => {
  it('shows "+" and does not fetch inventory until opened', () => {
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('+')).toBeInTheDocument();
    expect(mockedGetPlayerRelics).not.toHaveBeenCalled();
  });

  it('fetches and renders the inventory on open, with the consumption-explicit tooltip', async () => {
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[]} onToggle={vi.fn()} />);
    await openPopover();

    expect(mockedGetPlayerRelics).toHaveBeenCalledWith('Alice');
    expect(screen.getByText('×3')).toBeInTheDocument();
    expect(
      screen.getByTitle("Use one Hades' Coin to start the game with +1 coin. This consumes it.")
    ).toBeInTheDocument();
  });

  it('shows an empty state with no relics', async () => {
    mockedGetPlayerRelics.mockResolvedValue({ relics: [] });
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[]} onToggle={vi.fn()} />);
    await openPopover();

    expect(screen.getByText('You have no relics yet.')).toBeInTheDocument();
  });

  it('selecting a relic calls onToggle, closes the popover, and does NOT show a cooldown overlay', async () => {
    const onToggle = vi.fn();
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[]} onToggle={onToggle} />);
    await openPopover();

    fireEvent.click(screen.getByTitle(/This consumes it\.$/));

    expect(onToggle).toHaveBeenCalledWith(COIN_RELIC_ID);
    expect(screen.queryByText('×3')).not.toBeInTheDocument(); // popover closed
    // A just-selected relic should look completely normal, even though a
    // cooldown is quietly running -- the badge is a static prop in this
    // test (nothing re-renders selectedRelicIds), so it's still "+", and
    // its title is unchanged rather than flipping to a cooldown message.
    expect(screen.queryByTestId('relic-cooldown-overlay')).not.toBeInTheDocument();
    expect(screen.getByTitle('View your relics')).toBeInTheDocument();
  });

  it('closes the popover when clicking outside', async () => {
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[]} onToggle={vi.fn()} />);
    await openPopover();
    expect(screen.getByText('×3')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('×3')).not.toBeInTheDocument();
  });

  it('the "+" stays instantly clickable during a cooldown -- the timer shows on the relic inside the popover instead', async () => {
    const onToggle = vi.fn();
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[]} onToggle={onToggle} />);
    await openPopover();
    fireEvent.click(screen.getByTitle(/This consumes it\.$/)); // select -> starts a cooldown, closes popover
    onToggle.mockClear();

    // Reopening isn't blocked by the cooldown -- selectedRelicIds is a
    // static prop here, so "+" is still what's rendered and still opens
    // fine on the very next click.
    await openPopover();
    expect(screen.getByText('×3')).toBeInTheDocument();

    // The relic inside, however, is now disabled and shows the timer.
    const relicButton = screen.getByTitle('You can only change your relic selection once every 10 seconds.');
    expect(relicButton).toBeDisabled();
    expect(screen.getByTestId('relic-cooldown-overlay')).toBeInTheDocument();

    fireEvent.click(relicButton);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('RelicSelectionPopover: selected state', () => {
  it('shows the coin icon instead of "+", with no popover trigger', () => {
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[COIN_RELIC_ID]} onToggle={vi.fn()} />);
    expect(screen.queryByText('+')).not.toBeInTheDocument();
    expect(screen.getByText('🪙')).toBeInTheDocument();
  });

  it('arms a removal confirmation (red cross) on first click, without calling onToggle or showing a cooldown', () => {
    const onToggle = vi.fn();
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[COIN_RELIC_ID]} onToggle={onToggle} />);

    fireEvent.click(screen.getByTitle(/This consumes it\.$/));

    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText('✕')).toBeInTheDocument();
    expect(screen.getByTitle('Click again to remove')).toBeInTheDocument();
    // Arming is instant and free -- it must be clickable right away, not
    // gated behind a cooldown of its own.
    expect(screen.queryByTestId('relic-cooldown-overlay')).not.toBeInTheDocument();
  });

  it('a second click confirms removal and calls onToggle exactly once', () => {
    const onToggle = vi.fn();
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[COIN_RELIC_ID]} onToggle={onToggle} />);

    fireEvent.click(screen.getByTitle(/This consumes it\.$/)); // arm
    fireEvent.click(screen.getByTitle('Click again to remove')); // confirm

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(COIN_RELIC_ID);
    expect(screen.queryByText('✕')).not.toBeInTheDocument();
  });

  it('clicking outside while armed cancels the confirmation without calling onToggle', () => {
    const onToggle = vi.fn();
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[COIN_RELIC_ID]} onToggle={onToggle} />);

    fireEvent.click(screen.getByTitle(/This consumes it\.$/)); // arm
    expect(screen.getByText('✕')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('✕')).not.toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not show the timer right after a confirmed removal, but reveals it on the next click attempt, until it clears', () => {
    vi.useFakeTimers();
    const onToggle = vi.fn();
    render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[COIN_RELIC_ID]} onToggle={onToggle} />);

    fireEvent.click(screen.getByTitle(/This consumes it\.$/)); // arm
    fireEvent.click(screen.getByTitle('Click again to remove')); // confirm -> cooldown starts, hidden
    onToggle.mockClear();

    // Looks untouched right after confirming.
    expect(screen.queryByTestId('relic-cooldown-overlay')).not.toBeInTheDocument();

    // selectedRelicIds is a static prop here, so the badge still renders
    // as the (now unarmed) coin -- trying to remove it again mid-cooldown
    // is a no-op, but is what reveals the timer.
    fireEvent.click(screen.getByTitle(/This consumes it\.$/));
    expect(screen.queryByText('✕')).not.toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByTestId('relic-cooldown-overlay')).toBeInTheDocument();
    expect(screen.getByTitle('You can only change your relic selection once every 10 seconds.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByTestId('relic-cooldown-overlay')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/This consumes it\.$/));
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('selecting does not show the timer immediately; trying to remove the resulting coin while still on cooldown reveals it', async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[]} onToggle={onToggle} />);
    await openPopover();
    fireEvent.click(screen.getByTitle(/This consumes it\.$/)); // select -> cooldown starts, hidden

    // Server confirms the selection; the parent re-renders with it.
    rerender(<RelicSelectionPopover playerName="Alice" selectedRelicIds={[COIN_RELIC_ID]} onToggle={onToggle} />);
    expect(screen.getByText('🪙')).toBeInTheDocument();
    expect(screen.queryByTestId('relic-cooldown-overlay')).not.toBeInTheDocument();

    // Trying to remove it while still blocked reveals the timer instead of arming.
    fireEvent.click(screen.getByTitle(/This consumes it\.$/));
    expect(screen.queryByText('✕')).not.toBeInTheDocument();
    expect(screen.getByTestId('relic-cooldown-overlay')).toBeInTheDocument();
  });
});
