import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LobbyOverlay, { InviteSection, renderGameOver, renderPreGame } from '@/components/lobby/LobbyOverlay';
import type { GameOverRenderOpts, PreGameRenderOpts } from '@/components/SceneOverlay';
import type { LobbyState, Player } from '@/types/game';

let capturedOnStateChange: ((s: LobbyState | null) => void) | null = null;
let capturedOnGameOverRevealed: ((revealed: boolean) => void) | null = null;

vi.mock('@/components/SceneOverlay', () => ({
  default: (props: { onStateChange?: (s: LobbyState | null) => void; onGameOverRevealed?: (revealed: boolean) => void }) => {
    capturedOnStateChange = props.onStateChange ?? null;
    capturedOnGameOverRevealed = props.onGameOverRevealed ?? null;
    return null;
  },
}));

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
  // Player list, kick icon, and relic selection all moved into the 3D scene
  // (PlayerAvatars' lobby-controls row, wired up by LobbyScene) — this overlay
  // is now just the top status pill and the bottom admin/invite controls.
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
    spinEnabled: true,
    onToggleSpin: vi.fn(),
    onOpenRules: vi.fn(),
  };

  it('shows the Lobby ID for a private lobby', () => {
    render(<>{renderPreGame(baseOpts)}</>);
    expect(screen.getByText('Lobby ID: AAAA')).toBeInTheDocument();
  });

  it('opens the rules via the provided callback, visible to non-admins too', () => {
    const onOpenRules = vi.fn();
    render(<>{renderPreGame({ ...baseOpts, isAdmin: false, onOpenRules })}</>);
    fireEvent.click(screen.getByText('Rules'));
    expect(onOpenRules).toHaveBeenCalledTimes(1);
  });

  it('shows "Camera Spin" with a leading icon reflecting the action a click would take', () => {
    const onToggleSpin = vi.fn();
    const { rerender } = render(<>{renderPreGame({ ...baseOpts, spinEnabled: true, onToggleSpin })}</>);
    const button = screen.getByText('⏸ Camera Spin');
    fireEvent.click(button);
    expect(onToggleSpin).toHaveBeenCalledTimes(1);

    rerender(<>{renderPreGame({ ...baseOpts, spinEnabled: false, onToggleSpin })}</>);
    expect(screen.getByText('▶️ Camera Spin')).toBeInTheDocument();
  });

  it('shows Start Game/Add Bot for admins, hides them otherwise', () => {
    const { rerender } = render(<>{renderPreGame({ ...baseOpts, isAdmin: false })}</>);
    expect(screen.queryByText('Start Game')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Bot')).not.toBeInTheDocument();

    rerender(<>{renderPreGame({ ...baseOpts, isAdmin: true })}</>);
    expect(screen.getByText('Start Game')).toBeInTheDocument();
    expect(screen.getByText('Add Bot')).toBeInTheDocument();
  });

  describe('Add Bot picker', () => {
    it('clicking Add Bot shows one button per bot type', () => {
      render(<>{renderPreGame({ ...baseOpts, isAdmin: true })}</>);

      fireEvent.click(screen.getByText('Add Bot'));

      // Add Bot itself stays in the DOM (just hidden, not unmounted) --
      // see the component's own comment on why unmounting it shifted
      // Start Game sideways.
      expect(screen.getByText('Add Bot')).toHaveClass('invisible');
      expect(screen.getByText('Turtle')).toBeInTheDocument();
      expect(screen.getByText('Sheep')).toBeInTheDocument();
      expect(screen.getByText('Wolf')).toBeInTheDocument();
      expect(screen.getByText('Owl')).toBeInTheDocument();
      expect(screen.getByText('Random')).toBeInTheDocument();
    });

    it('picking Random calls onAddDummy with no specific type, letting the server pick', () => {
      const onAddDummy = vi.fn();
      render(<>{renderPreGame({ ...baseOpts, isAdmin: true, onAddDummy })}</>);

      fireEvent.click(screen.getByText('Add Bot'));
      fireEvent.click(screen.getByText('Random'));

      expect(onAddDummy).toHaveBeenCalledWith('');
    });

    it('picking a type calls onAddDummy with it and collapses back to Add Bot', () => {
      const onAddDummy = vi.fn();
      render(<>{renderPreGame({ ...baseOpts, isAdmin: true, onAddDummy })}</>);

      fireEvent.click(screen.getByText('Add Bot'));
      fireEvent.click(screen.getByText('Owl'));

      expect(onAddDummy).toHaveBeenCalledWith('OWL');
      expect(screen.getByText('Add Bot')).not.toHaveClass('invisible');
      expect(screen.queryByText('Owl')).not.toBeInTheDocument();
    });

    it('clicking outside cancels the picker without adding a bot', () => {
      const onAddDummy = vi.fn();
      render(<>{renderPreGame({ ...baseOpts, isAdmin: true, onAddDummy })}</>);

      fireEvent.click(screen.getByText('Add Bot'));
      expect(screen.getByText('Owl')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);

      expect(onAddDummy).not.toHaveBeenCalled();
      expect(screen.getByText('Add Bot')).not.toHaveClass('invisible');
      expect(screen.queryByText('Owl')).not.toBeInTheDocument();
    });
  });

  it('always shows the Invite section, regardless of admin status', () => {
    render(<>{renderPreGame({ ...baseOpts, isAdmin: false })}</>);
    expect(screen.getByText('Invite')).toBeInTheDocument();
  });

  it('renders a StartGameButton wired to onStartGame for the admin', () => {
    const onStartGame = vi.fn();
    render(<>{renderPreGame({ ...baseOpts, isAdmin: true, onStartGame })}</>);
    fireEvent.click(screen.getByText('Start Game'));
    expect(onStartGame).toHaveBeenCalled();
  });

  it('shows the boss-fight banner, not the Lobby ID, when boss_fight and a boss are both present', () => {
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
    expect(screen.queryByText(/Lobby ID/)).not.toBeInTheDocument();
  });

  it('shows the ranked countdown and join progress, not the Lobby ID, for a ranked lobby', () => {
    render(<>{renderPreGame({
      ...baseOpts,
      rankedSecondsLeft: 42,
      state: { ...baseState, ranked: true, players: [basePlayer, { ...basePlayer, name: 'Bob' }] },
    })}</>);
    expect(screen.getByText('Ranked Match')).toBeInTheDocument();
    expect(screen.getByText('2/6 players joined')).toBeInTheDocument();
    expect(screen.getByText('Match starts in 42s')).toBeInTheDocument();
    expect(screen.queryByText(/Lobby ID/)).not.toBeInTheDocument();
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
    capturedOnGameOverRevealed = null;
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
      capturedOnGameOverRevealed?.(false);
    });
    expect(screen.queryByText(/You won a relic/)).not.toBeInTheDocument();

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: true, boss_fight: true });
      capturedOnGameOverRevealed?.(true);
    });
    expect(screen.getByText(/You won a relic/)).toBeInTheDocument();
  });

  it('does not show the nudge just because gameover is true -- waits for the Game Over reveal itself', () => {
    // Regression: this used to react to the raw state.gameover flag, which
    // flips true the instant the server broadcast arrives -- popping up
    // over the still-playing death/kill animation instead of after "Game
    // Over" actually appears (SceneOverlay's own revealedRound hold).
    render(<LobbyOverlay lobbyId="AAAA" />);
    const me: Player = { ...basePlayer, name: 'Alice', pending_relic_nudge: true };

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: true, boss_fight: true });
    });
    expect(screen.queryByText(/You won a relic/)).not.toBeInTheDocument();

    act(() => {
      capturedOnGameOverRevealed?.(true);
    });
    expect(screen.getByText(/You won a relic/)).toBeInTheDocument();
  });

  it('dismisses the nudge and does not show it again for the same state', () => {
    render(<LobbyOverlay lobbyId="AAAA" />);
    const me: Player = { ...basePlayer, name: 'Alice', pending_relic_nudge: true };

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: true, boss_fight: true });
      capturedOnGameOverRevealed?.(true);
    });
    expect(screen.getByText(/You won a relic/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('No thanks'));
    expect(screen.queryByText(/You won a relic/)).not.toBeInTheDocument();
  });
});

describe('LobbyOverlay (WheelClaimNudge gate)', () => {
  beforeEach(() => {
    capturedOnStateChange = null;
    capturedOnGameOverRevealed = null;
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
      capturedOnGameOverRevealed?.(false);
    });
    expect(screen.queryByText(/You won a Wheel/)).not.toBeInTheDocument();

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: true, boss_fight: false });
      capturedOnGameOverRevealed?.(true);
    });
    expect(screen.getByText(/You won a Wheel/)).toBeInTheDocument();
  });

  it('does not show the wheel nudge just because gameover is true -- waits for the Game Over reveal itself', () => {
    // Regression: this is the exact bug the user hit -- winning a Wheel on
    // the round they died popped the claim modal up instantly instead of
    // waiting for "Game Over" to actually appear.
    render(<LobbyOverlay lobbyId="AAAA" />);
    const me: Player = { ...basePlayer, name: 'Alice', pending_wheel_nudge: true };

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: true });
    });
    expect(screen.queryByText(/You won a Wheel/)).not.toBeInTheDocument();

    act(() => {
      capturedOnGameOverRevealed?.(true);
    });
    expect(screen.getByText(/You won a Wheel/)).toBeInTheDocument();
  });

  it('dismisses the wheel nudge and does not show it again for the same state', () => {
    render(<LobbyOverlay lobbyId="AAAA" />);
    const me: Player = { ...basePlayer, name: 'Alice', pending_wheel_nudge: true };

    act(() => {
      capturedOnStateChange?.({ ...baseState, players: [me], gameover: true });
      capturedOnGameOverRevealed?.(true);
    });
    expect(screen.getByText(/You won a Wheel/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('No thanks'));
    expect(screen.queryByText(/You won a Wheel/)).not.toBeInTheDocument();
  });
});
