import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => ({ getRankedProfile: vi.fn(async () => ({ tier: null, ranked_games_played: 0 })) }));

import RankOutcome, { RANK_UP_HOLD_MS } from '@/components/hud/RankOutcome';

afterEach(() => {
  vi.useRealTimers();
});

describe('RankOutcome', () => {
  it('on a rank up turns the old rank into the new one, then says so (2026-10-17)', () => {
    vi.useFakeTimers();
    render(
      <RankOutcome
        result={{ tier_before: 'Troll I', tier_after: 'Troll II', promoted: true, games_at_tier: 1 }}
        playerName="Oni"
      />,
    );
    // First the old rank, the new one waiting under it.
    expect(screen.getByText('Troll I')).toBeTruthy();
    expect(screen.getByLabelText('Ranked up from Troll I to Troll II')).toBeTruthy();
    expect(screen.getByText('1 game at Troll II')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(RANK_UP_HOLD_MS + 1000);
    });
    // Then only the new rank, and Ranked up!
    expect(screen.queryByText('Troll I')).toBeNull();
    expect(screen.getByText('Troll II')).toBeTruthy();
    expect(screen.getByText('Ranked up!')).toBeTruthy();
  });

  it('on a rank down turns the old rank into the new one too, then says so', () => {
    vi.useFakeTimers();
    render(
      <RankOutcome result={{ tier_before: 'Djinn I', tier_after: 'Troll III', promoted: false }} playerName="Oni" />,
    );
    expect(screen.getByText('Djinn I')).toBeTruthy();
    expect(screen.getByLabelText('Ranked down from Djinn I to Troll III')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(RANK_UP_HOLD_MS + 1000);
    });
    expect(screen.queryByText('Djinn I')).toBeNull();
    expect(screen.getByText('Troll III')).toBeTruthy();
    expect(screen.getByText('Ranked down.')).toBeTruthy();
  });

  it('shows the new rank at once when motion is reduced', () => {
    const before = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    render(
      <RankOutcome result={{ tier_before: 'Troll I', tier_after: 'Troll II', promoted: true }} playerName="Oni" />,
    );
    expect(screen.queryByText('Troll I')).toBeNull();
    expect(screen.getByText('Troll II')).toBeTruthy();
    window.matchMedia = before;
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

  it('in placement shows the unranked emblem and the games until rank', () => {
    const { rerender } = render(
      <RankOutcome
        result={{ tier_before: null, tier_after: null, promoted: null, games_until_rank: 6 }}
        playerName="Oni"
      />,
    );
    expect(screen.getByText('Unranked')).toBeTruthy();
    expect(screen.getByText('6 games until rank')).toBeTruthy();
    rerender(
      <RankOutcome result={{ tier_before: null, tier_after: null, promoted: null, games_until_rank: 1 }} playerName="Oni" />,
    );
    expect(screen.getByText('1 game until rank')).toBeTruthy();
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
