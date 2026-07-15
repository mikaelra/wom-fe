import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import WorldMapOverlay from '@/components/worldmap/WorldMapOverlay';
import { checkName, logInUser, verifyLoginCode, createLobby, joinLobby } from '@/lib/api';
import type RealRopedButton3D from '@/components/hud/RopedButton3D';
import type RealRopedInput3D from '@/components/hud/RopedInput3D';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  checkName: vi.fn(),
  logInUser: vi.fn(),
  verifyLoginCode: vi.fn(),
  createLobby: vi.fn(),
  joinLobby: vi.fn(),
  getPlayerRelics: vi.fn(),
}));

// RopedButton3D/RopedInput3D render @react-three/fiber's <Canvas> internally
// (gated behind a lowQuality state that starts false), which jsdom can't
// mount. WorldMapOverlay's own auth-flow wiring is what's under test here,
// not these presentational components' 3D rendering, so they're mocked to
// plain accessible stand-ins that preserve the same prop contract.
vi.mock('@/components/hud/RopedButton3D', () => ({
  default: ({ onClick, disabled, loading, ariaLabel, children }: ComponentProps<typeof RealRopedButton3D>) => (
    <button aria-label={ariaLabel} onClick={onClick} disabled={disabled || loading}>
      {loading ? 'Loading...' : children}
    </button>
  ),
}));
vi.mock('@/components/hud/RopedInput3D', () => ({
  default: ({ children }: ComponentProps<typeof RealRopedInput3D>) => <>{children}</>,
}));

const mockedCheckName = vi.mocked(checkName);
const mockedLogInUser = vi.mocked(logInUser);
const mockedVerifyLoginCode = vi.mocked(verifyLoginCode);
const mockedCreateLobby = vi.mocked(createLobby);
const mockedJoinLobby = vi.mocked(joinLobby);

const flush = () => act(async () => Promise.resolve());

// The popup's own "Log in" button (email step) and the top bar's "Log in"
// button (rendered whenever logged out) have the same accessible name, so
// queries that touch the popup must be scoped to it specifically.
const namePopup = () => screen.getByText('Choose a name').closest('.bg-gray-900') as HTMLElement;

beforeEach(() => {
  push.mockClear();
  mockedCheckName.mockReset();
  mockedLogInUser.mockReset();
  mockedVerifyLoginCode.mockReset();
  mockedCreateLobby.mockReset();
  mockedJoinLobby.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe('WorldMapOverlay', () => {
  it('shows the logged-out top bar and lobby controls, with no user menu', () => {
    render(<WorldMapOverlay />);
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter lobby code...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join lobby' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create lobby' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open user menu' })).not.toBeInTheDocument();
  });

  it('opens a blank name popup for Create Lobby, then creates for an unclaimed name', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    mockedCreateLobby.mockResolvedValue({ lobby_id: 'AAAA', token: 't' });
    render(<WorldMapOverlay />);

    fireEvent.click(screen.getByRole('button', { name: 'Create lobby' }));
    expect(screen.getByText('Choose a name')).toBeInTheDocument();
    expect(within(namePopup()).getByPlaceholderText('Your battle name')).toHaveValue('');

    fireEvent.change(within(namePopup()).getByPlaceholderText('Your battle name'), {
      target: { value: 'Alice' },
    });
    await act(async () => {
      fireEvent.click(within(namePopup()).getByText('Continue'));
      await flush();
    });

    expect(mockedCheckName).toHaveBeenCalledWith('Alice');
    expect(mockedCreateLobby).toHaveBeenCalledWith('Alice', '');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(push).toHaveBeenCalledWith('/lobby/AAAA');
    expect(screen.queryByText('Choose a name')).not.toBeInTheDocument();
  });

  it('opens a blank name popup for Join Lobby, then joins for an unclaimed name', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    mockedJoinLobby.mockResolvedValue(undefined);
    render(<WorldMapOverlay />);

    fireEvent.change(screen.getByPlaceholderText('Enter lobby code...'), { target: { value: 'zzzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join lobby' }));
    expect(screen.getByText('Choose a name')).toBeInTheDocument();

    fireEvent.change(within(namePopup()).getByPlaceholderText('Your battle name'), {
      target: { value: 'Alice' },
    });
    await act(async () => {
      fireEvent.click(within(namePopup()).getByText('Continue'));
      await flush();
    });

    expect(mockedJoinLobby).toHaveBeenCalledWith('zzzz', 'Alice', '');
    expect(mockedCreateLobby).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/lobby/zzzz');
  });

  it('shows the email step for a claimed name, and completes the pending create (not join)', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true });
    mockedCreateLobby.mockResolvedValue({ lobby_id: 'BBBB', token: 't' });
    render(<WorldMapOverlay />);

    fireEvent.click(screen.getByRole('button', { name: 'Create lobby' }));
    fireEvent.change(within(namePopup()).getByPlaceholderText('Your battle name'), {
      target: { value: 'Alice' },
    });
    await act(async () => {
      fireEvent.click(within(namePopup()).getByText('Continue'));
      await flush();
    });

    expect(
      screen.getByText('This name is claimed. Type your email if you have claimed this username.'),
    ).toBeInTheDocument();
    expect(mockedCreateLobby).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(within(namePopup()).getByText('Log in'));
      await flush();
    });

    expect(mockedCreateLobby).toHaveBeenCalledWith('Alice', 'alice@example.com');
    expect(mockedJoinLobby).not.toHaveBeenCalled();
    expect(localStorage.getItem('playerEmail')).toBe('alice@example.com');
    expect(push).toHaveBeenCalledWith('/lobby/BBBB');
  });

  it('completes the pending join (not create) via the email step, proving the pending action threads through', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true });
    mockedJoinLobby.mockResolvedValue(undefined);
    render(<WorldMapOverlay />);

    fireEvent.change(screen.getByPlaceholderText('Enter lobby code...'), { target: { value: 'zzzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join lobby' }));
    fireEvent.change(within(namePopup()).getByPlaceholderText('Your battle name'), {
      target: { value: 'Alice' },
    });
    await act(async () => {
      fireEvent.click(within(namePopup()).getByText('Continue'));
      await flush();
    });

    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(within(namePopup()).getByText('Log in'));
      await flush();
    });

    expect(mockedJoinLobby).toHaveBeenCalledWith('zzzz', 'Alice', 'alice@example.com');
    expect(mockedCreateLobby).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/lobby/zzzz');
  });

  it('shows the code step when requires_code is true, and completes on a correct code', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: true });
    mockedVerifyLoginCode.mockRejectedValueOnce(new Error('Wrong code'));
    mockedCreateLobby.mockResolvedValue({ lobby_id: 'CCCC', token: 't' });
    render(<WorldMapOverlay />);

    fireEvent.click(screen.getByRole('button', { name: 'Create lobby' }));
    fireEvent.change(within(namePopup()).getByPlaceholderText('Your battle name'), {
      target: { value: 'Alice' },
    });
    await act(async () => {
      fireEvent.click(within(namePopup()).getByText('Continue'));
      await flush();
    });
    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(within(namePopup()).getByText('Log in'));
      await flush();
    });

    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
    await act(async () => {
      fireEvent.click(within(namePopup()).getByText('Verify'));
      await flush();
    });
    expect(screen.getByText('Wrong code')).toBeInTheDocument();
    expect(mockedCreateLobby).not.toHaveBeenCalled();

    mockedVerifyLoginCode.mockResolvedValueOnce({ success: true });
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(within(namePopup()).getByText('Verify'));
      await flush();
    });

    expect(mockedVerifyLoginCode).toHaveBeenCalledWith('Alice', '123456');
    expect(mockedCreateLobby).toHaveBeenCalledWith('Alice', 'alice@example.com');
    expect(push).toHaveBeenCalledWith('/lobby/CCCC');
  });

  it('skips checkName entirely and never opens the popup when already logged in', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedCreateLobby.mockResolvedValue({ lobby_id: 'DDDD', token: 't' });
    render(<WorldMapOverlay />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create lobby' }));
      await flush();
    });

    expect(mockedCheckName).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose a name')).not.toBeInTheDocument();
    expect(mockedCreateLobby).toHaveBeenCalledWith('Alice', '');
    expect(push).toHaveBeenCalledWith('/lobby/DDDD');
  });

  it('Cancel closes the blank name popup without submitting', () => {
    render(<WorldMapOverlay />);
    fireEvent.click(screen.getByRole('button', { name: 'Create lobby' }));
    expect(screen.getByText('Choose a name')).toBeInTheDocument();

    fireEvent.click(within(namePopup()).getByText('Cancel'));

    expect(screen.queryByText('Choose a name')).not.toBeInTheDocument();
    expect(mockedCheckName).not.toHaveBeenCalled();
  });

  it('opens the user menu and signs out, reverting to the logged-out button', () => {
    localStorage.setItem('playerName', 'Alice');
    localStorage.setItem('playerEmail', 'alice@example.com');
    render(<WorldMapOverlay />);

    expect(screen.getByRole('button', { name: 'Open user menu' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open user menu' }));
    expect(screen.getByText('Sign out')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Sign out'));

    expect(localStorage.getItem('playerName')).toBeNull();
    expect(localStorage.getItem('playerEmail')).toBeNull();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });
});
