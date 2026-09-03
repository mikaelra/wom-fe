import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';
import CityPage from '@/app/city/page';
import {
  checkName, logInUser, verifyLoginCode, getBossfightLobby, getNextBossfightTime,
  getActiveRankedLobby, joinRankedQueue, leaveRankedQueue, getBossfightRoster,
  startBotRanked, NoAiCreditsError,
} from '@/lib/api';
import { ToastProvider } from '@/components/Toast';
import { setStoredAccountToken } from '@/lib/http';
import * as socketModule from '@/lib/socket';
import { findCity } from '@/lib/cities';

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
  getBossfightRoster: vi.fn(),
  startBotRanked: vi.fn(),
  NoAiCreditsError: class NoAiCreditsError extends Error {
    constructor() { super('no_credits'); this.name = 'NoAiCreditsError'; }
  },
  // SceneTopBar (via CityOverlay) loads these once an account token is
  // present -- which the bot-ranked tests set.
  getInventory: vi.fn().mockResolvedValue({
    equipped_skin: 'frog_green_v1', equipped_cosmetic: null,
    skins: [], relics: [], wheels: [], artifacts: [], pending: {},
  }),
  logOut: vi.fn(),
  resolveAccountSession: vi.fn().mockResolvedValue({
    name: 'Alice', email: 'a@x.com', always_verify_email: false, email_verified: true,
  }),
}));

// Same fake-subscribe pattern the world-map tests used before ranked moved
// here -- useRankedQueue talks to the socket directly for
// join_ranked_queue / ranked_match_found.
vi.mock('@/lib/socket', () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emit = vi.fn();
  return {
    // on/off are here because useBossfightRoster re-sends
    // watch_bossfight on every reconnect -- Socket.IO room membership does
    // not survive one.
    getSocket: () => ({ emit, on: () => {}, off: () => {} }),
    subscribe: (event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => listeners.get(event)?.delete(handler);
    },
    // Same reason as on/off above, for the ranked queue's own room: see
    // useRankedQueue, which re-joins it on every reconnect.
    subscribeConnect: () => () => {},
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
// Renders the wrapper div R3F would, carrying the style through, so the
// canvas container's stacking behaviour is assertable -- the labels
// FreshHtml appends live in exactly this element.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, style }: { children?: ReactNode; style?: CSSProperties }) => (
    <div data-testid="canvas-container" style={style}>
      {children}
    </div>
  ),
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
let marketHandler: (() => void) | undefined;
let botRankedHandler: (() => void) | undefined;
let lastCoords: { realLat: number; realLng: number } | undefined;
vi.mock('@/components/city/CityScene', () => ({
  default: ({
    onBossfight, bossfightSublabel, onRanked, onBotRanked, rankedLabel, rankedSublabel,
    onBackToEarth, onMarket, onReady, realLat, realLng,
  }: {
    onBossfight: () => void; bossfightSublabel?: string | null;
    onRanked: () => void; onBotRanked: () => void;
    rankedLabel: string; rankedSublabel?: string | null;
    onBackToEarth: () => void;
    onMarket: () => void;
    onReady?: () => void;
    realLat: number; realLng: number;
  }) => {
    bossfightHandler = onBossfight;
    lastSublabel = bossfightSublabel;
    rankedHandler = onRanked;
    botRankedHandler = onBotRanked;
    lastRankedLabel = rankedLabel;
    lastRankedSublabel = rankedSublabel;
    // The real scene fires this from a useFrame once its models have
    // resolved AND the canvas has drawn; here the test decides when.
    readyHandler = onReady;
    backHandler = onBackToEarth;
    marketHandler = onMarket;
    lastCoords = { realLat, realLng };
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
const mockedGetBossfightRoster = vi.mocked(getBossfightRoster);

/** An empty temple: the roster route answers even when no fight exists. */
const emptyRoster = { lobby_id: null, round: 0, start_time: null, players: [] };
type RosterPlayer = { name: string; skin: string | null; alive: boolean; spectator: boolean; bot: boolean };
const occupant = (name: string, over: Partial<RosterPlayer> = {}): RosterPlayer => ({
  name, skin: null, alive: true, spectator: false, bot: false, ...over,
});

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
  marketHandler = undefined;
  lastCoords = undefined;
  socket.__reset();
  mockedCheckName.mockReset();
  mockedLogInUser.mockReset();
  mockedVerifyLoginCode.mockReset();
  mockedGetBossfightLobby.mockReset();
  mockedGetNextBossfightTime.mockReset();
  mockedGetNextBossfightTime.mockResolvedValue({ start_time: '2099-01-01T00:00:00Z' });
  mockedGetBossfightRoster.mockReset();
  // The page polls the roster for both the temple's figures and the
  // signpost's caption, so every test hits this. Default to an empty temple.
  mockedGetBossfightRoster.mockResolvedValue(emptyRoster);
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
  vi.mocked(startBotRanked).mockReset();
  botRankedHandler = undefined;
  localStorage.clear();
  setStoredAccountToken(null);
});

describe('CityPage (routing)', () => {
  // The city used to be asserted through its on-screen nameplate. That is
  // gone -- the scene says where you are better than a caption does -- so
  // these check the thing that actually matters instead: which coordinates
  // reached the scene. That is a stronger test than the heading ever was,
  // because it also guards the trap in lib/cities.ts, where `lng` is the
  // MIRRORED globe-texture longitude and only `realLng` may reach anything
  // astronomical (§6.2).
  const ATHENS = findCity('athens')!;

  it('resolves the city named by ?id= and hands the scene its real coordinates', async () => {
    renderCity();
    await waitForScene();
    expect(lastCoords).toEqual({ realLat: ATHENS.realLat, realLng: ATHENS.realLng });
    expect(lastCoords!.realLng).not.toBe(ATHENS.lng);
  });

  it('accepts the numeric id form too', async () => {
    searchId = '3';
    renderCity();
    await waitForScene();
    expect(lastCoords).toEqual({ realLat: ATHENS.realLat, realLng: ATHENS.realLng });
  });

  it('shows no city nameplate over the scene', async () => {
    renderCity();
    await waitForScene();
    expect(screen.queryByText(/Marble Columns/)).not.toBeInTheDocument();
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

  it('routes the signpost\'s MARKET arm to the trading post', async () => {
    renderCity();
    await waitFor(() => expect(marketHandler).toBeDefined());
    act(() => { marketHandler!(); });
    expect(push).toHaveBeenCalledWith('/market');
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

  it('says nothing at all once the countdown runs out with nobody in there', async () => {
    // It used to read IN PROGRESS at this point, which advertised a fight
    // that was not happening -- the clock hitting zero says only that a
    // fight COULD start, not that anyone turned up for it.
    mockedGetNextBossfightTime.mockResolvedValue({
      start_time: new Date(Date.now() - 5_000).toISOString(),
    });
    renderCity();
    await waitForScene();
    await waitFor(() => expect(lastSublabel).toBeNull(), { timeout: 3000 });
  });

  it('counts one waiting player in the singular', async () => {
    mockedGetBossfightRoster.mockResolvedValue({
      ...emptyRoster, lobby_id: 'bf1', players: [occupant('Ada')],
    });
    renderCity();
    await waitForScene();
    await waitFor(() => expect(lastSublabel).toBe('1 PLAYER WAITING'), { timeout: 3000 });
  });

  it('counts several waiting players in the plural', async () => {
    mockedGetBossfightRoster.mockResolvedValue({
      ...emptyRoster,
      lobby_id: 'bf1',
      players: [occupant('Ada'), occupant('Bo'), occupant('Cy')],
    });
    renderCity();
    await waitForScene();
    await waitFor(() => expect(lastSublabel).toBe('3 PLAYERS WAITING'), { timeout: 3000 });
  });

  it('switches from waiting to playing once the first round is dealt', async () => {
    mockedGetBossfightRoster.mockResolvedValue({
      ...emptyRoster,
      lobby_id: 'bf1',
      round: 2,
      players: [occupant('Ada'), occupant('Bo')],
    });
    renderCity();
    await waitForScene();
    await waitFor(() => expect(lastSublabel).toBe('2 PLAYERS PLAYING'), { timeout: 3000 });
  });

  it('does not count Hades, who arrives in the roster as a bot', async () => {
    // Without the bot filter an empty temple would advertise one player.
    mockedGetBossfightRoster.mockResolvedValue({
      ...emptyRoster,
      lobby_id: 'bf1',
      players: [occupant('Hades', { bot: true }), occupant('Ada')],
    });
    renderCity();
    await waitForScene();
    await waitFor(() => expect(lastSublabel).toBe('1 PLAYER WAITING'), { timeout: 3000 });
  });

  it('prefers a live headcount over the countdown', async () => {
    mockedGetNextBossfightTime.mockResolvedValue({
      start_time: new Date(Date.now() + 125_000).toISOString(),
    });
    mockedGetBossfightRoster.mockResolvedValue({
      ...emptyRoster, lobby_id: 'bf1', players: [occupant('Ada'), occupant('Bo')],
    });
    renderCity();
    await waitForScene();
    await waitFor(() => expect(lastSublabel).toBe('2 PLAYERS WAITING'), { timeout: 3000 });
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

describe('CityPage (bot ranked)', () => {
  it('starts a bot-ranked game and routes into the lobby', async () => {
    setStoredAccountToken('acct-tok');
    vi.mocked(startBotRanked).mockResolvedValue({ lobby_id: 'BOTP', token: 't' });
    renderCity();
    await waitForScene();

    await act(async () => {
      botRankedHandler?.();
      await flush();
    });

    expect(startBotRanked).toHaveBeenCalledWith('acct-tok');
    expect(push).toHaveBeenCalledWith('/lobby?id=BOTP');
  });

  it('does nothing but warn when not logged in with an account', async () => {
    vi.mocked(startBotRanked).mockResolvedValue({ lobby_id: 'X', token: 't' });
    renderCity();
    await waitForScene();

    await act(async () => {
      botRankedHandler?.();
      await flush();
    });

    expect(startBotRanked).not.toHaveBeenCalled();
  });

  it('warns and stays put when the owner is out of credits', async () => {
    setStoredAccountToken('acct-tok');
    vi.mocked(startBotRanked).mockRejectedValue(new NoAiCreditsError());
    renderCity();
    await waitForScene();

    await act(async () => {
      botRankedHandler?.();
      await flush();
    });

    expect(startBotRanked).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(await screen.findByText(/out of my ai credits/i)).toBeInTheDocument();
  });
});

// The signpost's labels are DOM, not WebGL: FreshHtml appends them into the
// canvas's container with a z-index off drei's default range (up to
// 16777271, chosen to beat everything). The container is positioned but
// carries no z-index of its own, so it was not a stacking context and those
// values escaped into the page's root context -- where they struck through
// the text of the user menu whenever it was open over the city.
describe('CityPage canvas stacking', () => {
  it('isolates the canvas container so 3D labels cannot paint over the HUD', () => {
    renderCity();
    expect(screen.getByTestId('canvas-container')).toHaveStyle({ isolation: 'isolate' });
  });

  it('still lets the canvas fill the scene', () => {
    renderCity();
    expect(screen.getByTestId('canvas-container')).toHaveStyle({ position: 'absolute' });
  });
});
