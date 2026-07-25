import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import StatsPage from '@/app/stats/page';
import { getRankedProfile } from '@/lib/api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  getRankedProfile: vi.fn(),
}));

const mockedGetRankedProfile = vi.mocked(getRankedProfile);

const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  push.mockClear();
  mockedGetRankedProfile.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe('StatsPage', () => {
  it('prompts to log in when there is no battle name', async () => {
    render(<StatsPage />);
    await flush();

    expect(
      screen.getByText('You need a battle name before you have any stats to show.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Go to log in')).toBeInTheDocument();
    expect(mockedGetRankedProfile).not.toHaveBeenCalled();
  });

  it('shows the current tier once placements are done', async () => {
    localStorage.setItem('playerName', 'Oni');
    mockedGetRankedProfile.mockResolvedValue({ tier: 'Warlock', ranked_games_played: 10 });
    render(<StatsPage />);
    await flush();

    expect(mockedGetRankedProfile).toHaveBeenCalledWith('Oni');
    expect(screen.getByText('Oni')).toBeInTheDocument();
    expect(screen.getByText('Warlock')).toBeInTheDocument();
  });

  it('shows a placement-progress message while mid-placements', async () => {
    localStorage.setItem('playerName', 'Eleonora');
    mockedGetRankedProfile.mockResolvedValue({ tier: null, ranked_games_played: 4 });
    render(<StatsPage />);
    await flush();

    expect(screen.getByText('Unranked')).toBeInTheDocument();
    expect(screen.getByText('Play 6 more matches to get your rank.')).toBeInTheDocument();
  });

  it('shows a singular "match" when exactly one placement game remains', async () => {
    localStorage.setItem('playerName', 'Eleonora');
    mockedGetRankedProfile.mockResolvedValue({ tier: null, ranked_games_played: 9 });
    render(<StatsPage />);
    await flush();

    expect(screen.getByText('Play 1 more match to get your rank.')).toBeInTheDocument();
  });

  it('shows a never-queued message for a player with zero ranked games', async () => {
    localStorage.setItem('playerName', 'Newbie');
    mockedGetRankedProfile.mockResolvedValue({ tier: null, ranked_games_played: 0 });
    render(<StatsPage />);
    await flush();

    expect(screen.getByText('Unranked')).toBeInTheDocument();
    expect(screen.getByText('Play 10 matches to get your rank.')).toBeInTheDocument();
  });

  it('shows the backend error message on failure', async () => {
    localStorage.setItem('playerName', 'Oni');
    mockedGetRankedProfile.mockRejectedValue(new Error('Failed to fetch ranked profile.'));
    render(<StatsPage />);
    await flush();

    expect(screen.getByText('Failed to fetch ranked profile.')).toBeInTheDocument();
  });
});
