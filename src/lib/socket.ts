import { z } from 'zod';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '@/config';
import { LobbyStateSchema, ChatMessageSchema, type LobbyState, type ChatMessage } from '@/types/game';
import {
  JoinedLobbyPayloadSchema,
  JoinedPayloadSchema,
  LeftPayloadSchema,
  ErrorPayloadSchema,
  JoinedRankedQueuePayloadSchema,
  RankedMatchFoundPayloadSchema,
  OnlineCountPayloadSchema,
} from '@/lib/schemas';

// Typed event maps, built directly against wom-be's docs/PROTOCOL.md.
// socket.io-client's Socket<ListenEvents, EmitEvents> generic gives every
// getSocket() caller compile-time-checked .emit()/.on() calls for free.

export interface ServerToClientEvents {
  error: (payload: { message: string }) => void;
  joined_lobby: (payload: { lobby_id: string; token: string }) => void;
  joined: (payload: { lobby_id: string; name: string }) => void;
  left: (payload: { lobby_id: string; name: string | null }) => void;
  state_update: (payload: LobbyState) => void;
  chat_message: (payload: ChatMessage) => void;
  // Ranked matchmaking (docs/RANK_SYSTEM_PLAN.md §6/§10).
  joined_ranked_queue: (payload: { name: string }) => void;
  ranked_match_found: (payload: { lobby_id: string; token: string }) => void;
  online_count: (payload: { count: number }) => void;
}

export interface ClientToServerEvents {
  join_lobby: (payload: { lobby_id: string; name: string; email: string }) => void;
  // token is nullable, not just string, because a reconnect can legitimately
  // race this call ahead of the session token being set (see SceneOverlay's
  // rejoin() -- the backend just responds "invalid session token" in that
  // case, same as any other unauthenticated join_room).
  join_room: (payload: { lobby_id: string; token: string | null }) => void;
  leave_room: (payload: { lobby_id: string }) => void;
  start_game: (payload: { lobby_id: string }) => void;
  kick_player: (payload: { lobby_id: string; target: string }) => void;
  toggle_relic_selection: (payload: { lobby_id: string; relic_id: number }) => void;
  add_dummy: (payload: { lobby_id: string }) => void;
  submit_choice: (payload: {
    lobby_id: string;
    action?: string | null;
    resource?: string | null;
    target?: string | null;
  }) => void;
  submit_deny_target: (payload: { lobby_id: string; target: string }) => void;
  send_message: (payload: { lobby_id: string; message: string }) => void;
  join_ranked_queue: (payload: { name: string }) => void;
}

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io(BACKEND_URL);
  }
  return socket;
}

const EVENT_SCHEMAS = {
  error: ErrorPayloadSchema,
  joined_lobby: JoinedLobbyPayloadSchema,
  joined: JoinedPayloadSchema,
  left: LeftPayloadSchema,
  state_update: LobbyStateSchema,
  chat_message: ChatMessageSchema,
  joined_ranked_queue: JoinedRankedQueuePayloadSchema,
  ranked_match_found: RankedMatchFoundPayloadSchema,
  online_count: OnlineCountPayloadSchema,
} satisfies { [K in keyof ServerToClientEvents]: z.ZodTypeAny };

/**
 * Subscribe to a server->client event with runtime validation and a proper
 * unsubscribe closure.
 *
 * Fixes a real, latent bug: components used to clean up with
 * `sock.off(event)` (no handler argument), which wipes *every* listener
 * for that event on the shared singleton socket -- including any other
 * component's, if one is ever mounted concurrently. This stores the exact
 * wrapped handler per call, so the returned unsubscribe only ever removes
 * what that call added.
 *
 * A payload that fails validation is logged loudly and dropped (the
 * handler is never called) rather than crashing the app on one bad
 * broadcast -- same fail-loud philosophy as lib/http.ts's request().
 */
export function subscribe<E extends keyof ServerToClientEvents>(
  event: E,
  handler: (payload: z.infer<(typeof EVENT_SCHEMAS)[E]>) => void
): () => void {
  const sock = getSocket();
  const wrapped = (raw: unknown) => {
    const parsed = EVENT_SCHEMAS[event].safeParse(raw);
    if (!parsed.success) {
      console.error(`[schema mismatch] socket event "${event}"`, parsed.error.format(), raw);
      return;
    }
    // Same correlated-generic-key limitation as the sock.on/off casts below:
    // TS can't prove `parsed.data`'s type (a union across all schemas) narrows
    // to the one `handler` expects for this specific `E`, even though it
    // always does at runtime -- EVENT_SCHEMAS[event] and `handler`'s
    // parameter type are derived from the same `event` argument. Routed
    // through `unknown` rather than `any` so this stays lint-clean.
    handler(parsed.data as unknown as z.infer<(typeof EVENT_SCHEMAS)[E]>);
  };
  // socket.io-client's .on/.off overloads can't be satisfied generically here
  // (TS can't narrow ServerToClientEvents[E] down from the union once E is a
  // type parameter, and their overload resolution rejects a same-shaped cast
  // too) -- view the socket as a minimal, untyped event emitter for just
  // this one call. Contained to these two lines; subscribe()'s own exported
  // signature above is fully typed for callers.
  const looseSock = sock as unknown as {
    on(event: string, listener: (...args: unknown[]) => void): void;
    off(event: string, listener: (...args: unknown[]) => void): void;
  };
  looseSock.on(event, wrapped);
  return () => {
    looseSock.off(event, wrapped);
  };
}
