import { z } from 'zod';
import { BACKEND_URL, PROTOCOL_VERSION } from '@/config';

/** A non-2xx HTTP response. Carries the server's {error} message when the
 *  body had one, or a per-call fallback string otherwise. `code` is the
 *  machine-readable discriminator some routes (docs/MONETIZATION_PLAN.md
 *  §5.3's /shop/checkout, e.g. "email_unverified"/"already_owned") add
 *  alongside {error} so callers can branch on it instead of matching on
 *  prose -- set generically here (not just for shop calls) so every call
 *  site stays uniform. */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** A 2xx response whose body doesn't match the expected schema — the two
 *  repos have drifted. Distinct from ApiError (which means "the backend
 *  told us something went wrong") since these need different handling:
 *  an ApiError message is often safe to show a user, a schema mismatch
 *  never is. */
export class SchemaMismatchError extends Error {
  zodError: z.ZodError;
  constructor(path: string, zodError: z.ZodError) {
    super(`Response from ${path} didn't match the expected shape`);
    this.name = 'SchemaMismatchError';
    this.zodError = zodError;
  }
}

// ---------------------------------------------------------------------------
// Session token store (hardening plan Phase 4 item 1 / backend Phase 1a).
//
// The backend issues a one-time session token on join (HTTP
// create_lobby/join_lobby/get_bossfight_lobby responses, and the socket
// join_lobby ack) that must be presented on join_room to bind this
// connection to the joining player. Every other action event derives the
// actor from that connection binding server-side, so the client no longer
// sends name/admin/player identity fields on actions at all.
//
// Kept in memory + sessionStorage (not localStorage): sessionStorage is
// per-tab, which matches a token's lifetime -- it's reissued fresh on every
// join_lobby call, so persisting it across tabs/browser restarts would just
// go stale. A page refresh in the same tab still works.
//
// Scoped per lobby_id (a map, not a single slot): the backend mints and
// resolves tokens per-lobby too (each lobby owns its own token dict), and a
// tab can legitimately hold membership in more than one lobby at once --
// e.g. join the boss fight, leave, create an unrelated lobby, leave that too,
// then return to the boss fight. A single global slot let the second lobby's
// token silently clobber the boss fight's, so rejoining the boss fight later
// presented the wrong lobby's token and got "Invalid or missing session
// token" even though the original one was still valid server-side.
// ---------------------------------------------------------------------------

const SESSION_TOKEN_KEY = 'wom_session_token';
let tokensByLobby: Record<string, string> | null = null;

function loadTokens(): Record<string, string> {
  if (tokensByLobby !== null) return tokensByLobby;
  let tokens: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const raw = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (raw) {
      try {
        tokens = JSON.parse(raw) as Record<string, string>;
      } catch {
        tokens = {};
      }
    }
  }
  tokensByLobby = tokens;
  return tokensByLobby;
}

export function getStoredToken(lobbyId: string): string | null {
  return loadTokens()[lobbyId] ?? null;
}

export function setStoredToken(lobbyId: string, token: string | null | undefined): void {
  const tokens = loadTokens();
  if (token) {
    tokens[lobbyId] = token;
  } else {
    delete tokens[lobbyId];
  }
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(tokens));
}

// ---------------------------------------------------------------------------
// Account session token (backend Phase 0 item 2 / monetization plan §7.2).
//
// A persistent, account-level login credential -- minted by /log_in or
// /verify_code, distinct from the per-lobby tokens above in every way that
// matters: there's exactly one of it (not one per lobby), and it's meant to
// survive across tabs and browser restarts, so it lives in localStorage
// rather than sessionStorage. Nothing resolves the caller from it yet
// (that's Phase 1's inventory/shop routes); today it's only used to let a
// tab present it back to /resolve_account_session and to /log_out.
// ---------------------------------------------------------------------------

const ACCOUNT_SESSION_TOKEN_KEY = 'wom_account_session';

// In-memory cache alongside the localStorage write-through -- same
// resilience pattern as tokensByLobby above (lazy-loaded once, so a
// window-less environment like an SSR pass or a Node test still behaves
// correctly rather than silently no-op'ing on every call). `undefined`
// means "not loaded yet", distinct from `null` ("loaded, nothing stored").
let cachedAccountToken: string | null | undefined;

export function getStoredAccountToken(): string | null {
  if (cachedAccountToken !== undefined) return cachedAccountToken;
  cachedAccountToken =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACCOUNT_SESSION_TOKEN_KEY) : null;
  return cachedAccountToken;
}

export function setStoredAccountToken(token: string | null | undefined): void {
  cachedAccountToken = token || null;
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(ACCOUNT_SESSION_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(ACCOUNT_SESSION_TOKEN_KEY);
  }
}

type RequestOpts = {
  /** JSON body. Its presence also selects the method: POST if set, GET otherwise. */
  body?: unknown;
  /** Used only when a non-ok response body has no {error} field. */
  defaultErrorMessage?: string;
};

/**
 * Fetch + JSON + zod-parse in one place. Throws ApiError on a non-ok HTTP
 * status (carrying the server's {error} message, or defaultErrorMessage if
 * the body has none) or SchemaMismatchError if an ok response doesn't match
 * `schema`.
 *
 * A schema mismatch is logged loudly (the shape diff, in full) rather than
 * silently coerced — this is what turns backend drift into a one-line
 * console error instead of a haunted 3D scene deep in a component. Turning
 * this into a user-visible "out of date, please reload" state is Phase 5's
 * <ErrorBoundary> work; this layer's job is only to guarantee it's never
 * silent.
 */
export async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  opts: RequestOpts = {}
): Promise<z.infer<S>> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: opts.body !== undefined ? 'POST' : 'GET',
    headers: {
      'X-Protocol-Version': String(PROTOCOL_VERSION),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const serverMessage = (body as { error?: string; code?: string })?.error;
    const code = (body as { error?: string; code?: string })?.code;
    throw new ApiError(res.status, serverMessage ?? opts.defaultErrorMessage ?? `Request to ${path} failed`, code);
  }

  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error(`[schema mismatch] ${path}`, parsed.error.format(), json);
    throw new SchemaMismatchError(path, parsed.error);
  }
  return parsed.data;
}
