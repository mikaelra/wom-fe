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
  const res = await fetch(`${BACKEND_URL}/join_lobby/${joinCode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error((errorData as { error?: string }).error ?? "Join failed");
  }
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
