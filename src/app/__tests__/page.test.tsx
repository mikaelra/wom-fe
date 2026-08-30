import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import Page from '@/app/page';
import {
  checkName,
  logInUser,
  verifyLoginCode,
  getBossfightLobby,
  getActiveRankedLobby,
  joinRankedQueue,
  leaveRankedQueue,
} from '@/lib/api';
import type { City } from '@/lib/cities';
import type { RankedLabelInfo } from '@/components/worldmap/CityMarker';
import * as socketModule from '@/lib/socket';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  checkName: vi.fn(),
  logInUser: vi.fn(),
  verifyLoginCode: vi.fn(),
  getBossfightLobby: vi.fn(),
  getActiveRankedLobby: vi.fn(),
  joinRankedQueue: vi.fn(),
  leaveRankedQueue: vi.fn(),
}));

// Same fake-subscribe pattern as WorldMapOverlay.test.tsx -- useRankedQueue
// (now driven from page.tsx via the New York marker) talks to the socket
// directly for join_ranked_queue/ranked_match_found.
vi.mock('@/lib/socket', () => {
  const subscribeListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emit = vi.fn();

  return {
    getSocket: () => ({ emit }),
    subscribe: (event: string, handler: (...args: unknown[]) => void) => {
      if (!subscribeListeners.has(event)) subscribeListeners.set(event, new Set());
      subscribeListeners.get(event)!.add(handler);
      return () => subscribeListeners.get(event)?.delete(handler);
    },
    __fireSubscribeEvent: (event: string, payload: unknown) => {
      subscribeListeners.get(event)?.forEach((h) => h(payload));
    },
    __emit: emit,
    __reset: () => {
      subscribeListeners.clear();
      emit.mockClear();
    },
  };
});

const socket = socketModule as unknown as {
  __fireSubscribeEvent: (event: string, payload: unknown) => void;
  __emit: ReturnType<typeof vi.fn>;
  __reset: () => void;
};

// @react-three/fiber's real Canvas needs a WebGL context jsdom can't provide.
// Rendering children directly (no real <canvas>) keeps the rest of the page's
// own logic (out of scope: WorldMap's 3D city picking, WorldMapOverlay's own
// already-tested UI) testable without touching R3F at all. A non-Athens/
// vault/rules city click sets `selectedCity`, mounting the City Hub view's
// CameraAnimator, which calls the real useThree() at render time (not just
// inside its useFrame callback, which never fires here) -- a real
// THREE.PerspectiveCamera (pure math, no WebGL) satisfies its
// `camera.position.clone()` call without needing a hand-rolled stub.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useFrame: () => {},
  useThree: () => ({ camera: new THREE.PerspectiveCamera(), size: { width: 1024, height: 768 } }),
}));

const ATHENS: City = { id: 1, name: 'Athens', country: 'Greece', lat: 0, lng: 0, realLat: 0, realLng: -1.3, color: '#fff', tag: '' };
const VAULT: City = { id: 2, name: 'Vault City', country: '', lat: 0, lng: 0, realLat: 0, realLng: -1.3, color: '#fff', tag: '', isVault: true };
const RULES: City = { id: 3, name: 'Rules City', country: '', lat: 0, lng: 0, realLat: 0, realLng: -1.3, color: '#fff', tag: '', isRules: true };
const NEW_YORK: City = { id: 4, name: 'New York', country: 'USA', lat: 0, lng: 0, realLat: 0, realLng: -1.3, color: '#fff', tag: '' };

let cityClickHandler: ((city: City) => void) | undefined;
let lastRankedInfo: RankedLabelInfo | undefined;
vi.mock('@/components/worldmap/WorldMap', () => ({
  default: ({ onCityClick, rankedInfo }: { onCityClick: (city: City) => void; rankedInfo?: RankedLabelInfo }) => {
    cityClickHandler = onCityClick;
    lastRankedInfo = rankedInfo;
    return null;
  },
}));

vi.mock('@/components/worldmap/WorldMapOverlay', () => ({
  default: () => null,
}));

const mockedCheckName = vi.mocked(checkName);
const mockedLogInUser = vi.mocked(logInUser);
const mockedVerifyLoginCode = vi.mocked(verifyLoginCode);
const mockedGetBossfightLobby = vi.mocked(getBossfightLobby);
const mockedGetActiveRankedLobby = vi.mocked(getActiveRankedLobby);
const mockedJoinRankedQueue = vi.mocked(joinRankedQueue);
const mockedLeaveRankedQueue = vi.mocked(leaveRankedQueue);

const flush = () => act(async () => Promise.resolve());

// WorldMap only mounts once `sceneReady` flips true, which happens via a
// requestAnimationFrame callback scheduled in an effect -- jsdom's RAF fires
// on a real timer, so it isn't visible synchronously after render().
const waitForWorldMap = () => waitFor(() => expect(cityClickHandler).toBeDefined());

const clickCity = async (city: City) => {
  await waitForWorldMap();
  await act(async () => { cityClickHandler!(city); await flush(); });
};
const clickAthens = () => clickCity(ATHENS);
const clickNewYork = () => clickCity(NEW_YORK);

beforeEach(() => {
  push.mockClear();
  cityClickHandler = undefined;
  lastRankedInfo = undefined;
  mockedCheckName.mockReset();
  mockedLogInUser.mockReset();
  mockedVerifyLoginCode.mockReset();
  mockedGetBossfightLobby.mockReset();
  mockedGetActiveRankedLobby.mockReset();
  mockedJoinRankedQueue.mockReset();
  mockedLeaveRankedQueue.mockReset();
  // Harmless "no active ranked match" default for every test that isn't
  // specifically exercising the New York ranked flow.
  mockedGetActiveRankedLobby.mockResolvedValue({
    lobby_id: null, token: null, ranked_countdown_deadline: null, started: false,
  });
  socket.__reset();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Page (world map view, city routing)', () => {
  it('routes to the Athens city scene instead of entering the raid', async () => {
    render(<Page />);
    await clickAthens();

    expect(push).toHaveBeenCalledWith(`/city?id=${ATHENS.id}`);
    // The raid gate moved into the city scene (docs/CITY_SCENE_PLAN.md
    // §4.4). The world map must not open it, and must not reach for the
    // raid endpoints at all -- not even the name check.
    expect(screen.queryByText('Enter the Hades Raid')).not.toBeInTheDocument();
    expect(mockedGetBossfightLobby).not.toHaveBeenCalled();
    expect(mockedCheckName).not.toHaveBeenCalled();
  });

  it('routes to the city the same way when already logged in', async () => {
    // Previously this was the "skip the popup, go straight in" path. There
    // is no longer a fast path on the world map: everyone goes to the city.
    localStorage.setItem('playerName', 'Alice');
    render(<Page />);
    await clickAthens();

    expect(push).toHaveBeenCalledWith(`/city?id=${ATHENS.id}`);
    expect(mockedGetBossfightLobby).not.toHaveBeenCalled();
  });

  it('navigates directly to the vault for a vault city, without opening the popup', async () => {
    render(<Page />);
    await clickCity(VAULT);
    expect(push).toHaveBeenCalledWith('/vault');
    expect(screen.queryByText('Enter the Hades Raid')).not.toBeInTheDocument();
  });

  it('navigates directly to the rules for a rules city, without opening the popup', async () => {
    render(<Page />);
    await clickCity(RULES);
    expect(push).toHaveBeenCalledWith('/rules');
    expect(screen.queryByText('Enter the Hades Raid')).not.toBeInTheDocument();
  });
});

describe('Page (world map view, New York ranked queue)', () => {
  it('opens the ranked popup when logged out, and starts the queue for an unclaimed name', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    mockedJoinRankedQueue.mockResolvedValue({ status: 'queued' });
    render(<Page />);

    await clickNewYork();
    expect(screen.getByText('Play Ranked')).toBeInTheDocument();
    expect(lastRankedInfo?.status).toBe('idle');

    fireEvent.change(screen.getByPlaceholderText('Your battle name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
      await flush();
    });

    expect(mockedCheckName).toHaveBeenCalledWith('Alice');
    expect(socket.__emit).toHaveBeenCalledWith('join_ranked_queue', { name: 'Alice' });
    expect(mockedJoinRankedQueue).toHaveBeenCalledWith('Alice');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(screen.queryByText('Play Ranked')).not.toBeInTheDocument();
    expect(lastRankedInfo?.status).toBe('searching');
  });

  it('starts the ranked queue directly when already logged in, reporting searching status', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedJoinRankedQueue.mockResolvedValue({ status: 'queued' });
    render(<Page />);

    await clickNewYork();

    expect(mockedCheckName).not.toHaveBeenCalled();
    expect(socket.__emit).toHaveBeenCalledWith('join_ranked_queue', { name: 'Alice' });
    expect(lastRankedInfo?.status).toBe('searching');
  });

  it('cancels the ranked queue on a second click while searching', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedJoinRankedQueue.mockResolvedValue({ status: 'queued' });
    mockedLeaveRankedQueue.mockResolvedValue({ status: 'left', was_queued: true });
    render(<Page />);

    await clickNewYork();
    expect(lastRankedInfo?.status).toBe('searching');

    await clickNewYork();
    expect(mockedLeaveRankedQueue).toHaveBeenCalledWith('Alice');
    expect(lastRankedInfo?.status).toBe('idle');
  });

  it('lands the matched player via join_room and navigates, mirroring the lobby-join pattern', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedJoinRankedQueue.mockResolvedValue({ status: 'queued' });
    render(<Page />);

    await clickNewYork();

    act(() => {
      socket.__fireSubscribeEvent('ranked_match_found', { lobby_id: 'RNKD', token: 'tok-1' });
    });

    expect(socket.__emit).toHaveBeenCalledWith('join_room', { lobby_id: 'RNKD', token: 'tok-1' });
    expect(push).toHaveBeenCalledWith('/lobby?id=RNKD');
  });

  it('reports an active match on mount, and navigates to it on click instead of re-queueing', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedGetActiveRankedLobby.mockResolvedValue({
      lobby_id: 'RNKD',
      token: 'tok-active',
      ranked_countdown_deadline: new Date(Date.now() + 30_000).toISOString(),
      started: false,
    });
    render(<Page />);
    await waitFor(() => expect(lastRankedInfo?.status).toBe('activeMatch'));

    expect(mockedGetActiveRankedLobby).toHaveBeenCalledWith('Alice');
    expect(lastRankedInfo?.activeMatchStarted).toBe(false);

    await clickNewYork();
    expect(mockedJoinRankedQueue).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/lobby?id=RNKD');
  });

  it('reports the match as started once the countdown deadline has passed', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedGetActiveRankedLobby.mockResolvedValue({
      lobby_id: 'RNKD',
      token: 'tok-active',
      ranked_countdown_deadline: null,
      started: true,
    });
    render(<Page />);
    await waitFor(() => expect(lastRankedInfo?.status).toBe('activeMatch'));

    expect(lastRankedInfo?.activeMatchStarted).toBe(true);
  });
});
