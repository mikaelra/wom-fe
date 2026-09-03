import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BACKEND_URL, PROTOCOL_VERSION } from '@/config';
import {
  checkClaimVerified,
  checkName,
  claimPendingArtifact,
  claimPendingWheel,
  equipCosmetic,
  getArtifactLedger,
  confirmEmailVerification,
  createLobby,
  equipSkin,
  getInventory,
  getPlayerMessages,
  getActiveRankedLobby,
  getPlayerProfile,
  getPlayerRelics,
  getRankedProfile,
  getMarketTrades,
  getShopProducts,
  getMyAiStatus,
  toggleMyAi,
  saveMyAiSettings,
  getMyAiPersonality,
  getMyAiMatches,
  getWellProfile,
  getWheelTables,
  getTradeUpRules,
  joinRankedQueue,
  leaveRankedQueue,
  logInUser,
  logOut,
  postCheckout,
  resolveAccountSession,
  spinWheel,
  tradeUp,
  verifyLoginCode,
} from '@/lib/api';
import { ApiError, getStoredAccountToken, getStoredToken, setStoredAccountToken, setStoredToken } from '@/lib/http';

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
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
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

describe('joinRankedQueue', () => {
  it('posts name and returns the queue status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'queued' }));

    const result = await joinRankedQueue('Alice');

    expect(result).toEqual({ status: 'queued' });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/ranked/queue/join`, {
      method: 'POST',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });
  });
});

describe('leaveRankedQueue', () => {
  it('posts name and returns was_queued', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'left', was_queued: true }));

    const result = await leaveRankedQueue('Alice');

    expect(result).toEqual({ status: 'left', was_queued: true });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/ranked/queue/leave`, {
      method: 'POST',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });
  });
});

describe('getRankedProfile', () => {
  it('GETs the player\'s tier and games played', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tier: 'Djinn I', ranked_games_played: 12 }));

    const result = await getRankedProfile('Alice');

    expect(result).toEqual({ tier: 'Djinn I', ranked_games_played: 12 });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/ranked/profile/Alice`, {
      method: 'GET',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION) },
      body: undefined,
    });
  });

  it('URL-encodes the player name', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tier: null, ranked_games_played: 0 }));

    await getRankedProfile('A B');

    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/ranked/profile/A%20B`, expect.anything());
  });
});

describe('getActiveRankedLobby', () => {
  it('GETs whether the player has a currently unfinished ranked match', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        lobby_id: 'RNKD',
        token: 'tok-1',
        ranked_countdown_deadline: '2026-01-01T00:00:00Z',
        started: false,
      }),
    );

    const result = await getActiveRankedLobby('Alice');

    expect(result).toEqual({
      lobby_id: 'RNKD',
      token: 'tok-1',
      ranked_countdown_deadline: '2026-01-01T00:00:00Z',
      started: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/ranked/active/Alice`, {
      method: 'GET',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION) },
      body: undefined,
    });
  });

  it('URL-encodes the player name', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ lobby_id: null, token: null, ranked_countdown_deadline: null, started: false }),
    );

    await getActiveRankedLobby('A B');

    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/ranked/active/A%20B`, expect.anything());
  });
});

describe('getWellProfile', () => {
  it('GETs the player\'s well wins and discovered rewards', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        well_wins: 3,
        rewards: [
          { reward: '2_gold', count: 2, first_awarded_at: '2026-01-01T00:00:00Z', expected_share: 5 / 32 },
        ],
      }),
    );

    const result = await getWellProfile('Alice');

    expect(result).toEqual({
      well_wins: 3,
      rewards: [
        { reward: '2_gold', count: 2, first_awarded_at: '2026-01-01T00:00:00Z', expected_share: 5 / 32 },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/well/profile/Alice`, {
      method: 'GET',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION) },
      body: undefined,
    });
  });

  it('URL-encodes the player name', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ well_wins: 0, rewards: [] }));

    await getWellProfile('A B');

    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/well/profile/A%20B`, expect.anything());
  });
});

describe('getPlayerProfile', () => {
  it('GETs the player\'s account-created date, games played, wins, and kills', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ created_at: '2026-03-05T12:30:00Z', played_games: 23, wins: 7, kills: 41 })
    );

    const result = await getPlayerProfile('Alice');

    expect(result).toEqual({ created_at: '2026-03-05T12:30:00Z', played_games: 23, wins: 7, kills: 41 });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/player/profile/Alice`, {
      method: 'GET',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION) },
      body: undefined,
    });
  });

  it('URL-encodes the player name', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ created_at: null, played_games: 0, wins: 0, kills: 0 }));

    await getPlayerProfile('A B');

    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/player/profile/A%20B`, expect.anything());
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
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
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
      instakill: false,
    });
  });

  it('getPlayerMessages returns empty lists on a 403 (e.g. missing/stale token)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Missing or invalid session token.' }, 403),
    );
    await expect(getPlayerMessages('abc', 'Alice')).resolves.toEqual({
      messages: [],
      events: [],
      instakill: false,
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
      { method: 'GET', headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION) }, body: undefined },
    );
  });

  it('URL-encodes the token', async () => {
    setStoredToken('abc', 'tok/with+special?chars');
    fetchMock.mockResolvedValue(jsonResponse({ player: 'Alice', messages: [], events: [] }));

    await getPlayerMessages('abc', 'Alice');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/get_player_messages/abc/Alice?token=${encodeURIComponent('tok/with+special?chars')}`,
      { method: 'GET', headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION) }, body: undefined },
    );
  });

  it('omits the token param when no token is stored', async () => {
    setStoredToken('abc', null);
    fetchMock.mockResolvedValue(jsonResponse({ player: 'Alice', messages: [], events: [] }));

    await getPlayerMessages('abc', 'Alice');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/get_player_messages/abc/Alice`,
      { method: 'GET', headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION) }, body: undefined },
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
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
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

describe('getShopProducts', () => {
  it('returns the product list as served', async () => {
    const body = {
      shop_enabled: true,
      terms_version: '2026-07',
      products: [
        {
          id: 'wheel_special', name: 'Special Wheel', price_cents: 500, currency: 'usd',
          kind: 'wheel', odds_denominator: 30000,
          odds: [{ skin: 'frog_silver_v1', weight: 18900, probability: 0.63 }],
        },
        { id: 'skin_cherub', name: 'Cherub', price_cents: 50000, currency: 'usd', kind: 'skin', skin: 'cherub_v1' },
      ],
    };
    fetchMock.mockResolvedValue(jsonResponse(body));
    await expect(getShopProducts()).resolves.toEqual(body);
  });

  it('returns shop_enabled: false with an empty product list when disabled', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ shop_enabled: false, terms_version: '2026-07', products: [] }));
    await expect(getShopProducts()).resolves.toEqual({
      shop_enabled: false, terms_version: '2026-07', products: [],
    });
  });
});

describe('postCheckout', () => {
  it('returns the checkout url and order id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ checkout_url: 'https://checkout.stripe.com/pay/cs_1', order_id: 42 }));
    await expect(postCheckout('sess-1', 'wheel_special')).resolves.toEqual({
      checkout_url: 'https://checkout.stripe.com/pay/cs_1', order_id: 42,
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ token: 'sess-1', product: 'wheel_special', confirm_duplicate: undefined });
  });

  it('surfaces the error code on ApiError so callers can branch without matching prose', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Email not verified.', code: 'email_unverified' }, 403));
    const err = await postCheckout('sess-1', 'wheel_special').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('email_unverified');
    expect((err as ApiError).status).toBe(403);
  });

  it('passes confirm_duplicate through to the request body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ checkout_url: 'https://x', order_id: 1 }));
    await postCheckout('sess-1', 'skin_cherub', true);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ token: 'sess-1', product: 'skin_cherub', confirm_duplicate: true });
  });

  it('passes quantity through to the request body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ checkout_url: 'https://x', order_id: 1 }));
    await postCheckout('sess-1', 'wheel_special', false, 3);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      token: 'sess-1', product: 'wheel_special', confirm_duplicate: false, quantity: 3,
    });
  });
});

describe('getWheelTables', () => {
  it('returns both odds tables as served', async () => {
    const body = {
      normal: [{ skin: 'frog_blue_v1', weight: 1, probability: 0.16666666666666666 }],
      special: [{ skin: 'frog_silver_v1', weight: 18900, probability: 0.63 }],
    };
    fetchMock.mockResolvedValue(jsonResponse(body));
    await expect(getWheelTables()).resolves.toEqual(body);
  });
});

describe('getTradeUpRules', () => {
  it('returns the ladder as served', async () => {
    const body = { rules: { frog_blue_v1: { cost: 5, output_kind: 'wheel', output: 'special' } } };
    fetchMock.mockResolvedValue(jsonResponse(body));
    await expect(getTradeUpRules()).resolves.toEqual(body);
  });
});

describe('tradeUp', () => {
  it('returns the trade-up result', async () => {
    const body = {
      success: true, trade_up_id: 900, output_kind: 'wheel', output: 'special', wheel_id: 501, remaining: 0,
    };
    fetchMock.mockResolvedValue(jsonResponse(body));
    await expect(tradeUp('sess-1', 'frog_blue_v1')).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/inventory/trade_up`, expect.objectContaining({
      body: JSON.stringify({ token: 'sess-1', skin: 'frog_blue_v1' }),
    }));
  });

  it('maps insufficient_copies to a friendlier message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'You need 5 copies.', code: 'insufficient_copies' }, 409));
    await expect(tradeUp('sess-1', 'frog_blue_v1')).rejects.toThrow('You no longer have enough copies.');
  });

  it('maps email_unverified to a friendlier message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Email not verified.', code: 'email_unverified' }, 403));
    await expect(tradeUp('sess-1', 'frog_blue_v1')).rejects.toThrow('Verify your email to trade up.');
  });

  it('maps not_tradeable to a friendlier message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "This skin can't be traded up.", code: 'not_tradeable' }, 400));
    await expect(tradeUp('sess-1', 'frog_green_v1')).rejects.toThrow("This skin can't be traded up.");
  });

  it('passes through an unmapped error code unchanged', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Invalid or expired session.', code: 'invalid_session' }, 401));
    await expect(tradeUp('bad', 'frog_blue_v1')).rejects.toThrow('Invalid or expired session.');
  });
});

describe('confirmEmailVerification', () => {
  it('accepts a purpose this build does not know about', async () => {
    // The schema used to pin `purpose` to a closed enum, which turned a new
    // backend purpose into a hard failure of work the backend had already
    // done. Kept loose on purpose.
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, purpose: 'claim_artifact', session_token: 'sess' }),
    );

    await expect(confirmEmailVerification('tok')).resolves.toMatchObject({
      purpose: 'claim_artifact',
    });
  });

  it('stores the session token the link returns', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, purpose: 'claim_artifact', session_token: 'sess-art' }),
    );

    await confirmEmailVerification('tok');

    expect(getStoredAccountToken()).toBe('sess-art');
  });
});

describe('getInventory (artifact fields)', () => {
  it('carries the equipped cosmetic and the caller\'s artifact through', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        equipped_skin: 'frog_green_v1',
        skins: [],
        wheels: [],
        equipped_cosmetic: 'artifact_v1',
        artifact: { ordinal: 4, discovered_at: '2026-09-01T00:00:00+00:00', cosmetic: 'artifact_v1' },
      }),
    );

    const result = await getInventory('sess-1');

    expect(result.equipped_cosmetic).toBe('artifact_v1');
    expect(result.artifact?.ordinal).toBe(4);
  });

  it('accepts a response with no artifact fields at all', async () => {
    // Deploy independence: a wom-be built before the artifact system omits
    // these entirely, and the inventory page must still render.
    fetchMock.mockResolvedValue(
      jsonResponse({ equipped_skin: 'frog_green_v1', skins: [], wheels: [] }),
    );

    const result = await getInventory('sess-1');

    expect(result.equipped_cosmetic).toBeUndefined();
    expect(result.artifact).toBeUndefined();
  });

  it('accepts a null artifact for an account that has never found one', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        equipped_skin: 'frog_green_v1',
        skins: [],
        wheels: [],
        equipped_cosmetic: null,
        artifact: null,
      }),
    );

    await expect(getInventory('sess-1')).resolves.toMatchObject({ artifact: null });
  });
});

describe('equipCosmetic', () => {
  it('posts the cosmetic and returns what is now equipped', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, equipped_cosmetic: 'artifact_v1' }));

    const result = await equipCosmetic('tok', 'artifact_v1');

    expect(result.equipped_cosmetic).toBe('artifact_v1');
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/inventory/equip_cosmetic`, {
      method: 'POST',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'tok', cosmetic: 'artifact_v1' }),
    });
  });

  it('unequips by sending an empty string, and accepts a null result', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, equipped_cosmetic: null }));

    await expect(equipCosmetic('tok', '')).resolves.toEqual({
      success: true,
      equipped_cosmetic: null,
    });
  });

  it('turns a 403 into an ownership message', async () => {
    fetchMock.mockResolvedValue(failingJsonResponse(403));

    await expect(equipCosmetic('tok', 'artifact_v1')).rejects.toThrow(
      'You do not own this cosmetic.',
    );
  });
});

describe('getArtifactLedger', () => {
  it('POSTs the session token with a keyset cursor', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        artifacts: [{ ordinal: 1, finder_name: 'Alice', discovered_at: '2026-09-01T00:00:00+00:00' }],
        total: 1,
        current_chance: 0.001,
      }),
    );

    const result = await getArtifactLedger('tok', 0, 100);

    expect(result.artifacts[0].finder_name).toBe('Alice');
    expect(result.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/artifacts/ledger`, {
      method: 'POST',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'tok', after: 0, limit: 100 }),
    });
  });

  it('passes the cursor through so pages continue from the last ordinal', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ artifacts: [], total: 5, current_chance: 1 }));

    await getArtifactLedger('tok', 3, 50);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/artifacts/ledger`,
      expect.objectContaining({ body: JSON.stringify({ token: 'tok', after: 3, limit: 50 }) }),
    );
  });

  it('surfaces a 403 as an ApiError so callers can show "sealed", not an error', async () => {
    // The ledger is readable only by someone who has discovered an artifact.
    // That is a state, not a fault, and the component distinguishes them by
    // status -- so the status has to survive.
    fetchMock.mockResolvedValue(failingJsonResponse(403));

    await expect(getArtifactLedger('tok')).rejects.toMatchObject({ status: 403 });
  });

  it('accepts a null discovery date', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        artifacts: [{ ordinal: 1, finder_name: 'Alice', discovered_at: null }],
        total: 1,
        current_chance: 0.001,
      }),
    );

    await expect(getArtifactLedger('tok')).resolves.toMatchObject({
      artifacts: [{ discovered_at: null }],
    });
  });
});

describe('claimPendingArtifact', () => {
  it('posts the lobby, name and email', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, pending_verification: true }));

    const result = await claimPendingArtifact('lobby1', 'Alice', 'a@b.c');

    expect(result).toEqual({ success: true, pending_verification: true });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/claim_pending_artifact`, {
      method: 'POST',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobby_id: 'lobby1', name: 'Alice', email: 'a@b.c' }),
    });
  });
});

describe('getMarketTrades', () => {
  const page = {
    trades: [
      {
        id: 5,
        listing_id: 50,
        kind: 'quick',
        role: 'seller',
        counterparty_name: 'Bo',
        completed_at: '2026-09-02T12:00:00+00:00',
        gave: [{ item_type: 'skin', skin: 'frog_gold_v1', relic_id: null, wheel_kind: null, quantity: 1 }],
        got: [],
      },
    ],
    has_more: true,
    next_before: 5,
  };

  it('POSTs the token to /market/trades with no cursor on the first page', async () => {
    fetchMock.mockResolvedValue(jsonResponse(page));

    await expect(getMarketTrades('sess-1')).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/market/trades`, {
      method: 'POST',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'sess-1' }),
    });
  });

  it('passes the keyset cursor and limit in the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ trades: [], has_more: false, next_before: null }));

    await getMarketTrades('sess-1', { before: 5, limit: 10 });

    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/market/trades`, {
      method: 'POST',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'sess-1', before: 5, limit: 10 }),
    });
  });
});

describe('My AI endpoints', () => {
  const fullStatus = {
    enabled: false,
    minute_counter: 10,
    knobs: {},
    override_rules: [],
    credits: 3,
    trainable: true,
    logged_rows: 50,
    min_rows: 40,
    bot_rank: { tier: null, games_played: 0 },
    queue: { queued: false, queue_size: 0 },
  };

  it('getMyAiStatus posts the token and parses the status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(fullStatus));

    const res = await getMyAiStatus('sess');

    expect(res.credits).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_URL}/my_ai/status`, {
      method: 'POST',
      headers: { 'X-Protocol-Version': String(PROTOCOL_VERSION), 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'sess' }),
    });
  });

  it('toggleMyAi posts the desired state', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ enabled: true, queued: true, reason: 'queued' }));

    const res = await toggleMyAi('sess', true);

    expect(res).toEqual({ enabled: true, queued: true, reason: 'queued' });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      token: 'sess', enabled: true,
    });
  });

  it('saveMyAiSettings spreads the settings into the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      saved: true, enabled: false, minute_counter: 20, knobs: {}, override_rules: [],
    }));

    await saveMyAiSettings('sess', { minute_counter: 20, knobs: { aggression: 0.5 } });

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      token: 'sess', minute_counter: 20, knobs: { aggression: 0.5 },
    });
  });

  it('getMyAiPersonality parses the readout', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ trained: false, deviations: [] }));
    expect((await getMyAiPersonality('sess')).trained).toBe(false);
  });

  it('startBotRanked posts the account token and stores the lobby token', async () => {
    const { startBotRanked } = await import('@/lib/api');
    fetchMock.mockResolvedValue(jsonResponse({ lobby_id: 'BOTP', token: 'lobby-tok' }));

    const res = await startBotRanked('acct');

    expect(res).toEqual({ lobby_id: 'BOTP', token: 'lobby-tok' });
    expect(getStoredToken('BOTP')).toBe('lobby-tok');
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      token: 'acct',
    });
    expect(fetchMock.mock.calls[0][0]).toContain('/my_ai/bot_ranked');
  });

  it('startBotRanked throws NoAiCreditsError on 402', async () => {
    const { startBotRanked, NoAiCreditsError } = await import('@/lib/api');
    fetchMock.mockResolvedValue(jsonResponse({ error: 'no_credits' }, 402));

    await expect(startBotRanked('acct')).rejects.toBeInstanceOf(NoAiCreditsError);
  });

  it('getMyAiMatches parses the history', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      matches: [{
        match_id: 'm1', placement: 1, rank: 'Warlock II',
        opponents: [{ name: "Ben's AI", owner: 'Ben', place: 2 }],
        at: '2026-09-03T14:03:00Z',
      }],
    }));
    const res = await getMyAiMatches('sess');
    expect(res.matches[0].rank).toBe('Warlock II');
    expect(res.matches[0].at).toBe('2026-09-03T14:03:00Z');
  });
});
