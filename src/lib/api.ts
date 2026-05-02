import { BACKEND_URL } from "@/config";
import type { Relic } from "@/types/game";
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(BACKEND_URL);
  }
  return socket;
}

export async function createLobby(name: string, email: string): Promise<{ lobby_id: string }> {
  const res = await fetch(`${BACKEND_URL}/create_lobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error((errorData as { error?: string }).error ?? "Create lobby failed");
  }
  return res.json();
}

export async function joinLobby(
  joinCode: string,
  name: string,
  email: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = getSocket();
    sock.emit("join_lobby", { lobby_id: joinCode, name, email });

    const onJoined = () => {
      sock.off("joined_lobby", onJoined);
      sock.off("error", onError);
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

export async function getBossfightLobby(playerName: string): Promise<{ lobby_id: string }> {
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

export async function createGremlinLobby(playerName: string): Promise<{ lobby_id: string }> {
  const res = await fetch(`${BACKEND_URL}/create_gremlin_lobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: playerName }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error((errorData as { error?: string }).error ?? "Failed to create gremlin lobby");
  }
  return res.json();
}

export async function getPlayerMessages(
  lobbyId: string,
  playerName: string
): Promise<{ messages: string[][] }> {
  const res = await fetch(`${BACKEND_URL}/get_player_messages/${lobbyId}/${playerName}`);
  if (!res.ok) return { messages: [] };
  return res.json();
}

export async function requestReplay(lobbyId: string, player: string): Promise<{ next_lobby_id?: string }> {
  const res = await fetch(`${BACKEND_URL}/request_replay/${lobbyId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error((data as { error?: string }).error ?? "Failed to vote");
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
