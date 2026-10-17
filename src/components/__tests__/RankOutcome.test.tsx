import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => ({ getRankedProfile: vi.fn(async () => ({ tier: null, ranked_games_played: 0 })) }));

import RankOutcome from '@/components/hud/RankOutcome';

describe('RankOutcome', () => {
  it('says the rank went up, with the games at it', () => {
    render(
      <RankOutcome
        result={{ tier_before: 'Troll I', tier_after: 'Troll II', promoted: true, games_at_tier: 1 }}
        playerName="Oni"
      />,
    );
    expect(screen.getByText('Ranked up!')).toBeTruthy();
    // ...then the rank it came from.
    expect(screen.getByText('Troll I')).toBeTruthy();
    expect(screen.getByText('1 game at Troll II')).toBeTruthy();
  });

  it('has no word for staying the same, only how long it has (2026-10-17)', () => {
    render(
      <RankOutcome
        result={{ tier_before: 'Wizard I', tier_after: 'Wizard I', promoted: null, games_at_tier: 4 }}
        playerName="Oni"
      />,
    );
    expect(screen.queryByText('Same rank')).toBeNull();
    expect(screen.getByText('Wizard I')).toBeTruthy();
    expect(screen.getByText('4 games at Wizard I')).toBeTruthy();
  });

  it('in placement shows the unranked emblem and the games until a rank', () => {
    const { rerender } = render(
      <RankOutcome
        result={{ tier_before: null, tier_after: null, promoted: null, games_until_rank: 6 }}
        playerName="Oni"
      />,
    );
    expect(screen.getByText('Unranked')).toBeTruthy();
    expect(screen.getByText('6 games until a rank')).toBeTruthy();
    rerender(
      <RankOutcome result={{ tier_before: null, tier_after: null, promoted: null, games_until_rank: 1 }} playerName="Oni" />,
    );
    expect(screen.getByText('1 game until a rank')).toBeTruthy();
  });

  it('says it went down, and shows nothing while the rank is hidden', () => {
    const { rerender } = render(
      <RankOutcome result={{ tier_before: 'Djinn I', tier_after: 'Troll III', promoted: false }} playerName="Oni" />,
    );
    expect(screen.getByText('Ranked down.')).toBeTruthy();
    expect(screen.queryByText(/games? at/)).toBeNull();
    // An older backend sends no games_until_rank: nothing to say.
    rerender(<RankOutcome result={{ tier_before: null, tier_after: null, promoted: null }} playerName="Oni" />);
    expect(screen.queryByText('Ranked down.')).toBeNull();
    expect(screen.queryByText('Unranked')).toBeNull();
  });
});
