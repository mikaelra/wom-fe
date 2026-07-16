import { z } from 'zod';
import { BACKEND_URL } from '@/config';

/** A non-2xx HTTP response. Carries the server's {error} message when the
 *  body had one, or a per-call fallback string otherwise. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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
// ---------------------------------------------------------------------------

const SESSION_TOKEN_KEY = 'wom_session_token';
let sessionToken: string | null = null;

export function getStoredToken(): string | null {
  if (sessionToken !== null) return sessionToken;
  if (typeof window !== 'undefined') {
    sessionToken = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
  }
  return sessionToken;
}

export function setStoredToken(token: string | null | undefined): void {
  sessionToken = token ?? null;
  if (typeof window === 'undefined') return;
  if (sessionToken) {
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  } else {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
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
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const serverMessage = (body as { error?: string })?.error;
    throw new ApiError(res.status, serverMessage ?? opts.defaultErrorMessage ?? `Request to ${path} failed`);
  }

  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error(`[schema mismatch] ${path}`, parsed.error.format(), json);
    throw new SchemaMismatchError(path, parsed.error);
  }
  return parsed.data;
}
