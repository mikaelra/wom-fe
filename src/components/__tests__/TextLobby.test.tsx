import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LobbyState, Player } from '@/types/game';

const emit = vi.fn();
const conn: {
  state: LobbyState | null;
  status: string;
  onError?: (m: string) => void;
  onChat?: (m: { sender: string; message: string; timestamp: string }) => void;
} = { state: null, status: 'connected' };
const events: { value: { round: number; messages: (string | string[])[]; events: unknown[]; instakill: boolean } | null } = { value: null };

vi.mock('@/lib/socket', () => ({ getSocket: () => ({ emit }) }));
vi.mock('@/lib/useLobbyConnection', () => ({
  useLobbyConnection: (
    _l: string,
    _p: string,
    opts: { onError?: (m: string) => void; onChatMessage?: (m: { sender: string; message: string; timestamp: string }) => void },
  ) => {
    conn.onError = opts.onError;
    conn.onChat = opts.onChatMessage;
    return { state: conn.state, connectionStatus: conn.status };
  },
}));
vi.mock('@/lib/useGameEvents', () => ({ useGameEvents: () => events.value }));
vi.mock('@/lib/api', () => ({
  getPlayerRelics: vi.fn(async () => ({
    relics: [
      { id: 1, name: "Hades' Coin", count: 2, boss_id: 6, created_at: '', power_category: 'MONETARY', newest_copy_created_at: '' },
      { id: 9, name: 'Paper', count: 1, boss_id: null, created_at: '', power_category: 'X', newest_copy_created_at: '' },
    ],
  })),
}));
vi.mock('@/lib/music', () => ({ playMusic: vi.fn(), BATTLE_MUSIC: 'b', PRE_LOBBY_MUSIC: 'p' }));
vi.mock('@/components/audio/MusicToggleButton', () => ({ default: () => null }));
vi.mock('@/components/audio/SfxToggleButton', () => ({ default: () => null }));
vi.mock('@/components/WheelClaimNudge', () => ({ default: () => <div>wheel nudge</div> }));
vi.mock('@/components/BossSignupNudge', () => ({ default: () => <div>relic nudge</div> }));
vi.mock('@/components/ArtifactClaimNudge', () => ({ default: () => <div>artifact nudge</div> }));

import TextLobby from '@/components/text/TextLobby';
import { isUrgentScreenLoading, resetLoadingTracker } from '@/lib/loadingTracker';

function player(name: string, extra: Partial<Player> = {}): Player {
  return {
    name, hp: 10, coins: 1, attackDamage: 1, alive: true, admin: false, spectator: false, bot: false,
    boss: false, lost_soul: null, title: null, idle_rounds: 0, pending_relic_nudge: null, ...extra,
  };
}

function lobby(extra: Partial<LobbyState> = {}): LobbyState {
  return {
    round: 0, players: [player('Oni', { admin: true }), player('Toad')], winner: null, wellwinner: null,
    pending_deny: null, deny_target: null, readyPlayers: [], history: [], round_end_time: null,
    boss_fight: false, start_time: null, gameover: false, chat: [], ...extra,
  };
}

async function show(state: LobbyState, onLobbyGone = vi.fn()) {
  conn.state = state;
  await act(async () => {
    render(<TextLobby lobbyId="ABCD" playerName="Oni" onLobbyGone={onLobbyGone} />);
  });
  return onLobbyGone;
}

beforeEach(() => {
  localStorage.clear();
  conn.status = 'connected';
  resetLoadingTracker();
  events.value = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TextLobby', () => {
  it('lists the players, and lets the admin start, add bots and kick', async () => {
    await show(lobby({ readyPlayers: ['Toad'] }));
    expect(screen.getByText('Lobby ID: ABCD')).toBeTruthy();
    expect(screen.getByText('Toad')).toBeTruthy();
    expect(screen.getByText('✅')).toBeTruthy();
    fireEvent.click(screen.getByText('🚀 Start Game'));
    expect(emit).toHaveBeenCalledWith('start_game', { lobby_id: 'ABCD' });
    expect(screen.queryByText('Wolf')).toBeNull();
    fireEvent.click(screen.getByText('🤖 Add Bot'));
    fireEvent.click(screen.getByText('Wolf'));
    expect(emit).toHaveBeenCalledWith('add_dummy', { lobby_id: 'ABCD', bot_type: 'WOLF' });
    expect(screen.queryByText('Wolf')).toBeNull(); // closes once one is picked
    fireEvent.click(screen.getByText('🤖 Add Bot'));
    fireEvent.scroll(document);
    expect(screen.queryByText('Wolf')).toBeNull(); // and on any scroll
    expect(screen.getByLabelText('Back to Home').getAttribute('href')).toBe('/');
    expect(screen.getByLabelText('Go to the city')).toBeTruthy();
    expect(screen.getByText('Toad').closest('li')!.textContent!.endsWith('❌')).toBe(true); // kick on the right
    fireEvent.click(screen.getByTitle('Kick player'));
    expect(emit).toHaveBeenCalledWith('kick_player', { lobby_id: 'ABCD', target: 'Toad' });
  });

  it('lays each line out in columns: crown or skull, avatar, ready or away, then the name', async () => {
    await show(lobby({ readyPlayers: ['Wolf 1'], players: [player('Oni', { admin: true }), player('Wolf 1', { bot: true, bot_type: 'WOLF', hp: 0 })] }));
    const row = screen.getByText('Wolf 1').closest('li')!;
    expect(row.textContent).toBe('☠️🐺✅Wolf 1'); // dead, so no kick ❌
  });

  it("shows a player's equipped relics after their name before the game", async () => {
    await show(lobby({ players: [player('Oni', { admin: true }), player('Toad', { selected_relic_ids: [1] })] }));
    const row = (await screen.findByText('Toad')).closest('li')!;
    await act(async () => Promise.resolve());
    expect(row.textContent!.startsWith('Toad')).toBe(true);
    expect(row.textContent!.length).toBeGreaterThan('Toad❌'.length); // a relic badge after the name
  });

  it('waits for the game to start with counting dots, then shows the round', async () => {
    vi.useFakeTimers();
    try {
      conn.state = lobby();
      const { rerender } = render(<TextLobby lobbyId="ABCD" playerName="Oni" onLobbyGone={vi.fn()} />);
      const line = () => screen.getByText(/Waiting for game to start|Round:/).textContent;
      expect(line()).toBe('🌀 Waiting for game to start');
      act(() => vi.advanceTimersByTime(500));
      expect(line()).toBe('🌀 Waiting for game to start.');
      act(() => vi.advanceTimersByTime(1000));
      expect(line()).toBe('🌀 Waiting for game to start...');
      act(() => vi.advanceTimersByTime(500));
      expect(line()).toBe('🌀 Waiting for game to start');
      expect(screen.queryByText(/Your Name/)).toBeNull();
      conn.state = lobby({ round: 3 });
      rerender(<TextLobby lobbyId="ABCD" playerName="Oni" onLobbyGone={vi.fn()} />);
      expect(line()).toBe('🌀 Round: 3');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the round timer only once the game has started', async () => {
    const soon = new Date(Date.now() + 5000).toISOString();
    await show(lobby({ round: 0, round_end_time: soon, ai_ranked: true }));
    expect(screen.queryByText(/Time left/)).toBeNull(); // a bot-ranked lobby still forming
  });

  it('shows no lobby id while waiting for a ranked match, with players or bots', async () => {
    await show(lobby({ round: 0, ranked: true }));
    expect(screen.queryByText(/Lobby ID/)).toBeNull();
    await show(lobby({ round: 0, ai_ranked: true }));
    expect(screen.queryByText(/Lobby ID/)).toBeNull();
  });

  it('offers only the relics that do something in battle, folded away until opened', async () => {
    await show(lobby({ players: [player('Oni', { admin: true, selected_relic_ids: [1] }), player('Toad')] }));
    const heading = await screen.findByText(/Relics/);
    expect(screen.queryByText(/Start the game with 1 coin/)).toBeNull();
    expect(heading.textContent).toContain('🪙'); // what is picked shows while folded
    fireEvent.click(heading);
    const coin = screen.getByText(/Start the game with 1 coin/);
    expect(screen.queryByText(/Paper/)).toBeNull();
    fireEvent.click(coin);
    expect(emit).toHaveBeenCalledWith('toggle_relic_selection', { lobby_id: 'ABCD', relic_id: 1 });
  });

  it('folds the relics away again once scrolled out of sight', async () => {
    let report: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          report = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      await show(lobby());
      fireEvent.click(await screen.findByText(/Relics/));
      expect(screen.getByText(/Start the game with 1 coin/)).toBeTruthy();
      act(() => report?.([{ isIntersecting: false }]));
      expect(screen.queryByText(/Start the game with 1 coin/)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends the round choices over the socket, from the 3D game's buttons and bottom bar", async () => {
    await show(lobby({ round: 1 }));
    fireEvent.click(screen.getByText('💰 Get'));
    expect(emit).toHaveBeenCalledWith('submit_choice', { lobby_id: 'ABCD', resource: 'gain_coin', action: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Defend' }));
    expect(emit).toHaveBeenCalledWith('submit_choice', { lobby_id: 'ABCD', action: 'defend', resource: '' });
    emit.mockClear();
    // Attack sits beside each player you can attack: one tap attacks them.
    expect(screen.queryByRole('button', { name: 'Attack Oni' })).toBeNull(); // not yourself
    fireEvent.click(screen.getByRole('button', { name: 'Attack Toad' }));
    expect(emit).toHaveBeenCalledWith('submit_choice', { lobby_id: 'ABCD', action: 'attack', target: 'Toad', resource: '' });
    expect(screen.queryByText('🚀 Start Game')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'The Well' }));
    expect(emit).toHaveBeenCalledWith('submit_choice', { lobby_id: 'ABCD', action: 'well', resource: '' });
  });

  it('has no choices for a denied player, the bar showing but out of reach', async () => {
    await show(lobby({ round: 2, deny_target: 'Oni' }));
    expect(screen.queryByRole('button', { name: 'Attack Toad' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'The Well' })).toBeNull();
    expect((screen.getByText('💰 Get').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks the deny chooser for a target', async () => {
    await show(lobby({ round: 2, pending_deny: 'Oni' }));
    fireEvent.change(screen.getByLabelText('Select player'), { target: { value: 'Toad' } });
    fireEvent.click(screen.getByText('Deny'));
    expect(emit).toHaveBeenCalledWith('submit_deny_target', { lobby_id: 'ABCD', target: 'Toad' });
  });

  it("shows the round's messages", async () => {
    vi.useFakeTimers();
    try {
      events.value = { round: 1, messages: ['You hit Toad', ['for', '3']], events: [], instakill: false };
      conn.state = lobby({ round: 1 });
      render(<TextLobby lobbyId="ABCD" playerName="Oni" onLobbyGone={vi.fn()} />);
      expect(screen.getAllByText(/You hit Toad/).length).toBe(1); // floating
      act(() => vi.advanceTimersByTime(3400)); // shown 2.5 s, faded 0.8 s
      expect(screen.getByText('for 3')).toBeTruthy(); // listed
    } finally {
      vi.useRealTimers();
    }
  });

  it('lists every round, even when the same messages come twice or a new round comes mid-bubble', () => {
    vi.useFakeTimers();
    try {
      const view = (messages: string[], round: number) => {
        events.value = { round, messages, events: [], instakill: false };
        conn.state = lobby({ round });
      };
      view(['Round 1 news'], 1);
      const { rerender } = render(<TextLobby lobbyId="ABCD" playerName="Oni" onLobbyGone={vi.fn()} />);
      const again = () => rerender(<TextLobby lobbyId="ABCD" playerName="Oni" onLobbyGone={vi.fn()} />);
      view(['Round 1 news'], 1); // fetched again (a deny, or dev's double fetch)
      again();
      expect(screen.getAllByText('Round 1 news').length).toBe(1); // one bubble, not two
      act(() => vi.advanceTimersByTime(1000));
      view(['Round 2 news'], 2); // the next round, while the first bubble is still up
      again();
      act(() => vi.advanceTimersByTime(10_000));
      const list = screen.getByText('Round Messages').parentElement!;
      expect(list.className).toContain('opacity-100'); // not stuck hidden behind a bubble
      expect(screen.getByText('Round 2 news').tagName).toBe('LI');
      expect(document.querySelectorAll('.fixed.inset-0').length).toBe(0); // no bubble left over
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends the round messages to the list at once on a tap', async () => {
    events.value = { round: 1, messages: ['You hit Toad'], events: [], instakill: false };
    await show(lobby({ round: 1 }));
    fireEvent.click(screen.getByText('You hit Toad'));
    const listed = screen.getByText('You hit Toad');
    expect(listed.tagName).toBe('LI'); // the bubble is gone; the line is in the list
  });

  it('chats behind the 💬 button, which lights up for a message while closed', async () => {
    await show(lobby({ chat: [{ sender: 'Toad', message: 'hi', timestamp: '' }] }));
    expect(screen.queryByText('hi')).toBeNull();
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    act(() => conn.onChat?.({ sender: 'Toad', message: 'hi', timestamp: '' }));
    const button = screen.getByLabelText('Toggle chat');
    expect(button.parentElement!.querySelector('.bg-orange-500')).toBeTruthy(); // unread
    fireEvent.click(button);
    expect(button.parentElement!.querySelector('.bg-orange-500')).toBeNull();
    expect(screen.getByText('hi')).toBeTruthy();
    expect(scrolled).toHaveBeenCalled(); // the newest message in sight
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: ' gg ' } });
    fireEvent.click(screen.getByText('Send'));
    expect(emit).toHaveBeenCalledWith('send_message', { lobby_id: 'ABCD', message: 'gg' });
    fireEvent.click(screen.getByLabelText('Toggle chat'));
    expect(screen.queryByText('hi')).toBeNull();
  });

  it('ends with the winner and the prizes', async () => {
    await show(lobby({ round: 5, gameover: true, winner: 'Oni', players: [player('Oni', { pending_wheel_nudge: true })] }));
    expect(screen.getByText(/Oni has won the game/)).toBeTruthy();
    expect(screen.getByText('wheel nudge')).toBeTruthy();
  });

  it('shows the boss and its countdown', async () => {
    const start = new Date(Date.now() + 125_000).toISOString();
    await show(lobby({ boss_fight: true, start_time: start, players: [player('Oni'), player('Hades 👹', { boss: true, bot: true, hp: 40, title: 'Lord' })] }));
    expect(screen.getByText('HP: 40')).toBeTruthy();
    expect(screen.getAllByText('Hades').length).toBe(2); // boss box and player list, without its 👹
    expect(screen.getByText(/Boss-fight starts in 2m/)).toBeTruthy();
  });

  it('walks out of a lobby that is gone', async () => {
    const gone = await show(lobby());
    act(() => conn.onError?.('Lobby not found'));
    expect(gone).toHaveBeenCalled();
  });

  it('blurs the whole lobby under the loading animation while reconnecting', async () => {
    conn.status = 'disconnected';
    await show(lobby({ round: 2 }));
    expect(screen.getByRole('status', { name: 'Reconnecting' })).toBeTruthy();
    expect(isUrgentScreenLoading()).toBe(true); // shown over the lobby's NoLoadingOverlay
    const lobbyView = screen.getByText('Players in Lobby').closest('[aria-busy]')!;
    expect(lobbyView.getAttribute('aria-busy')).toBe('true');
    expect(lobbyView.className).toContain('blur');
    expect(screen.getByRole('button', { name: 'Attack Toad' })).toBeTruthy(); // still there, under the blur
    expect(screen.getByLabelText('Back to Home').closest('.blur-sm')).toBeNull(); // the way home stays sharp
    expect(screen.queryByText(/refresh/i)).toBeNull();
  });

  it('is sharp, with no loading, once connected', async () => {
    await show(lobby({ round: 2 }));
    expect(screen.queryByRole('status', { name: 'Reconnecting' })).toBeNull();
    expect(screen.getByText('Players in Lobby').closest('[aria-busy]')!.className).not.toContain('blur');
  });
});

describe('TextLobby title and PC layout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts the 8-bit title of the kind of match on top', async () => {
    await show(lobby());
    expect(screen.getByRole('img', { name: 'Private lobby' })).toBeTruthy();
    await show(lobby({ ranked: true }));
    expect(screen.getByRole('img', { name: 'Ranked' })).toBeTruthy();
    await show(lobby({ ai_ranked: true }));
    expect(screen.getByRole('img', { name: 'Bot Ranked' })).toBeTruthy();
  });

  it('lays a PC screen out in two columns with the chat docked, nothing to open', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    );
    await show(lobby({ round: 2 }));
    expect(screen.getByText('Players in Lobby')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Attack Toad' })).toBeTruthy();
    expect(screen.getByText('❤ Get')).toBeTruthy(); // the bottom bar
    expect(screen.getByText('Round Messages')).toBeTruthy();
    expect(screen.getByLabelText('Chat message')).toBeTruthy(); // docked, already open
    expect(screen.queryByLabelText('Toggle chat')).toBeNull();
    expect(document.querySelector('.h-dvh.overflow-hidden')).toBeTruthy(); // the window, never scrolled
  });

  it('keeps the one column and the chat button on a phone', async () => {
    await show(lobby({ round: 2 }));
    expect(screen.getByLabelText('Toggle chat')).toBeTruthy();
    expect(screen.queryByLabelText('Chat message')).toBeNull();
  });

  it('puts the round messages straight in the list on a PC, no bubble', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    );
    events.value = { round: 2, messages: ['Oni attacked Bot Turtle'], events: [], instakill: false };
    await show(lobby({ round: 2 }));
    expect(screen.getByText('Oni attacked Bot Turtle')).toBeTruthy();
    expect(screen.getByText('Round Messages').parentElement!.className).toContain('opacity-100');
  });

  it("shows every bot's HP before its name in a bossfight", async () => {
    await show(
      lobby({
        round: 1,
        boss_fight: true,
        players: [player('Oni', { admin: true }), player('Hades', { bot: true, boss: true, hp: 42 }), player('Wolf 1', { bot: true, hp: 7 })],
      }),
    );
    const hadesRow = screen.getAllByText('Hades').map((el) => el.closest('li')).find(Boolean)!;
    expect(hadesRow.textContent).toContain('❤ 42');
    expect(screen.getByText('Wolf 1').closest('li')!.textContent).toContain('❤ 7');
    expect(screen.getByText('Oni').closest('li')!.textContent).not.toContain('❤');
  });

  it('ends with the way home and to the city', async () => {
    await show(lobby({ round: 3, gameover: true, winner: 'Oni' }));
    const over = screen.getByText(/Game Over!/).parentElement!;
    expect(within(over).getByLabelText('Back to Home')).toBeTruthy();
    expect(within(over).getByLabelText('Go to the city')).toBeTruthy();
    expect(screen.queryByText(/← Back to Home/)).toBeNull();
  });

  it('leads back to the ranked signpost after a ranked game, the main one otherwise', async () => {
    const cityLink = () => screen.getAllByLabelText('Go to the city').at(-1)!.getAttribute('href');
    await show(lobby({ round: 3, ranked: true }));
    expect(cityLink()).toMatch(/board=ranked/);
    cleanup();
    await show(lobby({ round: 3, ai_ranked: true }));
    expect(cityLink()).toMatch(/board=ranked/);
    cleanup();
    await show(lobby({ round: 3 }));
    expect(cityLink()).not.toMatch(/board=ranked/);
  });


  it("shows the Well's info before each opponent's name in colour, greyed the next round, then gone", async () => {
    const players = [player('Oni', { admin: true }), player('Toad', { hp: 6, coins: 4, attackDamage: 2 })];
    events.value = {
      round: 2,
      messages: ['You won the well'],
      events: [{ kind: 'well_reward', components: [{ type: 'info', count: 1 }] }],
      instakill: false,
    };
    const { rerender } = render(<TextLobby lobbyId="ABCD" playerName="Oni" onLobbyGone={vi.fn()} />);
    conn.state = lobby({ round: 2, players });
    rerender(<TextLobby lobbyId="ABCD" playerName="Oni" onLobbyGone={vi.fn()} />);
    await act(async () => Promise.resolve());
    const row = () => screen.getAllByText('Toad').map((el) => el.closest('li')).find(Boolean)!;
    expect(row().textContent).toContain('❤ 6 💰 4 ⚔ 2');
    expect(within(row()).getByText('6').className).toContain('text-red-400');
    expect(screen.getAllByText('Oni').map((el) => el.closest('li')).find(Boolean)!.textContent).not.toContain('❤');

    // The next round: greyed, emojis too, less the 1 you hit them for since.
    events.value = {
      round: 3,
      messages: [],
      events: [{ kind: 'outgoing', target: 'Toad', outcome: 'hit', damage: 1, attackerDied: false, eliminated: false }],
      instakill: false,
    };
    conn.state = lobby({ round: 3, players });
    rerender(<TextLobby lobbyId="ABCD" playerName="Oni" onLobbyGone={vi.fn()} />);
    await act(async () => Promise.resolve());
    const stale = within(row()).getByText('5');
    expect(stale.className).toContain('text-gray-500');
    expect(stale.closest('[title="Last round"]')!.className).toContain('grayscale');

    conn.state = lobby({ round: 4, players });
    events.value = { round: 4, messages: [], events: [], instakill: false };
    rerender(<TextLobby lobbyId="ABCD" playerName="Oni" onLobbyGone={vi.fn()} />);
    await act(async () => Promise.resolve());
    expect(row().textContent).not.toContain('💰');
  });

  it('shows no lobby id in the bossfight', async () => {
    await show(lobby({ boss_fight: true }));
    expect(screen.queryByText(/Lobby ID/)).toBeNull();
  });

  it('frames each action in its colour, and fills the chosen one', async () => {
    await show(lobby({ round: 1 }));
    const well = screen.getByRole('button', { name: 'The Well' });
    expect(well.style.borderColor).not.toBe('transparent');
    expect(well.style.backgroundColor).toBe('transparent');
    fireEvent.click(well);
    expect(well.style.backgroundColor).not.toBe('transparent');
    expect(well.getAttribute('aria-pressed')).toBe('true');
  });

  it('blinks the choices still to make and says what is missing as time runs out', async () => {
    const soon = new Date(Date.now() + 8000).toISOString();
    await show(lobby({ round: 2, round_end_time: soon }));
    expect(screen.getByRole('button', { name: 'Defend' }).className).toContain('warn-blink-gold');
    expect(screen.getByText('You must choose an action: Attack someone, Well or Defend.')).toBeTruthy();
    expect(screen.getByText('You must choose a resource: Get HP, Get Coin or Upgrade Attack.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Defend' }));
    expect(screen.queryByText(/You must choose an action/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Defend' }).className).not.toContain('warn-blink');
  });

  it('puts the action warning at the top of the player list and the resource one under the resource buttons', async () => {
    await show(lobby({ round: 2, round_end_time: new Date(Date.now() + 8000).toISOString() }));
    const actionWarn = screen.getByText(/You must choose an action/);
    const list = screen.getByText('Players in Lobby').parentElement!.querySelector('ul')!;
    expect(actionWarn.parentElement).toBe(list.parentElement);
    expect(actionWarn.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const resourceWarn = screen.getByText(/You must choose a resource/);
    const hp = screen.getByText('HP');
    expect(hp.compareDocumentPosition(resourceWarn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('blinks red with 5 seconds left, and not at all with plenty of time', async () => {
    await show(lobby({ round: 2, round_end_time: new Date(Date.now() + 4000).toISOString() }));
    expect(screen.getByRole('button', { name: 'The Well' }).className).toContain('warn-blink-red');
    cleanup();
    await show(lobby({ round: 2, round_end_time: new Date(Date.now() + 60000).toISOString() }));
    expect(screen.getByRole('button', { name: 'The Well' }).className).not.toContain('warn-blink');
    expect(screen.queryByText(/You must choose/)).toBeNull();
  });

  it("shows the round's hits as red and blue numbers before the names", async () => {
    events.value = {
      round: 2,
      messages: ['You hit Toad'],
      events: [{ kind: 'outgoing', target: 'Toad', outcome: 'hit', damage: 3, attackerDied: false, eliminated: false }],
      instakill: false,
    };
    await show(lobby({ round: 2 }));
    const toad = screen.getAllByText('Toad').map((el) => el.closest('li')).find(Boolean)!;
    expect(within(toad).getByText('-3').style.color).toBe('rgb(239, 68, 68)');
  });

  it('passes through several hits on a player, a second each, then clears', async () => {
    vi.useFakeTimers();
    try {
      events.value = {
        round: 2,
        messages: [],
        events: [
          { kind: 'incoming', attacker: 'Toad', outcome: 'hit', damage: 2, attackerDied: false },
          { kind: 'incoming', attacker: 'Wolf', outcome: 'blocked', attackerDied: false },
        ],
        instakill: false,
      };
      await show(lobby({ round: 2 }));
      const oni = () => screen.getAllByText('Oni').map((el) => el.closest('li')).find(Boolean)!;
      expect(within(oni()).getByText('-2')).toBeTruthy();
      expect(within(oni()).queryByText('0')).toBeNull();
      act(() => vi.advanceTimersByTime(1000));
      expect(within(oni()).getByText('0')).toBeTruthy();
      expect(within(oni()).queryByText('-2')).toBeNull();
      act(() => vi.advanceTimersByTime(1000));
      expect(within(oni()).queryByText('0')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts a chat bubble by the name of whoever just said something', async () => {
    await show(
      lobby({ round: 1, chat: [{ sender: 'Toad', message: 'gg', timestamp: new Date().toISOString() }] as LobbyState['chat'] }),
    );
    const toad = screen.getAllByText('Toad').map((el) => el.closest('li')).find(Boolean)!;
    expect(within(toad).getByText('gg')).toBeTruthy();
  });

  it('keeps a place for the info and the ready mark on every line on a PC', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    );
    await show(lobby({ round: 1, readyPlayers: ['Toad'] }));
    const oni = screen.getAllByText('Oni').map((el) => el.closest('li')).find(Boolean)!;
    expect(oni.querySelector('.w-36')).toBeTruthy(); // info / hits, empty
    const frame = oni.querySelector(':scope > .border-black')!; // the player's frame
    expect(frame.querySelectorAll(':scope > .w-6')).toHaveLength(3); // crown/skull, avatar, ready/away
    expect(frame.textContent).toContain('Oni'); // the name inside it
    expect(frame.querySelectorAll(':scope > .w-36')).toHaveLength(2); // the info column, and as much after the name
  });

  it('shows an away player with a ghost in the ready column', async () => {
    await show(lobby({ round: 2, players: [player('Oni', { admin: true }), player('Toad', { idle_rounds: 2 })] }));
    const toad = screen.getAllByText('Toad').map((el) => el.closest('li')).find(Boolean)!;
    expect(toad.textContent).toContain('👻');
  });

  it("puts Attack inside the player's frame, with the bubble and kick outside", async () => {
    await show(
      lobby({ round: 2, chat: [{ sender: 'Toad', message: 'gg', timestamp: new Date().toISOString() }] as LobbyState['chat'] }),
    );
    const toad = screen.getAllByText('Toad').map((el) => el.closest('li')).find(Boolean)!;
    expect(within(toad).getByRole('button', { name: 'Attack Toad' }).closest('.border-black')).toBeTruthy();
    expect(within(toad).getByText('gg').closest('.border-black')).toBeNull();
  });


  it('on a phone shows the hits small over the name, with no column for them', async () => {
    events.value = {
      round: 2,
      messages: [],
      events: [{ kind: 'outgoing', target: 'Toad', outcome: 'hit', damage: 4, attackerDied: false, eliminated: false }],
      instakill: false,
    };
    await show(lobby({ round: 2 }));
    const toad = screen.getAllByText('Toad').map((el) => el.closest('li')).find(Boolean)!;
    const frame = toad.querySelector(':scope > .border-black') as HTMLElement;
    expect(frame.querySelector('.w-36, .w-24')).toBeNull(); // no column for it
    const hitLine = within(frame).getByText('-4').closest('.leading-none')!;
    expect(hitLine.nextElementSibling?.textContent).toBe('Toad'); // right over the name
  });

  it('shows the rank outcome, and never says "You lost", when someone else wins', async () => {
    await show(
      lobby({
        round: 5,
        gameover: true,
        winner: 'Toad',
        ranked: true,
        ranked_results: { Oni: { tier_before: 'Wizard I', tier_after: 'Wizard I', promoted: null, games_at_tier: 3 } },
      }),
    );
    expect(screen.queryByText(/You lost/)).toBeNull();
    expect(screen.getByText('Same rank')).toBeTruthy();
    expect(screen.getByText('3 games at Wizard I')).toBeTruthy();
  });
});

