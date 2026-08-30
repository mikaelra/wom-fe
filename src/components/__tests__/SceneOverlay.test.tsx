import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import SceneOverlay, { type SceneOverlayConfig, type PreGameRenderOpts } from '@/components/SceneOverlay';
import { useLobbyConnection, type UseLobbyConnectionOptions } from '@/lib/useLobbyConnection';
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
  skin: null,
  wheel_awarded: false,
  pending_wheel_nudge: false,
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

let capturedConnectionOptions: UseLobbyConnectionOptions | undefined;

// Drives useLobbyConnection's return value while also capturing the
// onChatMessage/onError callbacks SceneOverlay passes in, so a test can
// invoke them directly to simulate a socket broadcast arriving.
function mockConnection(state: LobbyState | null) {
  mockedUseLobbyConnection.mockImplementation((_lobbyId, _playerName, options) => {
    capturedConnectionOptions = options;
    return { state, connectionStatus: state ? 'connected' : 'connecting' };
  });
}

beforeEach(() => {
  emit.mockClear();
  capturedConnectionOptions = undefined;
  mockConnection(baseState);
  mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult });
  mockedUseRoundTimer.mockReturnValue(null);
  mockedUseBossfightCountdown.mockReturnValue({ secondsUntil: null, bossfightMins: null, bossfightSecs: null });
  mockedUseGameEvents.mockReturnValue(null);
  mockedUseStagedResources.mockReturnValue(null);
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('loading state', () => {
  it('shows the config loading text when there is no state yet', () => {
    mockedUseLobbyConnection.mockReturnValue({ state: null, connectionStatus: 'connecting' });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.getByText('Loading lobby…')).toBeInTheDocument();
  });
});

describe('connection lost', () => {
  it('shows a connection-lost message instead of the stale game UI once connectionStatus flips to disconnected', () => {
    // state deliberately still populated -- useLobbyConnection.ts keeps
    // its last-known value forever on a lost connection, it never clears
    // to null. The message must come from connectionStatus, not from
    // state going away.
    mockedUseLobbyConnection.mockReturnValue({ state: baseState, connectionStatus: 'disconnected' });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.getByText('Connection lost. Please refresh.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'The Well' })).not.toBeInTheDocument();
  });

  it('does not show the connection-lost message while connected', () => {
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.queryByText('Connection lost. Please refresh.')).not.toBeInTheDocument();
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
    mockedUseBossfightCountdown.mockReturnValue({ secondsUntil: 90, bossfightMins: 1, bossfightSecs: 30 });
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
      bossfightMins: 1,
      bossfightSecs: 30,
    }));
  });

  it('wires onStartGame/onAddDummy to the right socket emits', () => {
    mockedUseLobbyConnection.mockReturnValue({ state: preGameState, connectionStatus: 'connected' });
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, phase: 'lobby', round: 0 });
    const renderPreGame = vi.fn<(opts: PreGameRenderOpts) => null>(() => null);

    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} renderPreGame={renderPreGame} />);
    expect(renderPreGame).toHaveBeenCalled();
    const opts = renderPreGame.mock.calls[0][0];

    opts.onStartGame();
    expect(emit).toHaveBeenCalledWith('start_game', { lobby_id: 'AAAA' });

    opts.onAddDummy('OWL');
    expect(emit).toHaveBeenCalledWith('add_dummy', { lobby_id: 'AAAA', bot_type: 'OWL' });
  });
});

describe('game over', () => {
  it('calls renderGameOver with state/playerName/enemy/btn once the game is over', () => {
    localStorage.setItem('playerName', 'Alice');
    const enemy: Player = { ...basePlayer, name: 'Hades', boss: true };
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, phase: 'gameover', enemy });
    // The Game Over screen is now gated on this round's messages having been
    // "revealed" (see the reveal-hold effect in SceneOverlay) -- baseState's
    // own gameover flag is false, so this round reveals synchronously the
    // instant gameEvents for it arrive, same as any ordinary round.
    mockedUseGameEvents.mockReturnValue({ round: baseState.round, messages: [], events: [], instakill: false });
    const renderGameOver = vi.fn(() => <div data-testid="game-over" />);

    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, renderGameOver }} />);

    expect(screen.getByTestId('game-over')).toBeInTheDocument();
    expect(renderGameOver).toHaveBeenCalledWith(expect.objectContaining({
      state: baseState,
      playerName: 'Alice',
      enemy,
      btn: expect.any(String),
    }));
  });

  it('holds off Game Over (and this round\'s messages) until the eliminating kill animation has played', () => {
    vi.useFakeTimers();
    localStorage.setItem('playerName', 'Alice');
    const bob: Player = { ...basePlayer, name: 'Bob', hp: 0 };
    const gameoverState: LobbyState = { ...baseState, gameover: true, winner: 'Alice', players: [basePlayer, bob] };
    mockConnection(gameoverState);
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, phase: 'gameover' });
    mockedUseGameEvents.mockReturnValue({
      round: gameoverState.round,
      messages: [['Alice eliminated Bob!']],
      events: [{ kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false, eliminated: true, coinsReceived: 0 }],
      instakill: false,
    });
    const renderGameOver = vi.fn(() => <div data-testid="game-over" />);

    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, renderGameOver }} />);

    // Not shown yet -- the kill animation hasn't finished. Even coinless,
    // buildCombatAnimationPlan's ATK-gain hpFx batch (which every kill
    // schedules) lands at SWORD_IMPACT_MS (600ms) + KILL_LOOT_LAND_MS
    // (1030ms) = 1630ms, the actual last batch in the plan.
    expect(screen.queryByTestId('game-over')).not.toBeInTheDocument();
    expect(screen.queryByText('Alice eliminated Bob!')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1630); });

    expect(screen.getByTestId('game-over')).toBeInTheDocument();
    expect(screen.getByText('Alice eliminated Bob!')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('calls onGameOverRevealed in sync with the held-off reveal, not the raw gameover flag', () => {
    // Regression coverage for LobbyOverlay's wheel/relic nudges, which
    // consume this callback specifically so they don't pop up over a
    // still-playing death animation -- see LobbyOverlay.test.tsx.
    vi.useFakeTimers();
    localStorage.setItem('playerName', 'Alice');
    const bob: Player = { ...basePlayer, name: 'Bob', hp: 0 };
    const gameoverState: LobbyState = { ...baseState, gameover: true, winner: 'Alice', players: [basePlayer, bob] };
    mockConnection(gameoverState);
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, phase: 'gameover' });
    mockedUseGameEvents.mockReturnValue({
      round: gameoverState.round,
      messages: [['Alice eliminated Bob!']],
      events: [{ kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false, eliminated: true, coinsReceived: 0 }],
      instakill: false,
    });
    const onGameOverRevealed = vi.fn();

    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} onGameOverRevealed={onGameOverRevealed} />);

    expect(onGameOverRevealed).toHaveBeenCalledWith(false);
    expect(onGameOverRevealed).not.toHaveBeenCalledWith(true);

    act(() => { vi.advanceTimersByTime(1630); });

    expect(onGameOverRevealed).toHaveBeenLastCalledWith(true);

    vi.useRealTimers();
  });

  it('falls back to revealing Game Over after a grace window if this round\'s events never arrive', () => {
    vi.useFakeTimers();
    localStorage.setItem('playerName', 'Alice');
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, phase: 'gameover' });
    mockedUseGameEvents.mockReturnValue(null); // events fetch never resolves
    const renderGameOver = vi.fn(() => <div data-testid="game-over" />);

    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, renderGameOver }} />);

    expect(screen.queryByTestId('game-over')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(4000); });

    expect(screen.getByTestId('game-over')).toBeInTheDocument();

    vi.useRealTimers();
  });
});

describe('action-availability gating', () => {
  it('shows the WELL/DEFEND buttons and top-of-arena resource cards when canAct is true', () => {
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.getByRole('button', { name: 'The Well' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Defend' })).toBeInTheDocument();
    expect(screen.getByText('HP')).toBeInTheDocument();
  });

  it('hides the WELL/DEFEND buttons when canAct is false', () => {
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, canAct: false });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.queryByRole('button', { name: 'The Well' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Defend' })).not.toBeInTheDocument();
  });

  it('hides the WELL/DEFEND buttons and top-of-arena cards, but still shows bottom-of-screen cards, when hidePlayerActionButtons is set', () => {
    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, hidePlayerActionButtons: true }} />);
    expect(screen.queryByRole('button', { name: 'The Well' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Defend' })).not.toBeInTheDocument();
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

  it('keeps the resource cards looking alive and clickable while dead but the staged HP hasn\'t visibly reached 0 yet', () => {
    mockedUseLobbyGame.mockReturnValue({
      ...baseLobbyGameResult,
      myPlayer: { ...basePlayer, hp: 0 },
      isAlive: false,
      canAct: false,
    });
    // Staged HP still mid-peel (see useStagedResources) -- the death strike's
    // animation hasn't landed yet.
    mockedUseStagedResources.mockReturnValue({ hp: 3, coins: 2, attackDamage: 1, hpAnim: 'shake', hpBlockPulse: 0 });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    const hpButton = screen.getByText('HP').closest('button');
    // Not natively disabled (some browsers dim disabled controls regardless
    // of custom classes) and no dimmed "dead" look yet...
    expect(hpButton).not.toBeDisabled();
    expect(hpButton?.className).not.toContain('opacity-60');
    // ...but a click during this window still can't actually submit
    // anything -- handleResource itself guards on the real canAct.
    fireEvent.click(hpButton!);
    expect(emit).not.toHaveBeenCalled();
  });

  it('keeps looking alive through the hold even when this death also ends the match', () => {
    // Regression: canActLook used to also require !gameOver, but a fatal
    // blow that ends the match flips gameOver the same instant it flips
    // isAlive -- reintroducing the exact instant-reveal bug this exists to
    // fix for any death that also happens to be the game's last.
    mockedUseLobbyGame.mockReturnValue({
      ...baseLobbyGameResult,
      phase: 'gameover',
      myPlayer: { ...basePlayer, hp: 0 },
      isAlive: false,
      canAct: false,
    });
    mockedUseStagedResources.mockReturnValue({ hp: 3, coins: 2, attackDamage: 1, hpAnim: 'shake', hpBlockPulse: 0 });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    const hpButton = screen.getByText('HP').closest('button');
    expect(hpButton).not.toBeDisabled();
    expect(hpButton?.className).not.toContain('opacity-60');
  });

  it('shows the dimmed look once the staged HP has visibly reached 0', () => {
    mockedUseLobbyGame.mockReturnValue({
      ...baseLobbyGameResult,
      myPlayer: { ...basePlayer, hp: 0 },
      isAlive: false,
      canAct: false,
    });
    mockedUseStagedResources.mockReturnValue({ hp: 0, coins: 2, attackDamage: 1, hpAnim: 'shake', hpBlockPulse: 0 });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    const hpButton = screen.getByText('HP').closest('button');
    expect(hpButton).toBeDisabled();
    expect(hpButton?.className).toContain('opacity-60');
  });

  it('still dims the cards immediately when canAct is false for a reason other than death', () => {
    mockedUseLobbyGame.mockReturnValue({
      ...baseLobbyGameResult,
      isAlive: true,
      isDenied: true,
      canAct: false,
    });
    mockedUseStagedResources.mockReturnValue({ hp: 5, coins: 2, attackDamage: 1, hpAnim: 'bounce', hpBlockPulse: 0 });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    const hpButton = screen.getByText('HP').closest('button');
    expect(hpButton).toBeDisabled();
    expect(hpButton?.className).toContain('opacity-60');
  });
});


describe('chat panel', () => {
  const chatConfig = { ...baseConfig, showChat: true };

  beforeEach(() => {
    localStorage.setItem('playerName', 'Alice');
  });

  it('toggles open, sends a message, and clears the input (in-game)', () => {
    render(<SceneOverlay lobbyId="AAAA" config={chatConfig} />);

    fireEvent.click(screen.getByLabelText('Toggle chat'));
    const input = screen.getByPlaceholderText('Chat…');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(emit).toHaveBeenCalledWith('send_message', { lobby_id: 'AAAA', message: 'hello' });
    expect(input).toHaveValue('');
  });

  it('shows an unread badge only while collapsed, and clears it on open (in-game)', () => {
    render(<SceneOverlay lobbyId="AAAA" config={chatConfig} />);
    expect(document.querySelector('.bg-orange-500')).not.toBeInTheDocument();

    act(() => {
      capturedConnectionOptions?.onChatMessage?.({ sender: 'Bob', message: 'hi', timestamp: new Date().toISOString() });
    });
    expect(document.querySelector('.bg-orange-500')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Toggle chat'));
    expect(document.querySelector('.bg-orange-500')).not.toBeInTheDocument();
  });

  it('closes when clicking outside the chat container (in-game)', () => {
    render(<SceneOverlay lobbyId="AAAA" config={chatConfig} />);
    fireEvent.click(screen.getByLabelText('Toggle chat'));
    expect(screen.getByPlaceholderText('Chat…')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByPlaceholderText('Chat…')).not.toBeInTheDocument();
  });

  it('toggles open and sends a message via the ↵ button (pre-game)', () => {
    const preGameState: LobbyState = { ...baseState, round: 0 };
    mockConnection(preGameState);
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, phase: 'lobby', round: 0 });

    render(<SceneOverlay lobbyId="AAAA" config={chatConfig} renderPreGame={() => null} />);

    fireEvent.click(screen.getByLabelText('Toggle chat'));
    const input = screen.getByPlaceholderText('Chat…');
    fireEvent.change(input, { target: { value: 'hi there' } });
    fireEvent.click(screen.getByText('↵'));

    expect(emit).toHaveBeenCalledWith('send_message', { lobby_id: 'AAAA', message: 'hi there' });
  });
});

describe('messages panel overflow', () => {
  class FakeResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe() { this.cb([], this as unknown as ResizeObserver); }
    unobserve() {}
    disconnect() {}
  }

  beforeEach(() => {
    // jsdom has no ResizeObserver at all; a minimal stub scoped to this
    // suite only, since nothing else needs it.
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    mockedUseGameEvents.mockReturnValue({
      round: 1,
      messages: [['A long message that would overflow the collapsed panel.']],
      events: [],
      instakill: false,
    });
  });

  it('shows "Show more" only when the message list overflows the collapsed height', () => {
    Object.defineProperty(HTMLUListElement.prototype, 'scrollHeight', { configurable: true, value: 500 });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.getByText('▼ Show more')).toBeInTheDocument();
  });

  it('does not show "Show more" when the content fits the collapsed height', () => {
    Object.defineProperty(HTMLUListElement.prototype, 'scrollHeight', { configurable: true, value: 10 });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.queryByText('▼ Show more')).not.toBeInTheDocument();
  });

  it('expands past the collapsed clamp and toggles to "Show less"', () => {
    Object.defineProperty(HTMLUListElement.prototype, 'scrollHeight', { configurable: true, value: 500 });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    const wrapper = screen.getByText(/A long message/).closest('ul')?.parentElement;
    expect(wrapper?.className).toContain('max-h-[4.5rem]');

    fireEvent.click(screen.getByText('▼ Show more'));
    expect(screen.getByText('▲ Show less')).toBeInTheDocument();
    expect(wrapper?.className).not.toContain('max-h-[4.5rem]');
  });

  it('hides the message body entirely via the Hide/Show toggle', () => {
    Object.defineProperty(HTMLUListElement.prototype, 'scrollHeight', { configurable: true, value: 10 });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.getByText(/A long message/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Hide'));
    expect(screen.queryByText(/A long message/)).not.toBeInTheDocument();
    expect(screen.getByText('Show')).toBeInTheDocument();
  });
});

describe('player list', () => {
  it('shows crown/skull/idle indicators, keeps spectators out of the player list, and highlights the local player', () => {
    localStorage.setItem('playerName', 'Alice');
    const dead: Player = { ...basePlayer, name: 'Bob', hp: 0 };
    const spectator: Player = { ...basePlayer, name: 'Carol', spectator: true };
    const idle: Player = { ...basePlayer, name: 'Dave', idle_rounds: 2 };
    mockConnection({ ...baseState, players: [basePlayer, dead, spectator, idle], winner: 'Alice' });

    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, showPlayerList: true }} />);

    expect(screen.getByText('👑')).toBeInTheDocument();
    expect(screen.getByText('☠️')).toBeInTheDocument();
    expect(screen.getByText('👻')).toBeInTheDocument();
    // Carol is a spectator: out of the Players list and its count, but no
    // longer dropped from the panel altogether -- she is under her own
    // heading below, so someone spectating can see they are in the lobby.
    expect(screen.getByText('Players (3)')).toBeInTheDocument();
    expect(screen.getByText('Spectator (1)')).toBeInTheDocument();
    const carol = screen.getByText('Carol').closest('li');
    expect(carol).toBeTruthy();
    expect(within(carol!).getByTitle('Spectator')).toBeInTheDocument();
    // "Alice" also appears in the separate player-nametag block; scope to
    // the player-list entry specifically (its <li> ancestor).
    const aliceEntries = screen.getAllByText('Alice');
    const listEntry = aliceEntries.find((el) => el.closest('li'));
    expect(listEntry).toHaveClass('text-blue-300');
  });

  it('says Spectators, plural, once there is more than one', () => {
    const carol: Player = { ...basePlayer, name: 'Carol', spectator: true };
    const erin: Player = { ...basePlayer, name: 'Erin', spectator: true };
    mockConnection({ ...baseState, players: [basePlayer, carol, erin] });

    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, showPlayerList: true }} />);

    expect(screen.getByText('Spectators (2)')).toBeInTheDocument();
  });

  it('shows no spectator heading when nobody is watching', () => {
    mockConnection({ ...baseState, players: [basePlayer] });
    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, showPlayerList: true }} />);
    expect(screen.queryByText(/^Spectator/)).not.toBeInTheDocument();
  });

  it('crowns the well-winner instead, only when there is no game winner yet', () => {
    mockConnection({ ...baseState, players: [basePlayer], winner: null, wellwinner: 'Alice' });
    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, showPlayerList: true }} />);
    expect(screen.getByText('👑')).toBeInTheDocument();
  });

  it('collapses to just the header/count on click, and expands again on a second click', () => {
    const bob: Player = { ...basePlayer, name: 'Bob' };
    mockConnection({ ...baseState, players: [basePlayer, bob] });
    render(<SceneOverlay lobbyId="AAAA" config={{ ...baseConfig, showPlayerList: true }} />);

    const header = screen.getByText('Players (2)');
    expect(screen.getByText('Bob')).toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.getByText('Players (2)')).toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});

describe('kicked mid-lobby', () => {
  it('shows a removed-from-lobby message once myPlayer disappears after having been present', () => {
    const { rerender } = render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.queryByText('You were removed from this lobby.')).not.toBeInTheDocument();

    // handle_kick_player is the only thing that removes an entry from
    // state.players outright -- simulate the resulting state_update by
    // having useLobbyGame's derived myPlayer disappear on a later render.
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, myPlayer: undefined });
    rerender(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);

    expect(screen.getByText('You were removed from this lobby.')).toBeInTheDocument();
    expect(screen.getByLabelText('Back to Home')).toBeInTheDocument();
  });

  it('does not show the removed message just because myPlayer has never been present yet', () => {
    // e.g. still connecting/joining -- must not be confused with kicked.
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, myPlayer: undefined });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.queryByText('You were removed from this lobby.')).not.toBeInTheDocument();
  });
});

describe('warn-blink cues', () => {
  it('shows the countdown while <=20s with no action-button warn class above 10s', () => {
    mockedUseRoundTimer.mockReturnValue(15);
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.getByText('15s')).toHaveClass('text-yellow-400');
    const well = screen.getByRole('button', { name: 'The Well' });
    expect(well).not.toHaveClass('warn-blink-gold');
    expect(well).not.toHaveClass('warn-blink-red');
  });

  it('turns the countdown red at <=10s while the action-button cue is still only gold (6-10s)', () => {
    // A real, easy-to-miss distinction: the countdown *number*'s own red
    // threshold (<=10s) doesn't match the action-button blink's red
    // threshold (<=5s) -- at 8s the number is already red but the
    // buttons are still gold, not red.
    mockedUseRoundTimer.mockReturnValue(8);
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.getByText('8s')).toHaveClass('text-red-500');
    const well = screen.getByRole('button', { name: 'The Well' });
    expect(well).toHaveClass('warn-blink-gold');
    expect(well).not.toHaveClass('warn-blink-red');
  });

  it('applies warn-blink-red to the action buttons at <=5s', () => {
    mockedUseRoundTimer.mockReturnValue(3);
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.getByText('3s')).toHaveClass('text-red-500');
    expect(screen.getByRole('button', { name: 'The Well' })).toHaveClass('warn-blink-red');
  });

  it('does not warn-blink once an action has already been chosen', () => {
    mockedUseRoundTimer.mockReturnValue(3);
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} externalAction="well" />);
    const well = screen.getByRole('button', { name: 'The Well' });
    expect(well).not.toHaveClass('warn-blink-red');
    expect(well).not.toHaveClass('warn-blink-gold');
  });

  it('hides the countdown once the game is over', () => {
    mockedUseRoundTimer.mockReturnValue(15);
    mockedUseLobbyGame.mockReturnValue({ ...baseLobbyGameResult, phase: 'gameover' });
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.queryByText('15s')).not.toBeInTheDocument();
  });

  it('hides the countdown once more than 20 seconds remain', () => {
    mockedUseRoundTimer.mockReturnValue(25);
    render(<SceneOverlay lobbyId="AAAA" config={baseConfig} />);
    expect(screen.queryByText('25s')).not.toBeInTheDocument();
  });
});
