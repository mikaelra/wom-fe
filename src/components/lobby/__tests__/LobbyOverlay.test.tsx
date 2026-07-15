import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LobbyOverlay, { InviteSection, renderGameOver, renderPreGame } from '@/components/lobby/LobbyOverlay';
import type { GameOverRenderOpts, PreGameRenderOpts } from '@/components/SceneOverlay';
import type { LobbyState, Player } from '@/types/game';

let capturedOnStateChange: ((s: LobbyState | null) => void) | null = null;

vi.mock('@/components/SceneOverlay', () => ({
  default: (props: { onStateChange?: (s: LobbyState | null) => void }) => {
    capturedOnStateChange = props.onStateChange ?? null;
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

  it('shows "You won!" when the local player is the winner', () => {
    render(<>{renderGameOver(opts)}</>);
    expect(screen.getByText('You won! 👑')).toBeInTheDocument();
  });

  it('shows the winner\'s name when someone else won', () => {
    render(<>{renderGameOver({ ...opts, state: { ...opts.state, winner: 'Bob' } })}</>);
    expect(screen.getByText('Game Over! Bob wins!')).toBeInTheDocument();
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
    btn: '',
    onStartGame: vi.fn(),
    onAddDummy: vi.fn(),
    onKick: vi.fn(),
  };

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
