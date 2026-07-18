import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import HomeOverlay from '@/components/home/HomeOverlay';
import { checkName, logInUser, verifyLoginCode, createLobby, joinLobby } from '@/lib/api';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';

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
  getBossfightLobby: vi.fn(),
  getPlayerRelics: vi.fn(),
  logOut: vi.fn(),
}));

vi.mock('@/lib/useBossfightCountdown', () => ({ useBossfightCountdown: vi.fn() }));

const mockedCheckName = vi.mocked(checkName);
const mockedLogInUser = vi.mocked(logInUser);
const mockedVerifyLoginCode = vi.mocked(verifyLoginCode);
const mockedCreateLobby = vi.mocked(createLobby);
const mockedJoinLobby = vi.mocked(joinLobby);
const mockedUseBossfightCountdown = vi.mocked(useBossfightCountdown);

const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  push.mockClear();
  mockedCheckName.mockReset();
  mockedLogInUser.mockReset();
  mockedVerifyLoginCode.mockReset();
  mockedCreateLobby.mockReset();
  mockedJoinLobby.mockReset();
  mockedUseBossfightCountdown.mockReturnValue({ secondsUntil: null, raidMins: null, raidSecs: null });
});

afterEach(() => {
  localStorage.clear();
});

describe('HomeOverlay', () => {
  it('shows the logged-out buttons and inputs when there is no stored playerName', () => {
    render(<HomeOverlay />);
    expect(screen.getByText('Log In')).toBeInTheDocument();
    expect(screen.getByText('Create User')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Lobby code')).toBeInTheDocument();
  });

  it('creates a lobby directly for an unclaimed name, with no modal', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    mockedCreateLobby.mockResolvedValue({ lobby_id: 'AAAA', token: 't' });
    render(<HomeOverlay />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Create Lobby'));
      await flush();
    });

    expect(mockedCheckName).toHaveBeenCalledWith('Alice');
    expect(mockedCreateLobby).toHaveBeenCalledWith('Alice', '');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(push).toHaveBeenCalledWith('/lobby/AAAA');
    expect(screen.queryByText('This name is claimed. Type your email if you have claimed this username.')).not.toBeInTheDocument();
  });

  it('shows the claimed-name modal instead of creating, when checkName reports claimed', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    render(<HomeOverlay />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Create Lobby'));
      await flush();
    });

    expect(screen.getByText('This name is claimed. Type your email if you have claimed this username.')).toBeInTheDocument();
    expect(mockedCreateLobby).not.toHaveBeenCalled();
  });

  it('completes a pending create via the email-login modal (no code required)', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true });
    mockedCreateLobby.mockResolvedValue({ lobby_id: 'BBBB', token: 't' });
    render(<HomeOverlay />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Create Lobby'));
      await flush();
    });

    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Log in'));
      await flush();
    });

    // The modal itself doesn't reactively close here -- in production the
    // page navigates away (router.push unmounts this component); router is
    // mocked in this test, so what matters is that the right calls fired.
    expect(mockedCreateLobby).toHaveBeenCalledWith('Alice', 'alice@example.com');
    expect(push).toHaveBeenCalledWith('/lobby/BBBB');
  });

  it('completes a pending join (not create) via the email-login modal, proving the pending action threads through', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true });
    mockedJoinLobby.mockResolvedValue(undefined);
    render(<HomeOverlay />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Lobby code'), { target: { value: 'ZZZZ' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Join'));
      await flush();
    });

    fireEvent.change(screen.getByPlaceholderText('email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Log in'));
      await flush();
    });

    expect(mockedJoinLobby).toHaveBeenCalledWith('ZZZZ', 'Alice', 'alice@example.com');
    expect(mockedCreateLobby).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/lobby/ZZZZ');
  });

  it('shows the code step when requires_code is true, and completes on a correct code', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: true });
    mockedVerifyLoginCode.mockRejectedValueOnce(new Error('Wrong code'));
    mockedCreateLobby.mockResolvedValue({ lobby_id: 'CCCC', token: 't' });
    render(<HomeOverlay />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Create Lobby'));
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
    expect(mockedCreateLobby).not.toHaveBeenCalled();

    mockedVerifyLoginCode.mockResolvedValueOnce({ success: true });
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Verify'));
      await flush();
    });

    expect(mockedVerifyLoginCode).toHaveBeenCalledWith('Alice', '123456');
    expect(mockedCreateLobby).toHaveBeenCalledWith('Alice', 'alice@example.com');
    expect(push).toHaveBeenCalledWith('/lobby/CCCC');
  });

  it('skips checkName entirely and creates directly when already logged in', async () => {
    localStorage.setItem('playerName', 'Alice');
    mockedCreateLobby.mockResolvedValue({ lobby_id: 'DDDD', token: 't' });
    render(<HomeOverlay />);

    await act(async () => {
      fireEvent.click(screen.getByText('Create Lobby'));
      await flush();
    });

    expect(mockedCheckName).not.toHaveBeenCalled();
    expect(mockedCreateLobby).toHaveBeenCalledWith('Alice', '');
    expect(push).toHaveBeenCalledWith('/lobby/DDDD');
  });

  it('"Choose new name" closes the modal and clears the typed name', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    render(<HomeOverlay />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Create Lobby'));
      await flush();
    });
    expect(screen.getByText('This name is claimed. Type your email if you have claimed this username.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Choose new name'));

    expect(screen.queryByText('This name is claimed. Type your email if you have claimed this username.')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your name')).toHaveValue('');
  });

  it('logs out, clearing localStorage and reverting to the logged-out UI', () => {
    localStorage.setItem('playerName', 'Alice');
    localStorage.setItem('playerEmail', 'alice@example.com');
    render(<HomeOverlay />);
    expect(screen.getByText('Logged in as: Alice')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Logout'));

    expect(localStorage.getItem('playerName')).toBeNull();
    expect(localStorage.getItem('playerEmail')).toBeNull();
    expect(screen.getByText('Log In')).toBeInTheDocument();
  });
});
