import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RankBadge from '@/components/hud/RankBadge';
import { getRankedProfile } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getRankedProfile: vi.fn(),
}));

describe('RankBadge', () => {
  beforeEach(() => {
    vi.mocked(getRankedProfile).mockReset();
  });

  it('renders the tier name', () => {
    render(<RankBadge tier="Wizard I" />);
    expect(screen.getByText('Wizard I')).toBeInTheDocument();
  });

  it('renders "Unranked" for a null tier (never queued, or still in placements)', () => {
    render(<RankBadge tier={null} />);
    expect(screen.getByText('Unranked')).toBeInTheDocument();
  });

  it('falls back to the unranked color for an unrecognized tier string', () => {
    render(<RankBadge tier="Some Future Tier" />);
    const badge = screen.getByText('Some Future Tier');
    expect(badge.className).toContain('bg-gray-700');
  });

  it('shows the Principality leaderboard number when given one', () => {
    render(<RankBadge tier="Principality" placement={234} />);
    expect(screen.getByText('Principality')).toBeInTheDocument();
    expect(screen.getByText('#234')).toBeInTheDocument();
    expect(getRankedProfile).not.toHaveBeenCalled();
  });

  it('looks up the Principality number itself from a player name', async () => {
    vi.mocked(getRankedProfile).mockResolvedValue({
      tier: 'Principality',
      ranked_games_played: 60,
      principality_rank: 137,
    });
    render(<RankBadge tier="Principality" playerName="Blimkin" />);
    expect(await screen.findByText('#137')).toBeInTheDocument();
    expect(getRankedProfile).toHaveBeenCalledWith('Blimkin');
  });

  it('shows Principality without a number when placement is null', () => {
    render(<RankBadge tier="Principality" placement={null} playerName="Blimkin" />);
    expect(screen.getByText('Principality')).toBeInTheDocument();
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
    expect(getRankedProfile).not.toHaveBeenCalled();
  });

  it('renders the large reveal for getting Principality', () => {
    render(<RankBadge tier="Principality" placement={137} size="lg" />);
    expect(screen.getByLabelText('Principality #137')).toBeInTheDocument();
    expect(screen.getByText('#137')).toBeInTheDocument();
  });
});
