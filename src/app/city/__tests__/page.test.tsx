import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import CityPage from '@/app/city/page';
import {
  checkName, logInUser, verifyLoginCode, getBossfightLobby, getNextBossfightTime,
  getActiveRankedLobby, joinRankedQueue, leaveRankedQueue,
} from '@/lib/api';
import { ToastProvider } from '@/components/Toast';
import * as socketModule from '@/lib/socket';

const push = vi.fn();
let searchId: string | null = 'athens';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (k: string) => (k === 'id' ? searchId : null) }),
}));

vi.mock('@/lib/api', () => ({
  checkName: vi.fn(),
  logInUser: vi.fn(),
  verifyLoginCode: vi.fn(),
  getBossfightLobby: vi.fn(),
  getNextBossfightTime: vi.fn(),
  getActiveRankedLobby: vi.fn(),
  joinRankedQueue: vi.fn(),
  leaveRankedQueue: vi.fn(),
}));

// Same fake-subscribe pattern the world-map tests used before ranked moved
// here -- useRankedQueue talks to the socket directly for
// join_ranked_queue / ranked_match_found.
vi.mock('@/lib/socket', () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emit = vi.fn();
  return {
    getSocket: () => ({ emit }),
    subscribe: (event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => listeners.get(event)?.delete(handler);
    },
    __fireSubscribeEvent: (event: string, payload: unknown) => {
      listeners.get(event)?.forEach((h) => h(payload));
    },
    __emit: emit,
    __reset: () => { listeners.clear(); emit.mockClear(); },
  };
});

const socket = socketModule as unknown as {
  __fireSubscribeEvent: (event: string, payload: unknown) => void;
  __emit: ReturnType<typeof vi.fn>;
  __reset: () => void;
};

// R3F's real Canvas needs a WebGL context jsdom cannot provide; render
// children directly, same approach as app/__tests__/page.test.tsx.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

// Stand in for the 3D scene and capture what the page hands it, so the
// signpost/Temple interaction can be driven without R3F -- the same trick
// the world-map tests use on <WorldMap>. R3F scene components are not unit
// tested in this repo (vitest.config.ts), so this is the seam.
let bossfightHandler: (() => void) | undefined;
let rankedHandler: (() => void) | undefined;
let lastSublabel: string | null | undefined;
let lastRankedLabel: string | undefined;
let lastRankedSublabel: string | null | undefined;
let readyHandler: (() => void) | undefined;
let backHandler: (() => void) | undefined;
vi.mock('@/components/city/CityScene', () => ({
  default: ({
    onBossfight, bossfightSublabel, onRanked, rankedLabel, rankedSublabel,
    onBackToEarth, onReady,
  }: {
    onBossfight: () => void; bossfightSublabel?: string | null;
    onRanked: () => void; rankedLabel: string; rankedSublabel?: string | null;
    onBackToEarth: () => void;
    onReady?: () => void;
  }) => {
    bossfightHandler = onBossfight;
    lastSublabel = bossfightSublabel;
    rankedHandler = onRanked;
    lastRankedLabel = rankedLabel;
    lastRankedSublabel = rankedSublabel;
    // The real scene fires this from a useFrame once its models have
    // resolved AND the canvas has drawn; here the test decides when.
    readyHandler = onReady;
    backHandler = onBackToEarth;
    return <div data-testid="city-scene" />;
  },
  CITY_CAMERA: [0, 5, 0.01],
  CITY_FOV: 70,
}));

const mockedCheckName = vi.mocked(checkName);
const mockedLogInUser = vi.mocked(logInUser);
const mockedVerifyLoginCode = vi.mocked(verifyLoginCode);
const mockedGetBossfightLobby = vi.mocked(getBossfightLobby);
const mockedGetNextBossfightTime = vi.mocked(getNextBossfightTime);
const mockedGetActiveRankedLobby = vi.mocked(getActiveRankedLobby);
const mockedJoinRankedQueue = vi.mocked(joinRankedQueue);
const mockedLeaveRankedQueue = vi.mocked(leaveRankedQueue);

const flush = () => act(async () => Promise.resolve());

// The gate popup's own "Log in" button (email step) and the shared top bar's
// "Log in" button (rendered whenever logged out) have the same accessible
// name, so queries that touch the popup must be scoped to it. The world
// map's tests carry the identical note -- the collision arrived here when
// the city adopted the same top bar (locked decision 4).
const gate = (title: string) =>
  screen.getByText(title).closest('.bg-gray-900') as HTMLElement;
const renderCity = () => render(<ToastProvider><CityPage /></ToastProvider>);
// CityScene arrives through next/dynamic, so it is not mounted synchronously.
const waitForScene = () => waitFor(() => expect(bossfightHandler).toBeDefined());
const clickBossfight = async () => {
  await waitForScene();
  await act(async () => { bossfightHandler!(); await flush(); });
};
const clickRanked = async () => {
  await waitForScene();
  await act(async () => { rankedHandler!(); await flush(); });
};

beforeEach(() => {
  push.mockClear();
  searchId = 'athens';
  bossfightHandler = undefined;
  rankedHandler = undefined;
  lastSublabel = undefined;
  lastRankedLabel = undefined;
  lastRankedSublabel = undefined;
  readyHandler = undefined;
  backHandler = undefined;
  socket.__reset();
  mockedCheckName.mockReset();
  mockedLogInUser.mockReset();
  mockedVerifyLoginCode.mockReset();
  mockedGetBossfightLobby.mockReset();
  mockedGetNextBossfightTime.mockReset();
  mockedGetNextBossfightTime.mockResolvedValue({ start_time: '2099-01-01T00:00:00Z' });
  mockedGetActiveRankedLobby.mockReset();
  // useEnterRanked checks for an existing match on mount whenever a name is
  // stored, so every test with a logged-in player hits this. Default to
  // "no active match" -- a bare mockReset() returns undefined and the hook's
  // .then() would throw.
  mockedGetActiveRankedLobby.mockResolvedValue({
    lobby_id: null, token: null, ranked_countdown_deadline: null, started: false,
  });
  mockedJoinRankedQueue.mockReset();
  mockedLeaveRankedQueue.mockReset();
  localStorage.clear();
});

describe('CityPage (routing)', () => {
  it('renders the city named by ?id=', async () => {
    renderCity();
    expect(await screen.findByText('Athens')).toBeInTheDocument();
    expect(screen.getByText(/Marble Columns/)).toBeInTheDocument();
  });

  it('accepts the numeric id form too', async () => {
    searchId = '3';
    renderCity();
    expect(await screen.findByText('Athens')).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown city rather than guessing', () => {
    searchId = 'atlantis';
    renderCity();
    expect(screen.getByText('No such city.')).toBeInTheDocument();
    expect(screen.queryByTestId('city-scene')).not.toBeInTheDocument();
  });

  it('goes back to the world map from the signpost, not from a button', async () => {
    // The way out moved out of the DOM entirely: it is a sign hanging under
    // the Bossfight arm, so leaving the city is a thing in the world rather
    // than a chip floating over it.
    renderCity();
    await waitFor(() => expect(backHandler).toBeDefined());
    act(() => { backHandler!(); });
    expect(push).toHaveBeenCalledWith('/');
  });

  it('has no floating back button left over', async () => {
    renderCity();
    await waitForScene();
    expect(screen.queryByLabelText('Back to Earth')).not.toBeInTheDocument();
  });
});

describe('CityPage (loading curtain)', () => {
  it('covers the scene until it reports itself ready', async () => {
    renderCity();
    await waitForScene();
    // temple.glb, the Senate, the mountain and the Milky Way texture all
    // load behind a Suspense that used to fall back to null -- i.e. to an
    // empty dark screen with no sign that anything was coming.
    expect(screen.getByText('ENTERING')).toBeInTheDocument();
    expect(screen.getByText('GREECE')).toBeInTheDocument();
  });

  it('lifts once the scene signals it is on screen', async () => {
    renderCity();
    await waitFor(() => expect(readyHandler).toBeDefined());
    expect(screen.getByText('ENTERING')).toBeInTheDocument();

    // The real scene calls this from a useFrame, two drawn frames after its
    // models resolve -- Suspense resolving only means they are parsed.
    act(() => { readyHandler!(); });

    // It fades before it unmounts, so this is not synchronous.
    await waitFor(() => expect(screen.queryByText('ENTERING')).not.toBeInTheDocument());
  });

  // The 20s "the scene never reported" fallback is deliberately NOT tested
  // here: driving it needs fake timers installed before render, and this
  // file's dynamic import and waitFor polling both need real ones. Faking
  // them mid-test does not work either, since the timeout is already
  // scheduled against the real clock by then.
});

// These behaviours moved here wholesale from the world map's Athens sword
// (docs/CITY_SCENE_PLAN.md §4.4 / step 6). Kept test-for-test so the move
// cannot quietly drop one.
describe('CityPage (entering the bossfight)', () => {
  it('opens the name gate when logged out, without calling checkName yet', async () => {
    renderCity();
    await clickBossfight();
    expect(screen.getByText('Enter the Hades Bossfight')).toBeInTheDocument();
    expect(mockedCheckName).not.toHaveBeenCalled();
  });

  it('enters the bossfight directly, skipping the gate, when already logged in', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'AAAA', start_time: '2026-01-01T00:00:00Z' });
    renderCity();

    await clickBossfight();

    expect(mockedCheckName).not.toHaveBeenCalled();
    expect(screen.queryByText('Enter the Hades Bossfight')).not.toBeInTheDocument();
    expect(mockedGetBossfightLobby).toHaveBeenCalledWith('Alice');
    expect(push).toHaveBeenCalledWith('/lobby?id=AAAA');
  });

  it('enters the bossfight for an unclaimed name, writing localStorage with no email', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'BBBB', start_time: '2026-01-01T00:00:00Z' });
    renderCity();

    await clickBossfight();
    fireEvent.change(screen.getByPlaceholderText('Your battle name'), { target: { value: 'Alice' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter Bossfight')); await flush(); });

    expect(mockedCheckName).toHaveBeenCalledWith('Alice');
    expect(mockedGetBossfightLobby).toHaveBeenCalledWith('Alice');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(localStorage.getItem('playerEmail')).toBeNull();
    expect(push).toHaveBeenCalledWith('/lobby?id=BBBB');
  });

  it('shows the email step for a claimed name, and enters the bossfight on login', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: false });
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'CCCC', start_time: '2026-01-01T00:00:00Z' });
    renderCity();

    await clickBossfight();
    fireEvent.change(screen.getByPlaceholderText('Your battle name'), { target: { value: 'Alice' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter Bossfight')); await flush(); });

    expect(screen.getByPlaceholderText('email')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'a@b.co' } });
    await act(async () => {
      fireEvent.click(within(gate('Enter the Hades Bossfight')).getByText('Log in'));
      await flush();
    });

    expect(mockedLogInUser).toHaveBeenCalledWith('Alice', 'a@b.co');
    expect(localStorage.getItem('playerEmail')).toBe('a@b.co');
    expect(push).toHaveBeenCalledWith('/lobby?id=CCCC');
  });

  it('shows the code step when requires_code is true, and completes on a correct code', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: true });
    mockedVerifyLoginCode.mockResolvedValue({ success: true });
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'DDDD', start_time: '2026-01-01T00:00:00Z' });
    renderCity();

    await clickBossfight();
    fireEvent.change(screen.getByPlaceholderText('Your battle name'), { target: { value: 'Alice' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter Bossfight')); await flush(); });
    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'a@b.co' } });
    await act(async () => {
      fireEvent.click(within(gate('Enter the Hades Bossfight')).getByText('Log in'));
      await flush();
    });

    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    await act(async () => { fireEvent.click(screen.getByText('Verify')); await flush(); });

    expect(mockedVerifyLoginCode).toHaveBeenCalledWith('Alice', '123456');
    expect(push).toHaveBeenCalledWith('/lobby?id=DDDD');
  });

  it('surfaces a toast and clears the loading overlay when entering the bossfight fails', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedGetBossfightLobby.mockRejectedValue(new Error('Bossfight is full'));
    renderCity();

    await clickBossfight();

    expect(await screen.findByText('Bossfight is full')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('/lobby'));
  });
});

describe('CityPage (bossfight countdown)', () => {
  it('starts with no sublabel, before the schedule has been fetched', async () => {
    renderCity();
    await waitForScene();
    // useBossfightCountdown reports null until its first interval tick, and
    // the arm must render nothing rather than a placeholder in that window.
    expect(lastSublabel).toBeNull();
  });

  it('passes a formatted countdown down to the signpost arm', async () => {
    mockedGetNextBossfightTime.mockResolvedValue({
      start_time: new Date(Date.now() + 125_000).toISOString(),
    });
    renderCity();
    await waitForScene();
    // The hook only publishes a value from inside its 1s interval, so the
    // default 1000ms waitFor window is a coin flip -- wait past two ticks.
    await waitFor(() => expect(lastSublabel).toMatch(/^BOSSFIGHT IN \d+:\d{2}$/), { timeout: 3000 });
  });

  it('reads IN PROGRESS once the countdown reaches zero', async () => {
    mockedGetNextBossfightTime.mockResolvedValue({
      start_time: new Date(Date.now() - 5_000).toISOString(),
    });
    renderCity();
    await waitForScene();
    await waitFor(() => expect(lastSublabel).toBe('IN PROGRESS'), { timeout: 3000 });
  });
});

// Ported from app/__tests__/page.test.tsx, where these hung off the New York
// sword (docs/CITY_SCENE_PLAN.md step 7). Assertions moved from an internal
// status field to the copy the arm actually shows, which is what a player
// sees and therefore the better thing to pin.
describe('CityPage (ranked)', () => {
  it('shows RANKED with nothing under it when idle', async () => {
    renderCity();
    await waitForScene();
    expect(lastRankedLabel).toBe('RANKED');
    expect(lastRankedSublabel).toBeNull();
  });

  it('opens the gate when logged out, then queues for an unclaimed name', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    mockedJoinRankedQueue.mockResolvedValue({ status: 'queued' });
    renderCity();

    await clickRanked();
    expect(screen.getByText('Play Ranked')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Your battle name'), { target: { value: 'Alice' } });
    await act(async () => { fireEvent.click(screen.getByText('Continue')); await flush(); });

    expect(mockedCheckName).toHaveBeenCalledWith('Alice');
    expect(socket.__emit).toHaveBeenCalledWith('join_ranked_queue', { name: 'Alice' });
    expect(mockedJoinRankedQueue).toHaveBeenCalledWith('Alice');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(screen.queryByText('Play Ranked')).not.toBeInTheDocument();
    expect(lastRankedSublabel).toMatch(/^SEARCHING/);
  });

  it('queues directly when already logged in', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedJoinRankedQueue.mockResolvedValue({ status: 'queued' });
    renderCity();

    await clickRanked();

    expect(mockedCheckName).not.toHaveBeenCalled();
    expect(socket.__emit).toHaveBeenCalledWith('join_ranked_queue', { name: 'Alice' });
    expect(lastRankedSublabel).toMatch(/^SEARCHING/);
  });

  it('cancels the queue on a second click while searching', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedJoinRankedQueue.mockResolvedValue({ status: 'queued' });
    mockedLeaveRankedQueue.mockResolvedValue({ status: 'left', was_queued: true });
    renderCity();

    await clickRanked();
    expect(lastRankedSublabel).toMatch(/^SEARCHING/);

    await clickRanked();
    expect(mockedLeaveRankedQueue).toHaveBeenCalledWith('Alice');
    expect(lastRankedLabel).toBe('RANKED');
    expect(lastRankedSublabel).toBeNull();
  });

  it('lands a matched player via join_room and navigates', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedJoinRankedQueue.mockResolvedValue({ status: 'queued' });
    renderCity();

    await clickRanked();
    act(() => { socket.__fireSubscribeEvent('ranked_match_found', { lobby_id: 'RNKD', token: 'tok-1' }); });

    expect(socket.__emit).toHaveBeenCalledWith('join_room', { lobby_id: 'RNKD', token: 'tok-1' });
    expect(push).toHaveBeenCalledWith('/lobby?id=RNKD');
  });

  it('offers a return to an existing match instead of re-queueing', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedGetActiveRankedLobby.mockResolvedValue({
      lobby_id: 'RNKD',
      token: 'tok-active',
      ranked_countdown_deadline: new Date(Date.now() + 30_000).toISOString(),
      started: false,
    });
    renderCity();
    await waitForScene();
    await waitFor(() => expect(lastRankedLabel).toBe('RETURN TO MATCH'));

    expect(mockedGetActiveRankedLobby).toHaveBeenCalledWith('Alice');
    // useCountdown publishes null until its first tick, so the sublabel
    // legitimately reads STARTING SOON for a moment before the seconds
    // appear. Asserting immediately raced that and made this flaky.
    await waitFor(() => expect(lastRankedSublabel).toMatch(/^STARTS IN \d+s$/), { timeout: 3000 });

    await clickRanked();
    expect(mockedJoinRankedQueue).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/lobby?id=RNKD');
  });

  it('reads GAME STARTED! once the match is under way', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedGetActiveRankedLobby.mockResolvedValue({
      lobby_id: 'RNKD',
      token: 'tok-active',
      ranked_countdown_deadline: null,
      started: true,
    });
    renderCity();
    await waitForScene();
    await waitFor(() => expect(lastRankedLabel).toBe('RETURN TO MATCH'));
    expect(lastRankedSublabel).toBe('GAME STARTED!');
  });
});
