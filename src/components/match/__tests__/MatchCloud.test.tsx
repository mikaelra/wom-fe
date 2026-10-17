import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/Toast';
import RankedQueueProvider from '@/components/match/RankedQueueProvider';
import MatchCloud from '@/components/match/MatchCloud';
import { getActiveBotRankedLobby, getActiveRankedLobby, getBossfightRoster } from '@/lib/api';
import { rememberBotQueue, rememberSeat, writeQueue, STILL_QUEUING_AFTER_MS } from '@/lib/matchCloud';
import { setStoredAccountToken } from '@/lib/http';

let pathname = '/';
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

vi.mock('@/lib/api', () => ({
  getActiveRankedLobby: vi.fn(),
  joinRankedQueue: vi.fn().mockResolvedValue({ status: 'queued' }),
  leaveRankedQueue: vi.fn().mockResolvedValue({ status: 'left', was_queued: true }),
  renewRankedQueue: vi.fn().mockResolvedValue({ status: 'renewed' }),
  rankedCredentials: (name: string) => ({ ticket: `ticket-for-${name}` }),
  getBossfightRoster: vi.fn(),
  getActiveBotRankedLobby: vi.fn(),
}));

vi.mock('@/lib/matchNotice', () => ({ notifyRankedStarted: vi.fn() }));

vi.mock('@/lib/socket', () => ({
  getSocket: () => ({ emit: vi.fn() }),
  subscribe: () => () => undefined,
  subscribeConnect: () => () => undefined,
}));

const noMatch = { lobby_id: null, token: null, ranked_countdown_deadline: null, started: false };
const found = {
  lobby_id: 'RNKD',
  token: null,
  ranked_countdown_deadline: null,
  started: false,
  players: ['Bob', 'Cid'],
  player_count: 3,
  max_players: 6,
};

function renderCloud() {
  return render(
    <ToastProvider>
      <RankedQueueProvider>
        <MatchCloud />
      </RankedQueueProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  pathname = '/';
  push.mockReset();
  localStorage.clear();
  localStorage.setItem('playerName', 'Alice');
  // Skip Blimkin's entrance: the cloud is there at once.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
  vi.mocked(getActiveRankedLobby).mockReset().mockResolvedValue(noMatch);
  vi.mocked(getBossfightRoster).mockReset().mockResolvedValue({ lobby_id: null, round: 0, start_time: null, players: [] });
  vi.mocked(getActiveBotRankedLobby).mockReset().mockResolvedValue({
    lobby_id: null, token: null, ai_ranked_countdown_deadline: null, started: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MatchCloud', () => {
  it('shows nothing with nothing on', async () => {
    renderCloud();
    await act(async () => undefined);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('tells a matched player who they are up against, then the countdown and X/6 on a tap', async () => {
    vi.mocked(getActiveRankedLobby).mockResolvedValue(found);
    renderCloud();

    expect(await screen.findByText('You are currently in a lobby.')).toBeInTheDocument();
    expect(screen.getByText('Against: Bob, Cid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /currently in a lobby/ }));
    expect(screen.getByText('Starting soon')).toBeInTheDocument();
    expect(screen.getByText('3/6')).toBeInTheDocument();
  });

  it('goes into the lobby before it starts with Join Lobby', async () => {
    vi.mocked(getActiveRankedLobby).mockImplementation(async (_name, opts) =>
      opts?.peek ? found : { ...found, token: 'tok-early' },
    );
    renderCloud();

    await screen.findByText('You are currently in a lobby.');
    fireEvent.click(screen.getByText('Join Lobby'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lobby?id=RNKD'));
  });

  it('says the game has started and joins it on Join Game', async () => {
    vi.mocked(getActiveRankedLobby).mockImplementation(async (_name, opts) =>
      opts?.peek ? { ...found, started: true } : { ...found, started: true, token: 'tok-go' },
    );
    renderCloud();

    expect(await screen.findByText('Game started.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Join Game'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lobby?id=RNKD'));
  });

  it('stays away in the city, where the signpost says it', async () => {
    pathname = '/city';
    vi.mocked(getActiveRankedLobby).mockResolvedValue(found);
    renderCloud();
    await act(async () => undefined);
    await act(async () => undefined);
    expect(screen.queryByText('You are currently in a lobby.')).toBeNull();
  });

  it('asks after 30 minutes in the queue, and leaves it on No', async () => {
    const long = Date.now() - STILL_QUEUING_AFTER_MS - 1000;
    writeQueue({ name: 'Alice', queuedAt: long, heardAt: Date.now(), askedAt: Date.now() });
    renderCloud();

    expect(await screen.findByText('Do you still want to be in the queue?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Do not ask me again'));
    fireEvent.click(screen.getByText('No'));

    await waitFor(() => expect(screen.queryByText('Do you still want to be in the queue?')).toBeNull());
    expect(localStorage.getItem('wom.rankedQueue.dontAsk')).toBe('true');
    expect(localStorage.getItem('wom.rankedQueue')).toBeNull();
  });

  it('gives a Join Lobby cloud when a bossfight you sat in starts while you are away', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    rememberSeat('bossfight', 'BOSS1');
    vi.mocked(getBossfightRoster).mockResolvedValue({
      lobby_id: 'BOSS1',
      round: 1,
      start_time: null,
      players: [{ name: 'Alice', skin: null, alive: true, spectator: false, bot: false }],
    });
    renderCloud();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText('Bossfight started.')).toBeInTheDocument();
    expect(localStorage.getItem('wom.seatedLobby')).toBeNull();

    fireEvent.click(screen.getByText('Join Lobby'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lobby?id=BOSS1'));
  });

  it('keeps the bossfight cloud up until the cross closes it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    rememberSeat('bossfight', 'BOSS1');
    vi.mocked(getBossfightRoster).mockResolvedValue({
      lobby_id: 'BOSS1',
      round: 1,
      start_time: null,
      players: [{ name: 'Alice', skin: null, alive: true, spectator: false, bot: false }],
    });
    renderCloud();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText('Bossfight started.')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText('Bossfight started.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Bossfight started.')).toBeNull();
  });

  it('closes the ranked cloud with the cross, and brings it back when the game starts', async () => {
    let started = false;
    vi.mocked(getActiveRankedLobby).mockImplementation(async () => ({ ...found, started }));
    renderCloud();

    expect(await screen.findByText('You are currently in a lobby.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('You are currently in a lobby.')).toBeNull();

    started = true;
    expect(await screen.findByText('Game started.', {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it('says nothing if the player is on that lobby page when it starts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pathname = '/lobby';
    window.history.pushState({}, '', '/lobby?id=BOSS1');
    rememberSeat('bossfight', 'BOSS1');
    vi.mocked(getBossfightRoster).mockResolvedValue({
      lobby_id: 'BOSS1',
      round: 1,
      start_time: null,
      players: [{ name: 'Alice', skin: null, alive: true, spectator: false, bot: false }],
    });
    renderCloud();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.queryByText('Bossfight started.')).toBeNull();
    expect(localStorage.getItem('wom.seatedLobby')).toBeNull();
    window.history.pushState({}, '', '/');
  });

  it('finds a bot-ranked match made while the player was off in the market, and says when it starts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pathname = '/market';
    setStoredAccountToken('acct');
    rememberBotQueue();
    let started = false;
    vi.mocked(getActiveBotRankedLobby).mockImplementation(async () => ({
      lobby_id: 'AIQ2', token: null, ai_ranked_countdown_deadline: null, started,
    }));
    renderCloud();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(localStorage.getItem('wom.botRankedQueue')).toBeNull();
    expect(JSON.parse(localStorage.getItem('wom.seatedLobby')!).lobbyId).toBe('AIQ2');
    expect(screen.queryByText('Bot ranked game started.')).toBeNull();

    started = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText('Bot ranked game started.')).toBeInTheDocument();
  });

  it('comes up over the text field being typed in, above any open window', async () => {
    vi.mocked(getActiveRankedLobby).mockResolvedValue(found);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.getBoundingClientRect = () => ({ left: 40, top: 500 }) as DOMRect;
    input.focus();
    renderCloud();

    const cloud = await screen.findByText('You are currently in a lobby.');
    const stand = cloud.closest('.fixed') as HTMLElement;
    expect(stand.className).toContain('z-[100]');
    expect(stand.style.left).toBe('40px');
    expect(stand.style.bottom).toBe(`${window.innerHeight - 500 + 8}px`);
    input.remove();
  });

  it('announces a bot-ranked start the same way, minting the token only on Join Lobby', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setStoredAccountToken('acct');
    rememberSeat('bot_ranked', 'AIQ1');
    vi.mocked(getActiveBotRankedLobby).mockImplementation(async (_t, opts) => ({
      lobby_id: 'AIQ1',
      token: opts?.peek ? null : 'tok-bot',
      ai_ranked_countdown_deadline: null,
      started: true,
    }));
    renderCloud();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText('Bot ranked game started.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Join Lobby'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lobby?id=AIQ1'));
  });
});
