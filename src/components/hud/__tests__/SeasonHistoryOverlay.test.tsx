import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SeasonHistoryOverlay from '@/components/hud/SeasonHistoryOverlay';
import { getSeasonHistory } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getSeasonHistory: vi.fn(),
}));

const history = {
  human: [
    { season: 'Fall 2026', tier: 'Warlock', current: true },
    { season: 'Summer 2026', tier: 'Wizard I', current: false },
  ],
  ai: [{ season: 'Fall 2026', tier: 'Troll I', current: true }],
};

describe('SeasonHistoryOverlay', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('shows a loading state, then the Player tab by default', async () => {
    vi.mocked(getSeasonHistory).mockResolvedValue(history);
    render(<SeasonHistoryOverlay playerName="Oni" onClose={vi.fn()} />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText('Fall 2026')).toBeInTheDocument();
    expect(screen.getByText('Summer 2026')).toBeInTheDocument();
    expect(screen.getByText('Warlock')).toBeInTheDocument();
    expect(screen.getByText('(current)')).toBeInTheDocument();
    expect(getSeasonHistory).toHaveBeenCalledWith('Oni');
  });

  it('switches to the My AI tab without a second fetch', async () => {
    vi.mocked(getSeasonHistory).mockResolvedValue(history);
    render(<SeasonHistoryOverlay playerName="Oni" onClose={vi.fn()} />);
    await screen.findByText('Warlock');

    fireEvent.click(screen.getByRole('tab', { name: 'My AI' }));

    expect(screen.getByText('Troll I')).toBeInTheDocument();
    expect(screen.queryByText('Warlock')).not.toBeInTheDocument();
    expect(getSeasonHistory).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state for a ladder with no ranked seasons', async () => {
    vi.mocked(getSeasonHistory).mockResolvedValue({ human: [], ai: [] });
    render(<SeasonHistoryOverlay playerName="Newbie" onClose={vi.fn()} />);

    expect(await screen.findByText('No ranked seasons yet.')).toBeInTheDocument();
  });

  it('shows an error message on a failed fetch', async () => {
    vi.mocked(getSeasonHistory).mockRejectedValue(new Error('network down'));
    render(<SeasonHistoryOverlay playerName="Oni" onClose={vi.fn()} />);

    expect(await screen.findByText('network down')).toBeInTheDocument();
  });

  it('calls onClose on the × button and on Escape', async () => {
    vi.mocked(getSeasonHistory).mockResolvedValue(history);
    const onClose = vi.fn();
    render(<SeasonHistoryOverlay playerName="Oni" onClose={onClose} />);
    await screen.findByText('Warlock');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
