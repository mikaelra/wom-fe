import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import LobbyPage from '@/app/lobby/[lobbyId]/page';
import { checkName, logInUser, verifyLoginCode, joinLobby } from '@/lib/api';

const push = vi.fn();
const useParams = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => useParams(),
}));

vi.mock('@/lib/api', () => ({
  checkName: vi.fn(),
  logInUser: vi.fn(),
  verifyLoginCode: vi.fn(),
  joinLobby: vi.fn(),
}));

// The socket-preview effect (player-list preview before joining) only runs
// when a join token from an earlier visit is already stored -- returning
// null disables that whole path, which is out of scope for this join-form/
// auth-flow test. @/lib/socket is still mocked so the module resolves, but
// is never actually exercised as a consequence.
vi.mock('@/lib/http', () => ({ getStoredToken: () => null }));
vi.mock('@/lib/socket', () => ({
  getSocket: () => ({ emit: vi.fn() }),
  subscribe: () => () => {},
}));

// @react-three/fiber's real Canvas needs a WebGL context jsdom can't
// provide -- rendering children directly avoids that without needing any
// R3F-specific stubs (this page doesn't call useFrame/useThree itself).
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

// LobbyScene is real 3D scene content (out of scope, no dedicated suite
// planned). LobbyOverlay already has its own full RTL suite; InGameGuide is
// a presentational welcome-tour overlay unrelated to auth-forms wiring.
// None of the three are this test's focus.
vi.mock('@/components/lobby/LobbyScene', () => ({ default: () => null }));
vi.mock('@/components/lobby/LobbyOverlay', () => ({ default: () => null }));
vi.mock('@/components/lobby/InGameGuide', () => ({ default: () => null }));

const mockedCheckName = vi.mocked(checkName);
const mockedLogInUser = vi.mocked(logInUser);
const mockedVerifyLoginCode = vi.mocked(verifyLoginCode);
const mockedJoinLobby = vi.mocked(joinLobby);

const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  push.mockClear();
  useParams.mockReturnValue({ lobbyId: 'zzzz' });
  mockedCheckName.mockReset();
  mockedLogInUser.mockReset();
  mockedVerifyLoginCode.mockReset();
  mockedJoinLobby.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe('LobbyPage join form', () => {
  // "Join Lobby" is both the popup's <h1> heading and its submit button's
  // text -- getByRole disambiguates the button specifically.
  const joinLobbyButton = () => screen.getByRole('button', { name: 'Join Lobby' });

  it('shows "Invalid lobby." when there is no lobbyId', () => {
    useParams.mockReturnValue({});
    render(<LobbyPage />);
    expect(screen.getByText('Invalid lobby.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument();
  });

  it('shows the join form when logged out', () => {
    render(<LobbyPage />);
    expect(joinLobbyButton()).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
  });

  it('auto-joins directly via an invite link when already logged in, skipping the form', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedJoinLobby.mockResolvedValue(undefined);
    render(<LobbyPage />);

    await flush();

    expect(mockedCheckName).not.toHaveBeenCalled();
    expect(mockedJoinLobby).toHaveBeenCalledWith('zzzz', 'Alice', '');
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument();
  });

  it('still reveals the game UI when the auto-join request fails', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedJoinLobby.mockRejectedValue(new Error('Lobby full'));
    render(<LobbyPage />);

    await flush();

    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument();
  });

  it('joins for an unclaimed name', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    mockedJoinLobby.mockResolvedValue(undefined);
    render(<LobbyPage />);

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(joinLobbyButton());
      await flush();
    });

    expect(mockedCheckName).toHaveBeenCalledWith('Alice');
    expect(mockedJoinLobby).toHaveBeenCalledWith('zzzz', 'Alice', '');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument();
  });

  it('shows the email step for a claimed name, and joins on successful login', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true });
    mockedJoinLobby.mockResolvedValue(undefined);
    render(<LobbyPage />);

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(joinLobbyButton());
      await flush();
    });
    expect(
      screen.getByText('This name is claimed. Enter your email to log in or pick a new name.'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Log in'));
      await flush();
    });

    expect(mockedJoinLobby).toHaveBeenCalledWith('zzzz', 'Alice', 'alice@example.com');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(localStorage.getItem('playerEmail')).toBe('alice@example.com');
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument();
  });

  it('shows the code step when requires_code is true, and completes on a correct code', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: true });
    mockedVerifyLoginCode.mockRejectedValueOnce(new Error('Wrong code'));
    mockedJoinLobby.mockResolvedValue(undefined);
    render(<LobbyPage />);

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(joinLobbyButton());
      await flush();
    });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'alice@example.com' } });
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
    expect(mockedJoinLobby).not.toHaveBeenCalled();

    mockedVerifyLoginCode.mockResolvedValueOnce({ success: true });
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Verify'));
      await flush();
    });

    expect(mockedVerifyLoginCode).toHaveBeenCalledWith('Alice', '123456');
    expect(mockedJoinLobby).toHaveBeenCalledWith('zzzz', 'Alice', 'alice@example.com');
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument();
  });
});
