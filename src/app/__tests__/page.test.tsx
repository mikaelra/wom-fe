import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import Page from '@/app/page';
import { checkName, logInUser, verifyLoginCode, getBossfightLobby } from '@/lib/api';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';
import type { City } from '@/lib/cities';
import { ToastProvider } from '@/components/Toast';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  checkName: vi.fn(),
  logInUser: vi.fn(),
  verifyLoginCode: vi.fn(),
  getBossfightLobby: vi.fn(),
}));

vi.mock('@/lib/useBossfightCountdown', () => ({ useBossfightCountdown: vi.fn() }));

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

const ATHENS: City = { id: 1, name: 'Athens', country: 'Greece', lat: 0, lng: 0, color: '#fff', tag: '' };
const VAULT: City = { id: 2, name: 'Vault City', country: '', lat: 0, lng: 0, color: '#fff', tag: '', isVault: true };
const RULES: City = { id: 3, name: 'Rules City', country: '', lat: 0, lng: 0, color: '#fff', tag: '', isRules: true };

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
const mockedUseBossfightCountdown = vi.mocked(useBossfightCountdown);

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
  mockedUseBossfightCountdown.mockReturnValue({ secondsUntil: null, raidMins: null, raidSecs: null });
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Page (world map view, Athens raid popup)', () => {
  it('opens the Athens popup when logged out', async () => {
    render(<Page />);
    await clickAthens();
    expect(screen.getByText('Enter the Hades Raid')).toBeInTheDocument();
    expect(mockedCheckName).not.toHaveBeenCalled();
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

  it('enters the raid directly, skipping checkName, when already logged in', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'AAAA', start_time: '2026-01-01T00:00:00Z' });
    render(<Page />);

    await clickAthens();

    expect(mockedCheckName).not.toHaveBeenCalled();
    expect(screen.queryByText('Enter the Hades Raid')).not.toBeInTheDocument();
    expect(mockedGetBossfightLobby).toHaveBeenCalledWith('Alice');
    expect(push).toHaveBeenCalledWith('/lobby/AAAA');
  });

  it('enters the raid for an unclaimed name, writing localStorage with no email', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'BBBB', start_time: '2026-01-01T00:00:00Z' });
    render(<Page />);

    await clickAthens();
    fireEvent.change(screen.getByPlaceholderText('Your battle name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Enter Raid'));
      await flush();
    });

    expect(mockedCheckName).toHaveBeenCalledWith('Alice');
    expect(mockedGetBossfightLobby).toHaveBeenCalledWith('Alice');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(localStorage.getItem('playerEmail')).toBeNull();
    expect(push).toHaveBeenCalledWith('/lobby/BBBB');
  });

  it('shows the email step for a claimed name, and enters the raid on successful login', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true });
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'CCCC', start_time: '2026-01-01T00:00:00Z' });
    render(<Page />);

    await clickAthens();
    fireEvent.change(screen.getByPlaceholderText('Your battle name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Enter Raid'));
      await flush();
    });
    expect(
      screen.getByText('This name is claimed. Type your email if you have claimed this username.'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Log in'));
      await flush();
    });

    expect(mockedGetBossfightLobby).toHaveBeenCalledWith('Alice');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(localStorage.getItem('playerEmail')).toBe('alice@example.com');
    expect(push).toHaveBeenCalledWith('/lobby/CCCC');
  });

  it('shows the code step when requires_code is true, and completes on a correct code', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: true });
    mockedVerifyLoginCode.mockRejectedValueOnce(new Error('Wrong code'));
    mockedGetBossfightLobby.mockResolvedValue({ lobby_id: 'DDDD', start_time: '2026-01-01T00:00:00Z' });
    render(<Page />);

    await clickAthens();
    fireEvent.change(screen.getByPlaceholderText('Your battle name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Enter Raid'));
      await flush();
    });
    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Log in'));
      await flush();
    });

    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Verify'));
      await flush();
    });
    expect(screen.getByText('Wrong code')).toBeInTheDocument();
    expect(mockedGetBossfightLobby).not.toHaveBeenCalled();

    mockedVerifyLoginCode.mockResolvedValueOnce({ success: true });
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Verify'));
      await flush();
    });

    expect(mockedVerifyLoginCode).toHaveBeenCalledWith('Alice', '123456');
    expect(mockedGetBossfightLobby).toHaveBeenCalledWith('Alice');
    expect(push).toHaveBeenCalledWith('/lobby/DDDD');
  });

  it('shows a toast and hides the loading overlay when entering the raid fails', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedGetBossfightLobby.mockRejectedValue(new Error('Raid full'));
    render(
      <ToastProvider>
        <Page />
      </ToastProvider>,
    );

    await clickAthens();

    expect(await screen.findByText('Raid full')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
