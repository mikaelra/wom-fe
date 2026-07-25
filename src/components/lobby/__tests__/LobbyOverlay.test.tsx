import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LobbyOverlay, { InviteSection, renderGameOver, renderPreGame } from '@/components/lobby/LobbyOverlay';
import type { GameOverRenderOpts, PreGameRenderOpts } from '@/components/SceneOverlay';
import { getPlayerRelics } from '@/lib/api';
import { COIN_RELIC_ID, type LobbyState, type Player } from '@/types/game';

let capturedOnStateChange: ((s: LobbyState | null) => void) | null = null;

vi.mock('@/components/SceneOverlay', () => ({
  default: (props: { onStateChange?: (s: LobbyState | null) => void }) => {
    capturedOnStateChange = props.onStateChange ?? null;
    return null;
  },
}));

vi.mock('@/lib/api', () => ({
  getPlayerRelics: vi.fn(),
}));

// Real RelicCoin renders a react-three-fiber <Canvas>, which needs a WebGL
// context jsdom can't provide -- mocked out wholesale, same as
// inventory/__tests__/page.test.tsx.
vi.mock('@/components/RelicCoin', () => ({
  default: () => <div data-testid="relic-coin" />,
}));

const mockedGetPlayerRelics = vi.mocked(getPlayerRelics);

const basePlayer: Player = {
  name: 'Alice',
  hp: 5,
  coins: 0,
  attackDamage: 1,
  alive: true,
  admin: false,
  spectator: false,
  bot: false,
  boss: false,
  lost_soul: false,
  title: null,
  idle_rounds: 0,
  pending_relic_nudge: false,
  skin: null,
  wheel_awarded: false,
  pending_wheel_nudge: false,
};

const baseState: LobbyState = {
  round: 0,
  players: [basePlayer],
  winner: null,
  wellwinner: null,
  pending_deny: null,
  deny_target: null,
  readyPlayers: [],
  history: [],
  round_end_time: null,
  boss_fight: false,
  start_time: null,
  gameover: false,
  chat: [],
};

describe('InviteSection', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('copies the lobby URL and shows a checkmark for 2s before reverting', async () => {
    vi.useFakeTimers();
    render(<InviteSection lobbyId="AAAA" />);

    const copyButton = screen.getByTitle('Copy lobby link');
    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/lobby/AAAA'));
    expect(screen.getByTitle('Copied!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTitle('Copy lobby link')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('opens the QR modal and closes it via the close button', () => {
    render(<InviteSection lobbyId="AAAA" />);
    expect(screen.queryByText('Scan to Join')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Show QR code'));
    expect(screen.getByText('Scan to Join')).toBeInTheDocument();

    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('Scan to Join')).not.toBeInTheDocument();
  });
});

describe('renderGameOver', () => {
  const opts: GameOverRenderOpts = {
    state: { ...baseState, winner: 'Alice' },
    playerName: 'Alice',
    enemy: undefined,
    btn: '',
  };

  afterEach(() => {
    localStorage.clear();
  });

  it('shows "You won!" when the local player is the winner', () => {
    render(<>{renderGameOver(opts)}</>);
    expect(screen.getByText('You won! 👑')).toBeInTheDocument();
  });

  it('shows the winner\'s name when someone else won', () => {
    render(<>{renderGameOver({ ...opts, state: { ...opts.state, winner: 'Bob' } })}</>);
    expect(screen.getByText('Game Over! Bob wins!')).toBeInTheDocument();
  });

  it('shows a link to the inventory when the local player was awarded a Wheel', () => {
    const me: Player = { ...basePlayer, name: 'Alice', wheel_awarded: true };
    render(<>{renderGameOver({ ...opts, state: { ...opts.state, players: [me] } })}</>);
    expect(screen.getByText(/You won a Wheel!/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Spin it in your inventory' })).toHaveAttribute(
      'href',
      '/inventory',
    );
  });

  it('does not show a claim-your-name teaser for a guest', () => {
    render(<>{renderGameOver(opts)}</>);
    expect(screen.queryByText(/to start earning Wheels/)).not.toBeInTheDocument();
  });

  it('shows "Ranked up!" and the new tier on a promotion', () => {
    render(
      <>
        {renderGameOver({
          ...opts,
          state: {
            ...opts.state,
            ranked_results: { Alice: { tier_before: 'Djinn I', tier_after: 'Djinn II', promoted: true } },
          },
        })}
      </>,
    );
    expect(screen.getByText('Djinn II')).toBeInTheDocument();
    expect(screen.getByText('Ranked up!')).toBeInTheDocument();
    expect(screen.queryByText('Djinn I')).not.toBeInTheDocument();
    expect(screen.queryByText(/rating/)).not.toBeInTheDocument();
  });

  it('shows "Ranked down." and the new tier on a demotion', () => {
    render(
      <>
        {renderGameOver({
          ...opts,
          state: {
            ...opts.state,
            ranked_results: { Alice: { tier_before: 'Djinn II', tier_after: 'Djinn I', promoted: false } },
          },
        })}
      </>,
    );
    expect(screen.getByText('Djinn I')).toBeInTheDocument();
    expect(screen.getByText('Ranked down.')).toBeInTheDocument();
  });

  it('shows just the current tier, with no up/down text, when the tier did not change', () => {
    render(
      <>
        {renderGameOver({
          ...opts,
          state: {
            ...opts.state,
            ranked_results: { Alice: { tier_before: 'Djinn I', tier_after: 'Djinn I', promoted: null } },
          },
        })}
      </>,
    );
    expect(screen.getByText('Djinn I')).toBeInTheDocument();
    expect(screen.queryByText('Ranked up!')).not.toBeInTheDocument();
    expect(screen.queryByText('Ranked down.')).not.toBeInTheDocument();
  });

  it('shows "Placement complete!" and the debut tier on the game-10 reveal', () => {
    render(
      <>
        {renderGameOver({
          ...opts,
          state: {
            ...opts.state,
            ranked_results: { Alice: { tier_before: null, tier_after: 'Warlock', promoted: null } },
          },
        })}
      </>,
    );
    expect(screen.getByText('Warlock')).toBeInTheDocument();
    expect(screen.getByText('Placement complete!')).toBeInTheDocument();
    expect(screen.queryByText('Ranked up!')).not.toBeInTheDocument();
    expect(screen.queryByText('Ranked down.')).not.toBeInTheDocument();
  });

  it('shows nothing rank-related while the rank is still hidden (placements)', () => {
    render(
      <>
        {renderGameOver({
          ...opts,
          state: {
            ...opts.state,
            ranked_results: { Alice: { tier_before: null, tier_after: null, promoted: null } },
          },
        })}
      </>,
    );
    expect(screen.queryByText('Ranked up!')).not.toBeInTheDocument();
    expect(screen.queryByText('Ranked down.')).not.toBeInTheDocument();
    expect(screen.queryByText('Unranked')).not.toBeInTheDocument();
    expect(screen.queryByText('Placement complete!')).not.toBeInTheDocument();
  });

  it('shows nothing rank-related for a non-ranked match', () => {
    render(<>{renderGameOver(opts)}</>);
    expect(screen.queryByText(/rating/)).not.toBeInTheDocument();
    expect(screen.queryByText('Ranked up!')).not.toBeInTheDocument();
  });
});

describe('renderPreGame', () => {
  const baseOpts: PreGameRenderOpts = {
    state: baseState,
    lobbyId: 'AAAA',
    playerName: 'Alice',
    isAdmin: false,
    boss: undefined,
    raidMins: null,
    raidSecs: null,
    rankedSecondsLeft: null,
    btn: '',
    onStartGame: vi.fn(),
    onAddDummy: vi.fn(),
    onKick: vi.fn(),
    onToggleRelicSelection: vi.fn(),
  };

  beforeEach(() => {
    mockedGetPlayerRelics.mockReset();
    mockedGetPlayerRelics.mockResolvedValue({ relics: [] });
  });

  it('shows a skull for a dead player and a crown for the winner', () => {
    const dead: Player = { ...basePlayer, name: 'Bob', hp: 0 };
    const winner: Player = { ...basePlayer, name: 'Carol' };
    render(<>{renderPreGame({
      ...baseOpts,
      state: { ...baseState, players: [dead, winner], winner: 'Carol' },
    })}</>);
    expect(screen.getByText('☠️')).toBeInTheDocument();
    expect(screen.getByText('👑')).toBeInTheDocument();
  });

  it('shows a crown for the well winner only when there is no game winner yet', () => {
    const wellWinner: Player = { ...basePlayer, name: 'Dave' };
    render(<>{renderPreGame({
      ...baseOpts,
      state: { ...baseState, players: [wellWinner], winner: null, wellwinner: 'Dave' },
    })}</>);
    expect(screen.getByText('👑')).toBeInTheDocument();
  });

  it('shows spectator, ready, and idle indicators', () => {
    const spectator: Player = { ...basePlayer, name: 'Eve', spectator: true };
    render(<>{renderPreGame({
      ...baseOpts,
      state: { ...baseState, players: [spectator], readyPlayers: ['Eve'] },
    })}</>);
    expect(screen.getByText('👁')).toBeInTheDocument();
    expect(screen.getByText('✅')).toBeInTheDocument();
  });

  it('shows the idle ghost only once idle_rounds reaches 2', () => {
    const almostIdle: Player = { ...basePlayer, name: 'Frank', idle_rounds: 1 };
    const { rerender } = render(<>{renderPreGame({
      ...baseOpts,
      state: { ...baseState, players: [almostIdle] },
    })}</>);
    expect(screen.queryByText('👻')).not.toBeInTheDocument();

    rerender(<>{renderPreGame({
      ...baseOpts,
      state: { ...baseState, players: [{ ...almostIdle, idle_rounds: 2 }] },
    })}</>);
    expect(screen.getByText('👻')).toBeInTheDocument();
  });

  it('shows Start Game/Add Bot and a kick icon for admins, hides them otherwise', () => {
    const other: Player = { ...basePlayer, name: 'Bob' };
    const { rerender } = render(<>{renderPreGame({
      ...baseOpts,
      isAdmin: false,
      state: { ...baseState, players: [basePlayer, other] },
    })}</>);
    expect(screen.queryByText('Start Game')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Kick player')).not.toBeInTheDocument();

    rerender(<>{renderPreGame({
      ...baseOpts,
      isAdmin: true,
      state: { ...baseState, players: [basePlayer, other] },
    })}</>);
    expect(screen.getByText('Start Game')).toBeInTheDocument();
    expect(screen.getByText('Add Bot')).toBeInTheDocument();
    // Only the *other* player gets a kick icon, not the admin viewing the list.
    expect(screen.getAllByTitle('Kick player')).toHaveLength(1);
  });

  it('does not show a kick icon for a player once the round has started', () => {
    const other: Player = { ...basePlayer, name: 'Bob' };
    render(<>{renderPreGame({
      ...baseOpts,
      isAdmin: true,
      state: { ...baseState, round: 1, players: [basePlayer, other] },
    })}</>);
    expect(screen.queryByTitle('Kick player')).not.toBeInTheDocument();
  });

  it('shows the boss-fight banner only when boss_fight and a boss are both present', () => {
    const boss: Player = { ...basePlayer, name: 'Hades', boss: true, hp: 8, title: 'Lord of the Underworld' };
    const { rerender } = render(<>{renderPreGame({
      ...baseOpts,
      state: { ...baseState, boss_fight: false },
      boss: undefined,
    })}</>);
    expect(screen.queryByText('Hades')).not.toBeInTheDocument();

    rerender(<>{renderPreGame({
      ...baseOpts,
      state: { ...baseState, boss_fight: true },
      boss,
      raidMins: 1,
      raidSecs: 30,
    })}</>);
    expect(screen.getByText('Hades')).toBeInTheDocument();
    expect(screen.getByText('Lord of the Underworld')).toBeInTheDocument();
    expect(screen.getByText('Boss-fight starts in 1m 30s')).toBeInTheDocument();
  });

  it('shows the relic-selection trigger only next to the local player\'s own name', () => {
    const other: Player = { ...basePlayer, name: 'Bob' };
    render(<>{renderPreGame({
      ...baseOpts,
      state: { ...baseState, players: [basePlayer, other] },
    })}</>);
    expect(screen.getAllByTitle('View your relics')).toHaveLength(1);
  });

  it('shows the selected-relic badge for any player, including a non-self player', () => {
    const other: Player = { ...basePlayer, name: 'Bob', selected_relic_ids: [COIN_RELIC_ID] };
    render(<>{renderPreGame({
      ...baseOpts,
      state: { ...baseState, players: [basePlayer, other] },
    })}</>);
    expect(screen.getByTitle('Selected: will start the match with +1 coin')).toBeInTheDocument();
  });

  it('opens the relic popover on click and shows the fetched inventory', async () => {
    mockedGetPlayerRelics.mockResolvedValue({
      relics: [{ id: COIN_RELIC_ID, boss_id: 6, created_at: '', name: 'Coin', power_category: 'MONETARY', count: 2 }],
    });
    render(<>{renderPreGame({
      ...baseOpts,
      state: { ...baseState, players: [basePlayer] },
    })}</>);

    await act(async () => {
      fireEvent.click(screen.getByTitle('View your relics'));
      await Promise.resolve();
    });

    expect(mockedGetPlayerRelics).toHaveBeenCalledWith('Alice');
    expect(screen.getByText('×2')).toBeInTheDocument();
  });

  it('shows the coin icon instead of "+" for the local player once they are selected', () => {
    const me: Player = { ...basePlayer, name: 'Alice', selected_relic_ids: [COIN_RELIC_ID] };
    render(<>{renderPreGame({
      ...baseOpts,
      playerName: 'Alice',
      state: { ...baseState, players: [me] },
    })}</>);
    expect(screen.queryByTitle('View your relics')).not.toBeInTheDocument();
    expect(screen.getByText('🪙')).toBeInTheDocument();
  });

  it('renders a StartGameButton wired to onStartGame for the admin', () => {
    const onStartGame = vi.fn();
    render(<>{renderPreGame({
      ...baseOpts,
      isAdmin: true,
      onStartGame,
      state: { ...baseState, players: [basePlayer] },
    })}</>);
    fireEvent.click(screen.getByText('Start Game'));
    expect(onStartGame).toHaveBeenCalled();
  });

  it('shows the ranked countdown and join progress for a ranked lobby', () => {
    render(<>{renderPreGame({
      ...baseOpts,
      rankedSecondsLeft: 42,
      state: { ...baseState, ranked: true, players: [basePlayer, { ...basePlayer, name: 'Bob' }] },
    })}</>);
    expect(screen.getByText('Ranked Match')).toBeInTheDocument();
    expect(screen.getByText('2/6 players joined')).toBeInTheDocument();
    expect(screen.getByText('Match starts in 42s')).toBeInTheDocument();
  });

  it('shows no countdown line for a ranked lobby before the deadline is known', () => {
    render(<>{renderPreGame({
      ...baseOpts,
      rankedSecondsLeft: null,
      state: { ...baseState, ranked: true, players: [basePlayer] },
    })}</>);
    expect(screen.getByText('Ranked Match')).toBeInTheDocument();
    expect(screen.queryByText(/Match starts in/)).not.toBeInTheDocument();
  });

  it('shows no ranked panel for a non-ranked lobby', () => {
    render(<>{renderPreGame(baseOpts)}</>);
    expect(screen.queryByText('Ranked Match')).not.toBeInTheDocument();
  });
});

describe('LobbyOverlay (BossSignupNudge gate)', () => {
  beforeEach(() => {
    capturedOnStateChange = null;
    localStorage.setItem('playerName', 'Alice');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('does not show the nudge before any state has arrived', () => {
    render(<LobbyOverlay lobbyId="AAAA" />);
    expect(screen.queryByText(/You won a relic/)).not.toBeInTheDocument();
  });

  it('shows the nudge only when gameover, boss_fight, and pending_relic_nudge are all true', () => {
    render(<LobbyOverlay lobbyId="AAAA" />);
    const me: Player = { ...basePlayer, name: 'Alice', pending_relic_nudge: true };

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: false, boss_fight: true });
    });
    expect(screen.queryByText(/You won a relic/)).not.toBeInTheDocument();

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: true, boss_fight: true });
    });
    expect(screen.getByText(/You won a relic/)).toBeInTheDocument();
  });

  it('dismisses the nudge and does not show it again for the same state', () => {
    render(<LobbyOverlay lobbyId="AAAA" />);
    const me: Player = { ...basePlayer, name: 'Alice', pending_relic_nudge: true };

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: true, boss_fight: true });
    });
    expect(screen.getByText(/You won a relic/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('No thanks'));
    expect(screen.queryByText(/You won a relic/)).not.toBeInTheDocument();
  });
});

describe('LobbyOverlay (WheelClaimNudge gate)', () => {
  beforeEach(() => {
    capturedOnStateChange = null;
    localStorage.setItem('playerName', 'Alice');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows the wheel nudge on a PvP game-over too, unlike the boss-fight-only relic nudge', () => {
    render(<LobbyOverlay lobbyId="AAAA" />);
    const me: Player = { ...basePlayer, name: 'Alice', pending_wheel_nudge: true };

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: false, boss_fight: false });
    });
    expect(screen.queryByText(/You won a Wheel/)).not.toBeInTheDocument();

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: true, boss_fight: false });
    });
    expect(screen.getByText(/You won a Wheel/)).toBeInTheDocument();
  });

  it('dismisses the wheel nudge and does not show it again for the same state', () => {
    render(<LobbyOverlay lobbyId="AAAA" />);
    const me: Player = { ...basePlayer, name: 'Alice', pending_wheel_nudge: true };

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: true });
    });
    expect(screen.getByText(/You won a Wheel/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('No thanks'));
    expect(screen.queryByText(/You won a Wheel/)).not.toBeInTheDocument();
  });
});
