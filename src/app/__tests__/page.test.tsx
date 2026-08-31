import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
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
// already-tested UI) testable without touching R3F at all.
//
// This used to stub useFrame and useThree as well, because a non-Athens city
// click mounted the City Hub view's CameraAnimator, which called useThree()
// at render time. Step 12 deleted that whole branch, so Canvas is now the
// only thing the page takes from R3F.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const ATHENS: City = { id: 1, name: 'Athens', country: 'Greece', lat: 0, lng: 0, realLat: 0, realLng: -1.3, color: '#fff', tag: '' };
const VAULT: City = { id: 2, name: 'Vault City', country: '', lat: 0, lng: 0, realLat: 0, realLng: -1.3, color: '#fff', tag: '', isVault: true };
const RULES: City = { id: 3, name: 'Rules City', country: '', lat: 0, lng: 0, realLat: 0, realLng: -1.3, color: '#fff', tag: '', isRules: true };

let cityClickHandler: ((city: City) => void) | undefined;
vi.mock('@/components/worldmap/WorldMap', () => ({
  default: ({ onCityClick }: { onCityClick: (city: City) => void }) => {
    cityClickHandler = onCityClick;
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

beforeEach(() => {
  push.mockClear();
  cityClickHandler = undefined;
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
  it('routes to the Athens city scene instead of entering the bossfight', async () => {
    render(<Page />);
    await clickAthens();

    expect(push).toHaveBeenCalledWith(`/city?id=${ATHENS.id}`);
    // The bossfight gate moved into the city scene (docs/CITY_SCENE_PLAN.md
    // §4.4). The world map must not open it, and must not reach for the
    // bossfight endpoints at all -- not even the name check.
    expect(screen.queryByText('Enter the Hades Bossfight')).not.toBeInTheDocument();
    expect(mockedGetBossfightLobby).not.toHaveBeenCalled();
    expect(mockedCheckName).not.toHaveBeenCalled();
  });

  it('raises the loading curtain on the click, not after the route change', async () => {
    render(<Page />);
    // Nothing to see until the sword is actually tapped.
    expect(screen.queryByText('ENTERING')).not.toBeInTheDocument();

    await clickAthens();

    // The route change and the city chunk's download both happen while this
    // page is still mounted, so without this a tap looks like it did
    // nothing at all.
    expect(screen.getByText('ENTERING')).toBeInTheDocument();
    expect(screen.getByText(ATHENS.name)).toBeInTheDocument();
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
    expect(screen.queryByText('Enter the Hades Bossfight')).not.toBeInTheDocument();
  });

  it('navigates directly to the rules for a rules city, without opening the popup', async () => {
    render(<Page />);
    await clickCity(RULES);
    expect(push).toHaveBeenCalledWith('/rules');
    expect(screen.queryByText('Enter the Hades Bossfight')).not.toBeInTheDocument();
  });
});
