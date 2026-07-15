import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SceneOverlay, { type SceneOverlayConfig, type PreGameRenderOpts } from '@/components/SceneOverlay';
import { useLobbyConnection } from '@/lib/useLobbyConnection';
import { useLobbyGame, type UseLobbyGameResult } from '@/lib/useLobbyGame';
import { useRoundTimer } from '@/lib/useRoundTimer';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';
import { useGameEvents } from '@/lib/useGameEvents';
import { useStagedResources } from '@/lib/useStagedResources';
import type { LobbyState, Player } from '@/types/game';

vi.mock('@/lib/useLobbyConnection', () => ({ useLobbyConnection: vi.fn() }));
vi.mock('@/lib/useLobbyGame', () => ({ useLobbyGame: vi.fn() }));
vi.mock('@/lib/useRoundTimer', () => ({ useRoundTimer: vi.fn() }));
vi.mock('@/lib/useBossfightCountdown', () => ({ useBossfightCountdown: vi.fn() }));
vi.mock('@/lib/useGameEvents', () => ({ useGameEvents: vi.fn() }));
vi.mock('@/lib/useStagedResources', () => ({ useStagedResources: vi.fn() }));

const emit = vi.fn();
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ emit }) }));

const mockedUseLobbyConnection = vi.mocked(useLobbyConnection);
const mockedUseLobbyGame = vi.mocked(useLobbyGame);
const mockedUseRoundTimer = vi.mocked(useRoundTimer);
const mockedUseBossfightCountdown = vi.mocked(useBossfightCountdown);
const mockedUseGameEvents = vi.mocked(useGameEvents);
const mockedUseStagedResources = vi.mocked(useStagedResources);

const basePlayer: Player = {
  name: 'Alice',
  hp: 5,
  coins: 2,
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
  round: 1,
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

const baseLobbyGameResult: UseLobbyGameResult = {
  phase: 'playing',
  round: 1,
  myPlayer: basePlayer,
  isAlive: true,
  isAdmin: false,
  isReady: false,
  enemy: undefined,
  winner: null,
  wellWinner: null,
  isDenied: false,
  pendingDenyName: null,
  isPendingDenyChooser: false,
  eligibleDenyTargets: [],
  canAct: true,
};

const baseConfig: SceneOverlayConfig = {
  theme: {
    accentColorClass: '', panelBorderClass: '', msgBorderClass: '', msgTextClass: '',
    showMoreClass: '', backLinkClass: '', enemyBorderClass: '', enemyNameClass: '',
    enemyHpBarClass: '', enemyHpTextClass: '', loadingTextClass: '', loadingBgClass: '',
  },
  backLabel: '← Back',
  loadingText: 'Loading lobby…',
  enemyMaxHp: 8,
  renderGameOver: vi.fn(() => null),
};

beforeEach(() => {
  emit.mockClear();
  mockedUseLobbyConnection.mockReturnValue({ state: baseState, connectionStatus: 'connected' });
  mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult });
  mockedUseRoundTimer.mockReturnValue(null);
  mockedUseBossfightCountdown.mockReturnValue({ secondsUntil: null, raidMins: null, raidSecs: null });
  mockedUseGameEvents.mockReturnValue(null);
  mockedUseStagedResources.mockReturnValue(null);
});

describe('loading state', () => {
  it('shows the config loading text when there is no state yet', () => {
    mockedUseLobbyConnection.mockReturnValue({ state: null, connectionStatus: 'connecting' });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.getByText('Loading lobby…')).toBeInTheDocument();
  });
});

describe('pre-game delegation', () => {
  const preGameState: LobbyState = { ...baseState, round: 0 };

  it('calls renderPreGame with the computed props instead of the main overlay', () => {
    mockedUseLobbyConnection.mockReturnValue({ state: preGameState, connectionStatus: 'connected' });
    mockedUseLobbyGame.mockReturnValue({
      ...baseLobbyGameResult,
      phase: 'lobby',
      round: 0,
      isAdmin: true,
      enemy: undefined,
    });
    mockedUseBossfightCountdown.mockReturnValue({ secondsUntil: 90, raidMins: 1, raidSecs: 30 });
    const renderPreGame = vi.fn(() => <div data-testid="pre-game" />);

    render(
      <SceneOverlay
        lobbyId="AAAA"
        config={baseConfig}
        renderPreGame={renderPreGame}
      />
    );

    expect(screen.getByTestId('pre-game')).toBeInTheDocument();
    expect(renderPreGame).toHaveBeenCalledWith(expect.objectContaining({
      state: preGameState,
      lobbyId: 'AAAA',
      isAdmin: true,
      boss: undefined,
      raidMins: 1,
      raidSecs: 30,
    }));
  });

  it('wires onStartGame/onAddDummy/onKick to the right socket emits', () => {
    mockedUseLobbyConnection.mockReturnValue({ state: preGameState, connectionStatus: 'connected' });
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, phase: 'lobby', round: 0 });
    const renderPreGame = vi.fn<(opts: PreGameRenderOpts) => null>(() => null);

    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} renderPreGame={renderPreGame} />);
    expect(renderPreGame).toHaveBeenCalled();
    const opts = renderPreGame.mock.calls[0][0];

    opts.onStartGame();
    expect(emit).toHaveBeenCalledWith('start_game', { lobby_id: 'AAAA' });

    opts.onAddDummy();
    expect(emit).toHaveBeenCalledWith('add_dummy', { lobby_id: 'AAAA' });

    opts.onKick('Bob');
    expect(emit).toHaveBeenCalledWith('kick_player', { lobby_id: 'AAAA', target: 'Bob' });
  });
});

describe('game over', () => {
  it('calls renderGameOver with state/playerName/enemy/btn once the game is over', () => {
    localStorage.setItem('playerName', 'Alice');
    const enemy: Player = { ...basePlayer, name: 'Hades', boss: true };
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, phase: 'gameover', enemy });
    const renderGameOver = vi.fn(() => <div data-testid="game-over" />);

    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, renderGameOver }} />);

    expect(screen.getByTestId('game-over')).toBeInTheDocument();
    expect(renderGameOver).toHaveBeenCalledWith(expect.objectContaining({
      state: baseState,
      playerName: 'Alice',
      enemy,
      btn: expect.any(String),
    }));
    localStorage.clear();
  });
});

describe('action-availability gating', () => {
  it('shows the WELL/DEFEND buttons and top-of-arena resource cards when canAct is true', () => {
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.getByText('🏴 The Well')).toBeInTheDocument();
    expect(screen.getByText('🛡 DEFEND')).toBeInTheDocument();
    expect(screen.getByText('HP')).toBeInTheDocument();
  });

  it('hides the WELL/DEFEND buttons when canAct is false', () => {
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, canAct: false });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.queryByText('🏴 The Well')).not.toBeInTheDocument();
    expect(screen.queryByText('🛡 DEFEND')).not.toBeInTheDocument();
  });

  it('hides the WELL/DEFEND buttons and top-of-arena cards, but still shows bottom-of-screen cards, when hidePlayerActionButtons is set', () => {
    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, hidePlayerActionButtons: true }} />);
    expect(screen.queryByText('🏴 The Well')).not.toBeInTheDocument();
    expect(screen.queryByText('🛡 DEFEND')).not.toBeInTheDocument();
    // Resource cards still render, just in the bottom-of-screen block.
    expect(screen.getByText('HP')).toBeInTheDocument();
  });

  it('does not render resource cards for a spectator', () => {
    mockedUseLobbyGame.mockReturnValue({
      ...baseLobbyGameResult,
      myPlayer: { ...basePlayer, spectator: true },
    });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.queryByText('HP')).not.toBeInTheDocument();
  });
});

describe('deny picker', () => {
  const bob: Player = { ...basePlayer, name: 'Bob' };

  it('is hidden when the config does not enable it, even if this player is the pending chooser', () => {
    mockedUseLobbyGame.mockReturnValue({
      ...baseLobbyGameResult,
      isPendingDenyChooser: true,
      eligibleDenyTargets: [bob],
    });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.queryByText('Choose someone to deny next round')).not.toBeInTheDocument();
  });

  it('is hidden when this player is not the pending chooser, even if the config enables it', () => {
    mockedUseLobbyGame.mockReturnValue({
      ...baseLobbyGameResult,
      isPendingDenyChooser: false,
      eligibleDenyTargets: [bob],
    });
    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, showDenyPicker: true }} />);
    expect(screen.queryByText('Choose someone to deny next round')).not.toBeInTheDocument();
  });

  it('lists eligible targets and emits submit_deny_target once one is picked', () => {
    mockedUseLobbyGame.mockReturnValue({
      ...baseLobbyGameResult,
      isPendingDenyChooser: true,
      eligibleDenyTargets: [bob],
    });
    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, showDenyPicker: true }} />);

    const denyButton = screen.getByText('Deny');
    expect(denyButton).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Bob' } });
    expect(denyButton).not.toBeDisabled();

    fireEvent.click(denyButton);
    expect(emit).toHaveBeenCalledWith('submit_deny_target', { lobby_id: 'AAAA', target: 'Bob' });
  });
});
