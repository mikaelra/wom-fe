import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BACKEND_URL } from '@/config';
import {
  checkName,
  createLobby,
  getPlayerMessages,
  getPlayerRelics,
  getStoredToken,
  logInUser,
  setStoredToken,
  verifyLoginCode,
} from '@/lib/api';

const jsonResponse = (data: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }) as unknown as Response;

const failingJsonResponse = (status: number) =>
  ({
    ok: false,
    status,
    json: async () => {
      throw new Error('not json');
    },
  }) as unknown as Response;

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createLobby', () => {
  it('posts name and email and returns the lobby id and session token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ lobby_id: 'abc', token: 'tok-1' }));

    const result = await createLobby('Alice', 'alice@example.com');

    expect(result).toEqual({ lobby_id: 'abc', token: 'tok-1' });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/create_lobby`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }),
    });
  });

  it('stores the returned session token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ lobby_id: 'abc', token: 'tok-stored' }));

    await createLobby('Alice', 'alice@example.com');

    expect(getStoredToken()).toBe('tok-stored');
  });

  it('throws the backend error message on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'This name is already claimed.' }, 403));

    await expect(createLobby('Alice', 'x@example.com')).rejects.toThrow(
      'This name is already claimed.',
    );
  });
});

describe('session token store', () => {
  it('round-trips a token through getStoredToken/setStoredToken', () => {
    setStoredToken('a-token');
    expect(getStoredToken()).toBe('a-token');
  });

  it('clears the stored token when set to null', () => {
    setStoredToken('another-token');
    expect(getStoredToken()).toBe('another-token');
    setStoredToken(null);
    expect(getStoredToken()).toBeNull();
  });
});

describe('logInUser', () => {
  it('maps 403 to a wrong-email error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Email does not match.' }, 403));
    await expect(logInUser('Alice', 'x@example.com')).rejects.toThrow('Wrong email');
  });

  it('passes through the verification-required response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, requires_code: true }));
    await expect(logInUser('Alice', 'a@example.com')).resolves.toEqual({
      success: false,
      requires_code: true,
    });
  });
});

describe('verifyLoginCode', () => {
  it.each([
    [403, 'Wrong code'],
    [410, 'Code expired'],
    [429, 'Too many attempts'],
  ])('maps status %i to "%s"', async (status, message) => {
    fetchMock.mockResolvedValue(jsonResponse({}, status));
    await expect(verifyLoginCode('Alice', '123456')).rejects.toThrow(message);
  });

  it('returns the payload on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, always_verify_email: true }));
    await expect(verifyLoginCode('Alice', '123456')).resolves.toEqual({
      success: true,
      always_verify_email: true,
    });
  });
});

describe('checkName', () => {
  it('falls back to a generic message when the error body is not json', async () => {
    fetchMock.mockResolvedValue(failingJsonResponse(500));
    await expect(checkName('Alice')).rejects.toThrow('Failed to check name');
  });
});

describe('error-swallowing endpoints', () => {
  // These two return empty data instead of throwing on failure — pinned
  // here since callers rely on it, but it does hide real outages.
  it('getPlayerRelics returns an empty list on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    await expect(getPlayerRelics('Alice')).resolves.toEqual({ relics: [] });
  });

  it('getPlayerMessages returns empty lists on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    await expect(getPlayerMessages('abc', 'Alice')).resolves.toEqual({
      messages: [],
      events: [],
    });
  });
});
