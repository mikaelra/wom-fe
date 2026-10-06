import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  postSteamLogin: vi.fn(),
  postSteamCreate: vi.fn(),
  postSteamLink: vi.fn(),
}));

import { postSteamCreate, postSteamLink, postSteamLogin } from '@/lib/api';
import { ApiError, getStoredAccountToken, setStoredAccountToken } from '@/lib/http';
import { completePendingSteamLink, createSteamAccount, startSteamLink, steamSignIn } from '@/lib/steamAccount';

const login = vi.mocked(postSteamLogin);
const create = vi.mocked(postSteamCreate);
const link = vi.mocked(postSteamLink);

function shell(ticket: string | null = 'abc', playerName: string | null = 'Gaben') {
  return {
    wom: {
      isSteam: true as const,
      getSteamTicket: vi.fn(async () => ticket),
      getSteamInfo: vi.fn(async () => ({ enabled: true, steamId: '765', playerName, appId: 4913070 })),
      quit: vi.fn(),
    },
  } as unknown as Pick<Window, 'wom'>;
}

beforeEach(() => {
  localStorage.clear();
  setStoredAccountToken(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('steamSignIn', () => {
  it('does nothing outside the Steam client', async () => {
    expect(await steamSignIn({} as Pick<Window, 'wom'>)).toEqual({ status: 'skipped' });
    expect(login).not.toHaveBeenCalled();
  });

  it('checks in with Steam when someone is already logged in', async () => {
    setStoredAccountToken('existing');
    link.mockResolvedValue({ status: 'ok', name: 'Oni' });
    expect(await steamSignIn(shell())).toEqual({ status: 'skipped' });
    expect(link).toHaveBeenCalledWith('abc', 'existing');
    expect(login).not.toHaveBeenCalled();
    expect(getStoredAccountToken()).toBe('existing');
  });

  it('stays quiet when that check-in is refused', async () => {
    setStoredAccountToken('existing');
    link.mockRejectedValue(new ApiError(409, 'linked elsewhere', 'linked_to_other_steam'));
    expect(await steamSignIn(shell())).toEqual({ status: 'skipped' });
    expect(getStoredAccountToken()).toBe('existing');
  });

  it('skips the check-in when Steam gives no ticket', async () => {
    setStoredAccountToken('existing');
    expect(await steamSignIn(shell(null))).toEqual({ status: 'skipped' });
    expect(link).not.toHaveBeenCalled();
  });

  it('does nothing when Steam gives no ticket', async () => {
    expect(await steamSignIn(shell(null))).toEqual({ status: 'skipped' });
    const failing = shell();
    vi.mocked(failing.wom!.getSteamTicket).mockRejectedValue(new Error('ipc'));
    expect(await steamSignIn(failing)).toEqual({ status: 'skipped' });
  });

  it('logs in a known Steam account like the login page would', async () => {
    localStorage.setItem('playerEmail', 'old@example.com');
    login.mockResolvedValue({ status: 'ok', name: 'Toad', session_token: 'sess' });
    expect(await steamSignIn(shell())).toEqual({ status: 'signed-in', name: 'Toad' });
    expect(login).toHaveBeenCalledWith('abc');
    expect(getStoredAccountToken()).toBe('sess');
    expect(localStorage.getItem('playerName')).toBe('Toad');
    expect(localStorage.getItem('playerEmail')).toBeNull();
  });

  it('reports a new Steam account with its Steam name', async () => {
    login.mockResolvedValue({ status: 'new' });
    expect(await steamSignIn(shell())).toEqual({ status: 'new', steamName: 'Gaben' });
    const nameless = shell('abc', null);
    expect(await steamSignIn(nameless)).toEqual({ status: 'new', steamName: null });
  });
});

describe('createSteamAccount', () => {
  it('creates and logs in', async () => {
    create.mockResolvedValue({ status: 'ok', name: 'Toad', session_token: 'sess' });
    await createSteamAccount('Toad', shell());
    expect(create).toHaveBeenCalledWith('abc', 'Toad');
    expect(getStoredAccountToken()).toBe('sess');
  });

  it('needs Steam', async () => {
    await expect(createSteamAccount('Toad', shell(null))).rejects.toThrow('Steam is not available.');
  });

  it('refuses an incomplete answer', async () => {
    create.mockResolvedValue({ status: 'ok' });
    await expect(createSteamAccount('Toad', shell())).rejects.toThrow();
  });
});

describe('completePendingSteamLink', () => {
  it('does nothing unless the player chose "I already have an account"', async () => {
    setStoredAccountToken('sess');
    expect(await completePendingSteamLink(shell())).toBeNull();
    expect(link).not.toHaveBeenCalled();
  });

  it('links the logged-in account', async () => {
    startSteamLink();
    setStoredAccountToken('sess');
    link.mockResolvedValue({ status: 'ok', name: 'Toad' });
    expect(await completePendingSteamLink(shell())).toBeNull();
    expect(link).toHaveBeenCalledWith('abc', 'sess');
    expect(localStorage.getItem('steamLinkPending')).toBeNull();
  });

  it('waits for a login and a ticket', async () => {
    startSteamLink();
    expect(await completePendingSteamLink(shell())).toBeNull();
    setStoredAccountToken('sess');
    expect(await completePendingSteamLink(shell(null))).toBeNull();
    expect(link).not.toHaveBeenCalled();
  });

  it("passes on the backend's reason it couldn't link", async () => {
    startSteamLink();
    setStoredAccountToken('sess');
    link.mockRejectedValue(new ApiError(409, 'Your Steam account already has its own progress.', 'steam_account_in_use'));
    expect(await completePendingSteamLink(shell())).toBe('Your Steam account already has its own progress.');
    link.mockRejectedValue(new Error('offline'));
    startSteamLink();
    expect(await completePendingSteamLink(shell())).toBe('Could not link your Steam account.');
  });
});
