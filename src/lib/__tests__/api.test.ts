import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BACKEND_URL } from '@/config';
import {
  checkClaimVerified,
  checkName,
  claimPendingWheel,
  confirmEmailVerification,
  createLobby,
  equipSkin,
  getInventory,
  getPlayerMessages,
  getPlayerRelics,
  logInUser,
  logOut,
  resolveAccountSession,
  spinWheel,
  verifyLoginCode,
} from '@/lib/api';
import { getStoredAccountToken, getStoredToken, setStoredAccountToken, setStoredToken } from '@/lib/http';

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
  setStoredAccountToken(null);
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

    expect(getStoredToken('abc')).toBe('tok-stored');
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
    setStoredToken('lobby-a', 'a-token');
    expect(getStoredToken('lobby-a')).toBe('a-token');
  });

  it('clears the stored token when set to null', () => {
    setStoredToken('lobby-a', 'another-token');
    expect(getStoredToken('lobby-a')).toBe('another-token');
    setStoredToken('lobby-a', null);
    expect(getStoredToken('lobby-a')).toBeNull();
  });

  it('keeps tokens for different lobbies independent -- regression test for the boss fight rejoin bug', () => {
    // Reproduces: join boss fight (token A), leave, create an unrelated
    // lobby (token B used to clobber the single global slot), leave that
    // too, then return to the boss fight -- token A must still be there.
    setStoredToken('bossfight-lobby', 'token-a');
    setStoredToken('new-lobby', 'token-b');

    expect(getStoredToken('bossfight-lobby')).toBe('token-a');
    expect(getStoredToken('new-lobby')).toBe('token-b');
  });
});

describe('account session token store', () => {
  it('round-trips a token through getStoredAccountToken/setStoredAccountToken', () => {
    setStoredAccountToken('acc-token');
    expect(getStoredAccountToken()).toBe('acc-token');
  });

  it('clears the stored token when set to null', () => {
    setStoredAccountToken('acc-token');
    setStoredAccountToken(null);
    expect(getStoredAccountToken()).toBeNull();
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

  it('stores the returned session token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, always_verify_email: false, session_token: 'sess-1' }),
    );
    await logInUser('Alice', 'a@example.com');
    expect(getStoredAccountToken()).toBe('sess-1');
  });

  it('does not touch the stored token when the response has none (requires_code branch)', async () => {
    setStoredAccountToken('previous-token');
    fetchMock.mockResolvedValue(jsonResponse({ success: false, requires_code: true }));
    await logInUser('Alice', 'a@example.com');
    expect(getStoredAccountToken()).toBe('previous-token');
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

  it('stores the returned session token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, always_verify_email: true, session_token: 'sess-2' }),
    );
    await verifyLoginCode('Alice', '123456');
    expect(getStoredAccountToken()).toBe('sess-2');
  });
});

describe('confirmEmailVerification', () => {
  it('stores the returned session token -- clicking the link is proof of inbox ownership', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, purpose: 'claim_wheel', session_token: 'sess-3' }),
    );
    await confirmEmailVerification('tok');
    expect(getStoredAccountToken()).toBe('sess-3');
  });

  it.each([
    [404, 'Invalid or expired link.'],
    [409, 'Name already claimed by a different email.'],
  ])('maps status %i to "%s"', async (status, message) => {
    fetchMock.mockResolvedValue(jsonResponse({}, status));
    await expect(confirmEmailVerification('tok')).rejects.toThrow(message);
  });
});

describe('checkClaimVerified', () => {
  it('stores the returned session token when verified', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ verified: true, session_token: 'sess-4' }));
    await expect(checkClaimVerified('Alice', 'alice@example.com')).resolves.toEqual({ verified: true });
    expect(getStoredAccountToken()).toBe('sess-4');
  });

  it('does not touch the stored token when not yet verified', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ verified: false }));
    await expect(checkClaimVerified('Alice', 'alice@example.com')).resolves.toEqual({ verified: false });
    expect(getStoredAccountToken()).toBeNull();
  });
});

describe('resolveAccountSession', () => {
  it('returns the resolved player on success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        name: 'Alice',
        email: 'alice@example.com',
        always_verify_email: false,
        email_verified: true,
      }),
    );
    await expect(resolveAccountSession('sess-1')).resolves.toEqual({
      name: 'Alice',
      email: 'alice@example.com',
      always_verify_email: false,
      email_verified: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/resolve_account_session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'sess-1' }),
    });
  });

  it('throws on an invalid or expired session', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Invalid or expired session.' }, 401));
    await expect(resolveAccountSession('bad-token')).rejects.toThrow('Invalid or expired session.');
  });
});

describe('logOut', () => {
  it('clears the stored token immediately, before the request resolves', async () => {
    setStoredAccountToken('sess-1');
    let resolveFetch: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const promise = logOut('sess-1');
    expect(getStoredAccountToken()).toBeNull();

    resolveFetch(jsonResponse({ success: true }));
    await promise;
  });

  it('still reports success when the revoke request fails (best-effort)', async () => {
    setStoredAccountToken('sess-1');
    fetchMock.mockResolvedValue(failingJsonResponse(500));
    await expect(logOut('sess-1')).resolves.toEqual({ success: true });
  });

  it('is a no-op success when there is no token to revoke', async () => {
    await expect(logOut(null)).resolves.toEqual({ success: true });
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('getPlayerMessages returns empty lists on a 403 (e.g. missing/stale token)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Missing or invalid session token.' }, 403),
    );
    await expect(getPlayerMessages('abc', 'Alice')).resolves.toEqual({
      messages: [],
      events: [],
    });
  });
});

describe('getPlayerMessages token attachment', () => {
  it('appends the stored session token as a query param', async () => {
    setStoredToken('abc', 'tok-42');
    fetchMock.mockResolvedValue(jsonResponse({ player: 'Alice', messages: [], events: [] }));

    await getPlayerMessages('abc', 'Alice');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/get_player_messages/abc/Alice?token=tok-42`,
      { method: 'GET', headers: undefined, body: undefined },
    );
  });

  it('URL-encodes the token', async () => {
    setStoredToken('abc', 'tok/with+special?chars');
    fetchMock.mockResolvedValue(jsonResponse({ player: 'Alice', messages: [], events: [] }));

    await getPlayerMessages('abc', 'Alice');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/get_player_messages/abc/Alice?token=${encodeURIComponent('tok/with+special?chars')}`,
      { method: 'GET', headers: undefined, body: undefined },
    );
  });

  it('omits the token param when no token is stored', async () => {
    setStoredToken('abc', null);
    fetchMock.mockResolvedValue(jsonResponse({ player: 'Alice', messages: [], events: [] }));

    await getPlayerMessages('abc', 'Alice');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/get_player_messages/abc/Alice`,
      { method: 'GET', headers: undefined, body: undefined },
    );
  });
});

describe('claimPendingWheel', () => {
  it('posts lobby_id/name/email and returns the response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, pending_verification: true }));

    const result = await claimPendingWheel('abc', 'Alice', 'alice@example.com');

    expect(result).toEqual({ success: true, pending_verification: true });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/claim_pending_wheel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobby_id: 'abc', name: 'Alice', email: 'alice@example.com' }),
    });
  });
});

describe('getInventory', () => {
  it('returns the equipped skin, owned skins, and unspun wheels', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        equipped_skin: 'frog_green_v1',
        skins: [{ skin: 'frog_gold_v1', count: 1 }],
        wheels: [{ id: 1, kind: 'normal' }],
      }),
    );

    await expect(getInventory('sess-1')).resolves.toEqual({
      equipped_skin: 'frog_green_v1',
      skins: [{ skin: 'frog_gold_v1', count: 1 }],
      wheels: [{ id: 1, kind: 'normal' }],
    });
  });

  it('throws on an invalid session', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Invalid or expired session.' }, 401));
    await expect(getInventory('bad')).rejects.toThrow('Invalid or expired session.');
  });
});

describe('equipSkin', () => {
  it('returns the newly equipped skin', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, equipped_skin: 'frog_gold_v1' }));
    await expect(equipSkin('sess-1', 'frog_gold_v1')).resolves.toEqual({
      success: true,
      equipped_skin: 'frog_gold_v1',
    });
  });

  it('maps 403 to an ownership error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'You do not own this skin.' }, 403));
    await expect(equipSkin('sess-1', 'frog_gold_v1')).rejects.toThrow('You do not own this skin.');
  });
});

describe('spinWheel', () => {
  it('returns the result skin', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, result_skin: 'frog_blue_v1' }));
    await expect(spinWheel('sess-1', 1)).resolves.toEqual({ success: true, result_skin: 'frog_blue_v1' });
  });

  it('maps 404 to an already-spun error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Wheel not found or already spun.' }, 404));
    await expect(spinWheel('sess-1', 1)).rejects.toThrow('Wheel not found or already spun.');
  });
});
