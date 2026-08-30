import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import CityPage from '@/app/city/page';
import { checkName, logInUser, verifyLoginCode, getBossfightLobby, getNextBossfightTime } from '@/lib/api';
import { ToastProvider } from '@/components/Toast';

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
}));

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
let lastSublabel: string | null | undefined;
vi.mock('@/components/city/CityScene', () => ({
  default: ({ onBossfight, bossfightSublabel }: { onBossfight: () => void; bossfightSublabel?: string | null }) => {
    bossfightHandler = onBossfight;
    lastSublabel = bossfightSublabel;
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

const flush = () => act(async () => Promise.resolve());
const renderCity = () => render(<ToastProvider><CityPage /></ToastProvider>);
// CityScene arrives through next/dynamic, so it is not mounted synchronously.
const waitForScene = () => waitFor(() => expect(bossfightHandler).toBeDefined());
const clickBossfight = async () => {
  await waitForScene();
  await act(async () => { bossfightHandler!(); await flush(); });
};

beforeEach(() => {
  push.mockClear();
  searchId = 'athens';
  bossfightHandler = undefined;
  lastSublabel = undefined;
  mockedCheckName.mockReset();
  mockedLogInUser.mockReset();
  mockedVerifyLoginCode.mockReset();
  mockedGetBossfightLobby.mockReset();
  mockedGetNextBossfightTime.mockReset();
  mockedGetNextBossfightTime.mockResolvedValue({ start_time: '2099-01-01T00:00:00Z' });
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

  it('goes back to the world map', async () => {
    renderCity();
    fireEvent.click(await screen.findByText(/Back to Earth/));
    expect(push).toHaveBeenCalledWith('/');
  });
});

// These behaviours moved here wholesale from the world map's Athens sword
// (docs/CITY_SCENE_PLAN.md §4.4 / step 6). Kept test-for-test so the move
// cannot quietly drop one.
describe('CityPage (entering the raid)', () => {
  it('opens the name gate when logged out, without calling checkName yet', async () => {
    renderCity();
    await clickBossfight();
    expect(screen.getByText('Enter the Hades Raid')).toBeInTheDocument();
    expect(mockedCheckName).not.toHaveBeenCalled();
  });

  it('enters the raid directly, skipping the gate, when already logged in', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'AAAA', start_time: '2026-01-01T00:00:00Z' });
    renderCity();

    await clickBossfight();

    expect(mockedCheckName).not.toHaveBeenCalled();
    expect(screen.queryByText('Enter the Hades Raid')).not.toBeInTheDocument();
    expect(mockedGetBossfightLobby).toHaveBeenCalledWith('Alice');
    expect(push).toHaveBeenCalledWith('/lobby?id=AAAA');
  });

  it('enters the raid for an unclaimed name, writing localStorage with no email', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'BBBB', start_time: '2026-01-01T00:00:00Z' });
    renderCity();

    await clickBossfight();
    fireEvent.change(screen.getByPlaceholderText('Your battle name'), { target: { value: 'Alice' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter Raid')); await flush(); });

    expect(mockedCheckName).toHaveBeenCalledWith('Alice');
    expect(mockedGetBossfightLobby).toHaveBeenCalledWith('Alice');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(localStorage.getItem('playerEmail')).toBeNull();
    expect(push).toHaveBeenCalledWith('/lobby?id=BBBB');
  });

  it('shows the email step for a claimed name, and enters the raid on login', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: false });
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'CCCC', start_time: '2026-01-01T00:00:00Z' });
    renderCity();

    await clickBossfight();
    fireEvent.change(screen.getByPlaceholderText('Your battle name'), { target: { value: 'Alice' } });
    await act(async () => { fireEvent.click(screen.getByText('Enter Raid')); await flush(); });

    expect(screen.getByPlaceholderText('email')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'a@b.co' } });
    await act(async () => { fireEvent.click(screen.getByText('Log in')); await flush(); });

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
    await act(async () => { fireEvent.click(screen.getByText('Enter Raid')); await flush(); });
    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'a@b.co' } });
    await act(async () => { fireEvent.click(screen.getByText('Log in')); await flush(); });

    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    await act(async () => { fireEvent.click(screen.getByText('Verify')); await flush(); });

    expect(mockedVerifyLoginCode).toHaveBeenCalledWith('Alice', '123456');
    expect(push).toHaveBeenCalledWith('/lobby?id=DDDD');
  });

  it('surfaces a toast and clears the loading overlay when entering the raid fails', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedGetBossfightLobby.mockRejectedValue(new Error('Raid is full'));
    renderCity();

    await clickBossfight();

    expect(await screen.findByText('Raid is full')).toBeInTheDocument();
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
    await waitFor(() => expect(lastSublabel).toMatch(/^RAID IN \d+:\d{2}$/), { timeout: 3000 });
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
