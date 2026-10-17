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
    expect(screen.getByText('1 game at Troll II')).toBeTruthy();
  });

  it('says when it stayed the same, and how long it has', () => {
    render(
      <RankOutcome
        result={{ tier_before: 'Wizard I', tier_after: 'Wizard I', promoted: null, games_at_tier: 4 }}
        playerName="Oni"
      />,
    );
    expect(screen.getByText('Same rank')).toBeTruthy();
    expect(screen.getByText('4 games at Wizard I')).toBeTruthy();
  });

  it('says it went down, and shows nothing while the rank is hidden', () => {
    const { rerender } = render(
      <RankOutcome result={{ tier_before: 'Djinn I', tier_after: 'Troll III', promoted: false }} playerName="Oni" />,
    );
    expect(screen.getByText('Ranked down.')).toBeTruthy();
    expect(screen.queryByText(/games? at/)).toBeNull();
    rerender(<RankOutcome result={{ tier_before: null, tier_after: null, promoted: null }} playerName="Oni" />);
    expect(screen.queryByText('Ranked down.')).toBeNull();
  });
});
