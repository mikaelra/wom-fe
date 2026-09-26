import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { merchantState, paperOffer, revertedState, stoneOffer } from '@/lib/__tests__/merchantFixtures';
import { blendPlanetColors, FULL_MOON_MERCHANT_COLOR } from '@/lib/merchant';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';
import Page from '@/app/page';
import {
  checkName,
  logInUser,
  verifyLoginCode,
  getBossfightLobby,
  getActiveRankedLobby,
  joinRankedQueue,
  leaveRankedQueue,
  getMerchantOffer,
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
  // docs/MERCHANT_PLAN.md's useMerchantOffer polls this on every mount of
  // this page -- no offer, so the ??? marker this suite isn't testing
  // stays off rather than the hook silently failing every poll.
  getMerchantOffer: vi.fn().mockResolvedValue(merchantState()),
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
  // Renders the wrapper R3F would, style included: the city markers' labels
  // are appended into exactly this element, so its stacking behaviour is
  // what keeps them off the top bar.
  Canvas: ({ children, style }: { children?: ReactNode; style?: CSSProperties }) => (
    <div data-testid="canvas-container" style={style}>
      {children}
    </div>
  ),
}));

const ATHENS: City = { id: 1, name: 'Athens', country: 'Greece', lat: 0, lng: 0, realLat: 0, realLng: -1.3, color: '#fff', tag: '' };
const VAULT: City = { id: 2, name: 'Vault City', country: '', lat: 0, lng: 0, realLat: 0, realLng: -1.3, color: '#fff', tag: '', isVault: true };
const RULES: City = { id: 3, name: 'Rules City', country: '', lat: 0, lng: 0, realLat: 0, realLng: -1.3, color: '#fff', tag: '', isRules: true };

let cityClickHandler: ((city: City) => void) | undefined;
let lastSkyRevertKey: string | null | undefined;
let lastMerchantMarkers: { key: string; color: string; label: string; lat: number; lng: number }[] = [];
let merchantClickHandler: ((key: string) => void) | undefined;
vi.mock('@/components/worldmap/WorldMap', () => ({
  default: ({
    onCityClick, skyRevertKey, merchantMarkers, onMerchantClick,
  }: {
    onCityClick: (city: City) => void;
    skyRevertKey?: string | null;
    merchantMarkers?: { key: string; color: string; label: string; lat: number; lng: number }[];
    onMerchantClick?: (key: string) => void;
  }) => {
    cityClickHandler = onCityClick;
    lastSkyRevertKey = skyRevertKey;
    lastMerchantMarkers = merchantMarkers ?? [];
    merchantClickHandler = onMerchantClick;
    return null;
  },
}));

vi.mock('@/components/merchant/MerchantScene', () => ({
  default: ({ offer }: { offer: { merchant_name: string; item_name: string } }) => (
    <div data-testid="merchant-scene">{offer.merchant_name}: {offer.item_name}</div>
  ),
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
  lastSkyRevertKey = undefined;
  mockedCheckName.mockReset();
  mockedLogInUser.mockReset();
  mockedVerifyLoginCode.mockReset();
  mockedGetBossfightLobby.mockReset();
  mockedGetActiveRankedLobby.mockReset();
  mockedJoinRankedQueue.mockReset();
  mockedLeaveRankedQueue.mockReset();
  vi.mocked(getMerchantOffer).mockReset().mockResolvedValue(merchantState());
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

// docs/MERCHANT_PLAN.md §7: WorldMap's planets go stale once its reveal
// animation settles (PlanetSprites is memoized on `phase` alone) unless
// something tells it a revert started or ended -- skyRevertKey is that
// something. Real bug, found live: the globe kept showing the live sky
// through an active revert.
describe('Page (Merchant time-revert -> globe sky)', () => {
  it('passes null when nothing is reverted', async () => {
    render(<Page />);
    await waitForWorldMap();
    expect(lastSkyRevertKey).toBeNull();
  });

  it('passes revert_to_date as the key while a revert is active', async () => {
    const revertedTo = '2026-01-01T00:00:00Z';
    vi.mocked(getMerchantOffer).mockResolvedValue(revertedState(revertedTo));
    render(<Page />);
    await waitFor(() => expect(lastSkyRevertKey).toBe(revertedTo));
  });
});

// docs/MERCHANT_PLAN.md: every merchant in town gets its own marker -- a
// conjunction on a full moon is two -- and the conjunction's is drawn in
// the blend of its two planets' colours.
describe('Page (merchant markers)', () => {
  it('draws no marker with nobody in town', async () => {
    render(<Page />);
    await waitForWorldMap();
    expect(lastMerchantMarkers).toEqual([]);
  });

  it('draws one marker per merchant when a conjunction falls on a full moon', async () => {
    vi.mocked(getMerchantOffer).mockResolvedValue(merchantState({ offers: [stoneOffer(), paperOffer()] }));
    render(<Page />);

    await waitFor(() => expect(lastMerchantMarkers).toHaveLength(2));
    const [moon, conj] = lastMerchantMarkers;
    expect(moon).toMatchObject({ label: 'Merchant', color: FULL_MOON_MERCHANT_COLOR });
    expect(conj).toMatchObject({ label: 'Scribe', color: blendPlanetColors('Mercury', 'Jupiter') });
    expect([moon.lat, moon.lng]).not.toEqual([conj.lat, conj.lng]);
  });

  it('keeps a merchant you have already bought from on the globe', async () => {
    vi.mocked(getMerchantOffer).mockResolvedValue(merchantState({
      offers: [paperOffer({ available: false, already_bought_this_period: true })],
    }));
    render(<Page />);
    await waitFor(() => expect(lastMerchantMarkers).toHaveLength(1));
  });

  it('opens the scene of the merchant whose marker was clicked', async () => {
    vi.mocked(getMerchantOffer).mockResolvedValue(merchantState({ offers: [stoneOffer(), paperOffer()] }));
    render(<Page />);
    await waitFor(() => expect(lastMerchantMarkers).toHaveLength(2));

    act(() => merchantClickHandler!(lastMerchantMarkers[1].key));

    expect(await screen.findByTestId('merchant-scene')).toHaveTextContent('The Scribe: Paper');
  });
});

// The city markers' labels are DOM, not WebGL: FreshHtml appends them into
// the canvas's container with a z-index off drei's default range (up to
// 16777271). The container carries no z-index of its own, so without a
// stacking context those values escaped into the page's root context and
// beat the top bar's z-20 -- a marker label struck through the text of the
// user menu whenever it was open.
describe('Page canvas stacking', () => {
  it('isolates the canvas container so 3D labels cannot paint over the HUD', async () => {
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByTestId('canvas-container')).toHaveStyle({ isolation: 'isolate' })
    );
  });
});
