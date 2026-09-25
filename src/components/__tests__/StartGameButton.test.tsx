import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import StartGameButton from '@/components/StartGameButton';
import type { LobbyState, Player } from '@/types/game';

const basePlayer: Player = {
  name: 'Alice',
  hp: 5,
  coins: 0,
  attackDamage: 1,
  alive: true,
  admin: true,
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

afterEach(() => {
  vi.useRealTimers();
});

describe('StartGameButton', () => {
  it('is enabled and calls onStartGame when nothing has changed', () => {
    const onStartGame = vi.fn();
    render(<StartGameButton state={baseState} onStartGame={onStartGame} />);

    const button = screen.getByRole('button', { name: 'Start Game' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onStartGame).toHaveBeenCalled();
  });

  it('does not block on the very first render, even though there is no prior snapshot to compare', () => {
    render(<StartGameButton state={baseState} onStartGame={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Start Game' })).not.toBeDisabled();
  });

  it('blocks for 5s after a player selection changes, then re-enables', () => {
    vi.useFakeTimers();
    const onStartGame = vi.fn();
    const { rerender } = render(<StartGameButton state={baseState} onStartGame={onStartGame} />);

    const changed: Player = { ...basePlayer, selected_relic_ids: [1] };
    act(() => {
      rerender(<StartGameButton state={{ ...baseState, players: [changed] }} onStartGame={onStartGame} />);
    });

    expect(screen.getByRole('button', { name: 'Start Game' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
    expect(onStartGame).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole('button', { name: 'Start Game' })).not.toBeDisabled();
  });

  it('does not block again for an unrelated re-render with the same selections', () => {
    const { rerender } = render(<StartGameButton state={baseState} onStartGame={vi.fn()} />);
    rerender(<StartGameButton state={{ ...baseState, round: 0 }} onStartGame={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Start Game' })).not.toBeDisabled();
  });

  it('blocks for 5s when a player joins the lobby', () => {
    vi.useFakeTimers();
    const { rerender } = render(<StartGameButton state={baseState} onStartGame={vi.fn()} />);

    const bob: Player = { ...basePlayer, name: 'Bob', admin: false };
    act(() => {
      rerender(<StartGameButton state={{ ...baseState, players: [basePlayer, bob] }} onStartGame={vi.fn()} />);
    });

    expect(screen.getByRole('button', { name: 'Start Game' })).toBeDisabled();
    expect(screen.getByTitle('Wait a moment — the lobby just changed.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole('button', { name: 'Start Game' })).not.toBeDisabled();
  });

  it('blocks for 5s when a player is kicked from the lobby', () => {
    vi.useFakeTimers();
    const bob: Player = { ...basePlayer, name: 'Bob', admin: false };
    const { rerender } = render(
      <StartGameButton state={{ ...baseState, players: [basePlayer, bob] }} onStartGame={vi.fn()} />
    );

    act(() => {
      rerender(<StartGameButton state={{ ...baseState, players: [basePlayer] }} onStartGame={vi.fn()} />);
    });

    expect(screen.getByRole('button', { name: 'Start Game' })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole('button', { name: 'Start Game' })).not.toBeDisabled();
  });

  it('does not block when a bot is added -- the admin just added it themselves', () => {
    const { rerender } = render(<StartGameButton state={baseState} onStartGame={vi.fn()} />);

    const turtle: Player = { ...basePlayer, name: 'TURTLE', admin: false, bot: true };
    rerender(<StartGameButton state={{ ...baseState, players: [basePlayer, turtle] }} onStartGame={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Start Game' })).not.toBeDisabled();
  });
});
