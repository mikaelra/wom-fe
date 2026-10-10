import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { LobbyState, Player } from '@/types/game';

const emit = vi.fn();
const conn: { state: LobbyState | null; status: string; onError?: (m: string) => void } = { state: null, status: 'connected' };
const events: { value: { round: number; messages: (string | string[])[]; events: []; instakill: boolean } | null } = { value: null };

vi.mock('@/lib/socket', () => ({ getSocket: () => ({ emit }) }));
vi.mock('@/lib/useLobbyConnection', () => ({
  useLobbyConnection: (_l: string, _p: string, opts: { onError?: (m: string) => void }) => {
    conn.onError = opts.onError;
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

  it('puts every mark in front of the name, the bot emoji or skin right before it', async () => {
    await show(lobby({ readyPlayers: ['Wolf 1'], players: [player('Oni', { admin: true }), player('Wolf 1', { bot: true, bot_type: 'WOLF', hp: 0 })] }));
    const row = screen.getByText('Wolf 1').closest('li')!;
    expect(row.textContent).toBe('☠️✅🐺Wolf 1'); // dead, so no kick ❌
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

  it('sends the round choices over the socket', async () => {
    await show(lobby({ round: 1 }));
    fireEvent.click(screen.getByText('Get 💰'));
    expect(emit).toHaveBeenCalledWith('submit_choice', { lobby_id: 'ABCD', resource: 'gain_coin', action: '' });
    fireEvent.click(screen.getByText('DEFEND'));
    expect(emit).toHaveBeenCalledWith('submit_choice', { lobby_id: 'ABCD', action: 'defend', resource: '' });
    emit.mockClear();
    fireEvent.click(screen.getByText('ATTACK'));
    expect(emit).not.toHaveBeenCalled(); // waits for a target
    fireEvent.change(screen.getByLabelText('Select target'), { target: { value: 'Toad' } });
    expect(emit).toHaveBeenCalledWith('submit_choice', { lobby_id: 'ABCD', action: 'attack', target: 'Toad', resource: '' });
    expect(screen.queryByText('🚀 Start Game')).toBeNull();
  });

  it('has no choices for a denied player', async () => {
    await show(lobby({ round: 2, deny_target: 'Oni' }));
    expect(screen.queryByText('Choose Action')).toBeNull();
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

  it('chats behind the Chat link', async () => {
    await show(lobby({ chat: [{ sender: 'Toad', message: 'hi', timestamp: '' }] }));
    expect(screen.queryByText('hi')).toBeNull();
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    fireEvent.click(screen.getByText('Chat'));
    expect(screen.getByText('hi')).toBeTruthy();
    expect(scrolled).toHaveBeenCalled(); // the newest message in sight
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: ' gg ' } });
    fireEvent.click(screen.getByText('Send'));
    expect(emit).toHaveBeenCalledWith('send_message', { lobby_id: 'ABCD', message: 'gg' });
    fireEvent.click(screen.getByText('Chat'));
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

  it('walks out of a lobby that is gone, and says when the connection is lost', async () => {
    const gone = await show(lobby());
    act(() => conn.onError?.('Lobby not found'));
    expect(gone).toHaveBeenCalled();
    conn.status = 'disconnected';
    await show(lobby());
    expect(screen.getByText('Connection lost. Please refresh.')).toBeTruthy();
  });
});
