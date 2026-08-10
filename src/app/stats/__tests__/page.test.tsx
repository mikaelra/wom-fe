import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import StatsPage from '@/app/stats/page';
import { getPlayerProfile, getRankedProfile, getWellProfile } from '@/lib/api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  getRankedProfile: vi.fn(),
  getWellProfile: vi.fn(),
  getPlayerProfile: vi.fn(),
}));

const mockedGetRankedProfile = vi.mocked(getRankedProfile);
const mockedGetWellProfile = vi.mocked(getWellProfile);
const mockedGetPlayerProfile = vi.mocked(getPlayerProfile);

const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  push.mockClear();
  mockedGetRankedProfile.mockReset();
  mockedGetWellProfile.mockReset();
  mockedGetPlayerProfile.mockReset();
  // Every test that doesn't care about the Well/Overview sections gets a
  // harmless default so it doesn't have to stub this itself.
  mockedGetWellProfile.mockResolvedValue({ well_wins: 0, rewards: [] });
  mockedGetPlayerProfile.mockResolvedValue({
    created_at: '2026-03-05T12:30:00Z',
    played_games: 0,
    wins: 0,
    kills: 0,
  });
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
    expect(mockedGetWellProfile).not.toHaveBeenCalled();
    expect(mockedGetPlayerProfile).not.toHaveBeenCalled();
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

  it('shows well wins and only the reward types actually discovered', async () => {
    localStorage.setItem('playerName', 'Oni');
    mockedGetRankedProfile.mockResolvedValue({ tier: 'Warlock', ranked_games_played: 10 });
    mockedGetWellProfile.mockResolvedValue({
      well_wins: 5,
      rewards: [
        { reward: '2_gold', count: 3, first_awarded_at: '2026-01-01T00:00:00Z' },
        { reward: 'instakill', count: 1, first_awarded_at: '2026-01-03T00:00:00Z' },
      ],
    });
    render(<StatsPage />);
    await flush();

    expect(mockedGetWellProfile).toHaveBeenCalledWith('Oni');
    expect(screen.getByText('5 well wins')).toBeInTheDocument();
    expect(screen.getByText('2 Coins')).toBeInTheDocument();
    expect(screen.getByText('×3')).toBeInTheDocument();
    expect(screen.getByText('Poisoned Dagger')).toBeInTheDocument();
    // Never-won reward types must not appear at all -- discovery means
    // absence, not a locked/greyed placeholder.
    expect(screen.queryByText('Deny Choice')).not.toBeInTheDocument();
    expect(screen.queryByText('Steal-All')).not.toBeInTheDocument();
  });

  it('shows an empty-discoveries message for a player with zero well wins', async () => {
    localStorage.setItem('playerName', 'Newbie');
    mockedGetRankedProfile.mockResolvedValue({ tier: null, ranked_games_played: 0 });
    mockedGetWellProfile.mockResolvedValue({ well_wins: 0, rewards: [] });
    render(<StatsPage />);
    await flush();

    expect(screen.getByText('0 well wins')).toBeInTheDocument();
    expect(screen.getByText("You haven't discovered any Well rewards yet.")).toBeInTheDocument();
  });

  it('shows a singular "win" for exactly one well win', async () => {
    localStorage.setItem('playerName', 'Oni');
    mockedGetRankedProfile.mockResolvedValue({ tier: 'Warlock', ranked_games_played: 10 });
    mockedGetWellProfile.mockResolvedValue({ well_wins: 1, rewards: [] });
    render(<StatsPage />);
    await flush();

    expect(screen.getByText('1 well win')).toBeInTheDocument();
  });

  it('shows the account-created date and games played', async () => {
    localStorage.setItem('playerName', 'Oni');
    mockedGetRankedProfile.mockResolvedValue({ tier: 'Warlock', ranked_games_played: 10 });
    mockedGetPlayerProfile.mockResolvedValue({
      created_at: '2026-03-05T12:30:00Z',
      played_games: 23,
      wins: 9,
      kills: 46,
    });
    render(<StatsPage />);
    await flush();

    expect(mockedGetPlayerProfile).toHaveBeenCalledWith('Oni');
    expect(screen.getByText('Account created: March 5, 2026')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
  });

  it('falls back to "Unknown" when the account has no created_at', async () => {
    localStorage.setItem('playerName', 'Ghost');
    mockedGetRankedProfile.mockResolvedValue({ tier: null, ranked_games_played: 0 });
    mockedGetPlayerProfile.mockResolvedValue({ created_at: null, played_games: 0, wins: 0, kills: 0 });
    render(<StatsPage />);
    await flush();

    expect(screen.getByText('Account created: Unknown')).toBeInTheDocument();
  });

  it('shows win rate and kills derived from games played, wins, and kills', async () => {
    localStorage.setItem('playerName', 'Oni');
    mockedGetRankedProfile.mockResolvedValue({ tier: 'Warlock', ranked_games_played: 10 });
    mockedGetPlayerProfile.mockResolvedValue({
      created_at: '2026-03-05T12:30:00Z',
      played_games: 20,
      wins: 9,
      kills: 47,
    });
    render(<StatsPage />);
    await flush();

    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('(9W)')).toBeInTheDocument();
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('(2.4/game)')).toBeInTheDocument();
  });

  it('shows a dash for win rate with zero games played, and no per-game kill average', async () => {
    localStorage.setItem('playerName', 'Newbie');
    mockedGetRankedProfile.mockResolvedValue({ tier: null, ranked_games_played: 0 });
    mockedGetPlayerProfile.mockResolvedValue({ created_at: null, played_games: 0, wins: 0, kills: 0 });
    render(<StatsPage />);
    await flush();

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/\/game/)).not.toBeInTheDocument();
  });

  it('shows the rarest well reward found, by lowest count', async () => {
    localStorage.setItem('playerName', 'Oni');
    mockedGetRankedProfile.mockResolvedValue({ tier: 'Warlock', ranked_games_played: 10 });
    mockedGetWellProfile.mockResolvedValue({
      well_wins: 5,
      rewards: [
        { reward: '2_gold', count: 3, first_awarded_at: '2026-01-01T00:00:00Z' },
        { reward: 'instakill', count: 1, first_awarded_at: '2026-01-03T00:00:00Z' },
      ],
    });
    render(<StatsPage />);
    await flush();

    const rarestFindLine = screen.getByText('Rarest find:').closest('p');
    expect(rarestFindLine).not.toBeNull();
    expect(rarestFindLine).toHaveTextContent('Poisoned Dagger');
    expect(rarestFindLine).toHaveTextContent('(×1)');
  });

  it('shows no rarest-find line when no Well rewards have been discovered', async () => {
    localStorage.setItem('playerName', 'Newbie');
    mockedGetRankedProfile.mockResolvedValue({ tier: null, ranked_games_played: 0 });
    mockedGetWellProfile.mockResolvedValue({ well_wins: 0, rewards: [] });
    render(<StatsPage />);
    await flush();

    expect(screen.queryByText('Rarest find:')).not.toBeInTheDocument();
  });
});
