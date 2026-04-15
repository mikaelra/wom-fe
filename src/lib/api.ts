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

export async function getRaidLobby(playerName: string): Promise<{ lobby_id: string }> {
  const res = await fetch(`${BACKEND_URL}/get_raid_lobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: playerName }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error((errorData as { error?: string }).error ?? "Failed to enter raid.");
  }
  const data = await res.json();
  // Emit join_lobby so the server broadcasts the updated player list to the room.
  const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') ?? '' : '';
  getSocket().emit("join_lobby", { lobby_id: data.lobby_id, name: playerName, email });
  return data;
}


export async function getState(lobbyId: string): Promise<import("@/types/game").LobbyState> {
  const res = await fetch(`${BACKEND_URL}/get_state/${lobbyId}`);
  if (!res.ok) throw new Error(`get_state failed: ${res.status}`);
  return res.json();
}

export async function getNextRaidTime(): Promise<{ start_time: number }> {
  const res = await fetch(`${BACKEND_URL}/get_next_raid_time`);
  if (!res.ok) throw new Error("Failed to fetch next raid time");
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

/**
 * Check whether a player name is already claimed (linked to an email).
 * Returns { claimed: true } if the user must authenticate with their email
 * before using the name, and { claimed: false } if the name is free to use.
 */
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

/**
 * Verify that the given email matches the claimed name.
 * Resolves on success, rejects with "Wrong email" on a 403 mismatch.
 */
export async function logInUser(name: string, email: string): Promise<{ success: boolean }> {
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
