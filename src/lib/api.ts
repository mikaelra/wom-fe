import { BACKEND_URL } from "@/config";
import type { Relic } from "@/types/game";
import type { GameEvent } from "@/lib/gameEvents";
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(BACKEND_URL);
  }
  return socket;
}

// ---------------------------------------------------------------------------
// Session token store (hardening plan Phase 4 item 1 / backend Phase 1a).
//
// The backend now issues a one-time session token on join (HTTP
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

const SESSION_TOKEN_KEY = "wom_session_token";
let sessionToken: string | null = null;

export function getStoredToken(): string | null {
  if (sessionToken !== null) return sessionToken;
  if (typeof window !== "undefined") {
    sessionToken = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
  }
  return sessionToken;
}

export function setStoredToken(token: string | null | undefined): void {
  sessionToken = token ?? null;
  if (typeof window === "undefined") return;
  if (sessionToken) {
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  } else {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
  }
}

export async function createLobby(name: string, email: string): Promise<{ lobby_id: string; token: string }> {
  const res = await fetch(`${BACKEND_URL}/create_lobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error((errorData as { error?: string }).error ?? "Create lobby failed");
  }
  const data = await res.json();
  setStoredToken(data.token);
  return data;
}

export async function joinLobby(
  joinCode: string,
  name: string,
  email: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = getSocket();
    sock.emit("join_lobby", { lobby_id: joinCode, name, email });

    const onJoined = (data: { lobby_id: string; token?: string }) => {
      sock.off("joined_lobby", onJoined);
      sock.off("error", onError);
      if (data?.token) setStoredToken(data.token);
      resolve();
    };

    const onError = (data: { message: string }) => {
      sock.off("joined_lobby", onJoined);
      sock.off("error", onError);
      reject(new Error(data.message));
    };

    sock.on("joined_lobby", onJoined);
    sock.on("error", onError);
  });
}

export async function getBossfightLobby(playerName: string): Promise<{ lobby_id: string; token?: string | null }> {
  const res = await fetch(`${BACKEND_URL}/get_bossfight_lobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: playerName }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error((errorData as { error?: string }).error ?? "Failed to enter boss fight.");
  }
  const data = await res.json();
  // token may be null when the caller is already a member re-checking in
  // (e.g. a page refresh) -- in that case they're expected to still hold
  // the token from their original join, so don't clobber it with null.
  if (data.token) setStoredToken(data.token);
  const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') ?? '' : '';
  getSocket().emit("join_lobby", { lobby_id: data.lobby_id, name: playerName, email });
  return data;
}

export async function getState(lobbyId: string): Promise<import("@/types/game").LobbyState> {
  const res = await fetch(`${BACKEND_URL}/get_state/${lobbyId}`);
  if (!res.ok) throw new Error(`get_state failed: ${res.status}`);
  return res.json();
}

export async function getNextBossfightTime(): Promise<{ start_time: number }> {
  const res = await fetch(`${BACKEND_URL}/get_next_bossfight_time`);
  if (!res.ok) throw new Error("Failed to fetch next boss fight time");
  return res.json();
}

export async function getPlayerRelics(playerName: string): Promise<{ relics: Relic[] }> {
  const res = await fetch(`${BACKEND_URL}/get_player_relics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: playerName }),
  });
  if (!res.ok) return { relics: [] };
  return res.json();
}

export async function getPlayerMessages(
  lobbyId: string,
  playerName: string
): Promise<{ messages: string[][]; events?: GameEvent[] }> {
  // Backend Phase 1b: messages/events are private data, gated behind the
  // session token issued on join (see getStoredToken above). A stale tab
  // that never (re)joined has no token -- fetch will 403 and fall through
  // to the existing empty-result fallback below, same as any other failure.
  const token = getStoredToken();
  const url = token
    ? `${BACKEND_URL}/get_player_messages/${lobbyId}/${playerName}?token=${encodeURIComponent(token)}`
    : `${BACKEND_URL}/get_player_messages/${lobbyId}/${playerName}`;
  const res = await fetch(url);
  if (!res.ok) return { messages: [], events: [] };
  return res.json();
}

export async function requestReplay(
  lobbyId: string,
  player: string,
  vote: boolean
): Promise<{
  replay_votes?: string[];
  replay_votes_count?: number;
  replay_votes_needed?: number;
  next_lobby_id?: string | null;
}> {
  const res = await fetch(`${BACKEND_URL}/request_replay/${lobbyId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player, vote }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error((data as { error?: string }).error ?? "Failed to update rematch vote");
  }
  return res.json();
}

export async function checkName(name: string): Promise<{ claimed: boolean }> {
  const res = await fetch(`${BACKEND_URL}/check_name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error ?? "Failed to check name");
  }
  return res.json();
}

export async function logInUser(
  name: string,
  email: string
): Promise<{ success: boolean; requires_code?: boolean; always_verify_email?: boolean }> {
  const res = await fetch(`${BACKEND_URL}/log_in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  if (res.status === 403) {
    throw new Error("Wrong email");
  }
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error ?? "Log in failed");
  }
  return res.json();
}

export async function verifyLoginCode(
  name: string,
  code: string
): Promise<{ success: boolean; always_verify_email?: boolean }> {
  const res = await fetch(`${BACKEND_URL}/verify_code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, code }),
  });
  if (res.status === 403) throw new Error("Wrong code");
  if (res.status === 410) throw new Error("Code expired");
  if (res.status === 429) throw new Error("Too many attempts");
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error ?? "Verification failed");
  }
  return res.json();
}

export async function getAlwaysVerifyEmailFlag(
  name: string,
  email: string
): Promise<{ always_verify_email: boolean }> {
  const res = await fetch(`${BACKEND_URL}/get_always_verify_email_flag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error ?? "Failed to load settings");
  }
  return res.json();
}

export async function requestToggleVerifyEmail(
  name: string,
  email: string,
  alwaysVerifyEmail: boolean
): Promise<{ success: boolean }> {
  const res = await fetch(`${BACKEND_URL}/request_toggle_verify_email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, always_verify_email: alwaysVerifyEmail }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error ?? "Failed to send email.");
  }
  return res.json();
}

export async function confirmToggleVerifyEmail(
  token: string
): Promise<{ success: boolean; always_verify_email: boolean }> {
  const res = await fetch(`${BACKEND_URL}/confirm_toggle_verify_email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (res.status === 410) throw new Error("Link expired");
  if (res.status === 404) throw new Error("Invalid or expired link");
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error ?? "Failed to confirm.");
  }
  return res.json();
}

export async function claimPendingRelic(
  lobbyId: string,
  name: string,
  email: string
): Promise<{ success: boolean; relic_name: string }> {
  const res = await fetch(`${BACKEND_URL}/claim_pending_relic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lobby_id: lobbyId, name, email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Failed to claim relic");
  }
  return res.json();
}
