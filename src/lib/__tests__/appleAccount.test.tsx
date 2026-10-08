import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  postAppleLogin: vi.fn(),
  postAppleCreate: vi.fn(),
  postAppleLink: vi.fn(),
}));

import { postAppleCreate, postAppleLink, postAppleLogin } from '@/lib/api';
import { ApiError, getStoredAccountToken, setStoredAccountToken } from '@/lib/http';
import {
  appleSignIn,
  completePendingAppleLink,
  createAppleAccount,
  startAppleLink,
} from '@/lib/appleAccount';

const login = vi.mocked(postAppleLogin);
const create = vi.mocked(postAppleCreate);
const link = vi.mocked(postAppleLink);

function store(jws: string | null = 'jws') {
  return {
    appTransaction: vi.fn(async () => {
      if (jws === null) throw new Error('Needs iOS 16');
      return { jws };
    }),
  };
}

beforeEach(() => {
  localStorage.clear();
  setStoredAccountToken(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('appleSignIn', () => {
  it('does nothing outside the iOS app', async () => {
    const s = store();
    expect(await appleSignIn(s, false)).toEqual({ status: 'skipped' });
    expect(s.appTransaction).not.toHaveBeenCalled();
  });

  it('does nothing before iOS 16 (no AppTransaction)', async () => {
    expect(await appleSignIn(store(null), true)).toEqual({ status: 'skipped' });
    expect(login).not.toHaveBeenCalled();
  });

  it('checks in with the Apple account when someone is already logged in', async () => {
    setStoredAccountToken('existing');
    link.mockResolvedValue({ status: 'ok', name: 'Oni' });
    expect(await appleSignIn(store(), true)).toEqual({ status: 'skipped' });
    expect(link).toHaveBeenCalledWith('jws', 'existing');
    expect(login).not.toHaveBeenCalled();
  });

  it('stays quiet when that check-in is refused', async () => {
    setStoredAccountToken('existing');
    link.mockRejectedValue(new ApiError(409, 'linked elsewhere', 'linked_to_other_apple'));
    expect(await appleSignIn(store(), true)).toEqual({ status: 'skipped' });
    expect(getStoredAccountToken()).toBe('existing');
  });

  it('logs in a known Apple account', async () => {
    localStorage.setItem('playerEmail', 'old@example.com');
    login.mockResolvedValue({ status: 'ok', name: 'Oni', session_token: 'sess' });
    expect(await appleSignIn(store(), true)).toEqual({ status: 'signed-in', name: 'Oni' });
    expect(getStoredAccountToken()).toBe('sess');
    expect(localStorage.getItem('playerName')).toBe('Oni');
    expect(localStorage.getItem('playerEmail')).toBeNull();
  });

  it('reports a new Apple account', async () => {
    login.mockResolvedValue({ status: 'new' });
    expect(await appleSignIn(store(), true)).toEqual({ status: 'new' });
    expect(getStoredAccountToken()).toBeNull();
  });
});

describe('createAppleAccount', () => {
  it('creates and logs in', async () => {
    create.mockResolvedValue({ status: 'ok', name: 'Oni', session_token: 'sess' });
    await createAppleAccount('Oni', store(), true);
    expect(create).toHaveBeenCalledWith('jws', 'Oni');
    expect(getStoredAccountToken()).toBe('sess');
  });

  it('needs the AppTransaction', async () => {
    await expect(createAppleAccount('Oni', store(null), true)).rejects.toThrow('Apple is not available.');
  });

  it('fails on an answer without a session', async () => {
    create.mockResolvedValue({ status: 'ok' });
    await expect(createAppleAccount('Oni', store(), true)).rejects.toThrow('Could not create the account.');
  });
});

describe('completePendingAppleLink', () => {
  it('does nothing unless the player asked to link', async () => {
    setStoredAccountToken('sess');
    expect(await completePendingAppleLink(store(), true)).toBeNull();
    expect(link).not.toHaveBeenCalled();
  });

  it('links after a login, once', async () => {
    startAppleLink();
    setStoredAccountToken('sess');
    link.mockResolvedValue({ status: 'ok', name: 'Oni' });
    expect(await completePendingAppleLink(store(), true)).toBeNull();
    expect(link).toHaveBeenCalledWith('jws', 'sess');
    expect(await completePendingAppleLink(store(), true)).toBeNull();
    expect(link).toHaveBeenCalledTimes(1);
  });

  it('waits for a login and the AppTransaction', async () => {
    startAppleLink();
    expect(await completePendingAppleLink(store(), true)).toBeNull();
    setStoredAccountToken('sess');
    expect(await completePendingAppleLink(store(null), true)).toBeNull();
    expect(link).not.toHaveBeenCalled();
  });

  it("returns the backend's refusal", async () => {
    startAppleLink();
    setStoredAccountToken('sess');
    link.mockRejectedValue(new ApiError(409, 'Your Apple account already has its own progress.', 'apple_account_in_use'));
    expect(await completePendingAppleLink(store(), true)).toBe('Your Apple account already has its own progress.');
  });

  it('has a fallback message', async () => {
    startAppleLink();
    setStoredAccountToken('sess');
    link.mockRejectedValue(new Error('offline'));
    expect(await completePendingAppleLink(store(), true)).toBe('Could not link your Apple account.');
  });
});
