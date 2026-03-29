# Socket.IO Frontend Migration Guide

<!-- IMPLEMENTATION STATUS (updated 2026-03-29)
==============================================
The core Socket.IO migration is COMPLETE. All in-game functionality uses Socket.IO.

DONE:
- [x] Step 1: socket.io-client installed (in package.json)
- [x] Step 2: Socket wrapper — implemented as singleton in src/lib/api.ts (getSocket())
        Note: No separate src/lib/socket.ts file was created; socket management lives in api.ts
- [x] Step 3: Polling replaced — SceneOverlay listens for 'state_update' events, no setInterval
- [x] Step 4: Action handlers migrated — all use socket.emit() (start_game, submit_choice,
        submit_deny_target, kick_player, add_dummy)
- [x] Step 5: Lobby chat migrated — send_message via socket emit, chat_message listener
- [x] Step 8: Types — LobbyState and ChatMessage already match backend payload
- [x] Step 9 (partial): Old REST functions removed for migrated actions (startGame, submitChoice,
        submitDenyTarget, kickPlayer, addDummy, sendMessage are gone from api.ts)
- [x] Step 7: Custom useSocket hook — implemented
- [x] Step 11: GremlinOverlay — reuses SceneOverlay, inherits socket behavior

NOT DONE:
- [ ] Step 6: City chat (join_city, city_message) — city chat is a post-alpha feature

REMAINING REST FUNCTIONS IN api.ts (intentionally kept):
- getState — kept as fallback, not actively used by the frontend
- getNextRaidTime — infrequent read, no benefit from socket
- getPlayerRelics — infrequent read
- getPlayerMessages — low-traffic read
- requestReplay — one-time action
- createLobby, createGremlinLobby, getRaidLobby — one-time matchmaking
-->

This document describes how to migrate the wom-mid frontend from HTTP polling to Socket.IO, matching the new backend implementation in `tjuvpakk-backend/sockets/`.

---

## 1. Why Migrate

The frontend currently polls `GET /get_state/<lobby_id>` every 2 seconds. This causes:

- **Wasted requests**: 6 players = 6 identical GETs per second, all returning the same state until something changes.
- **Latency**: State changes (round resolution, chat) take up to 2 s to appear.
- **Side-effect GET**: The backend mutates state inside `get_state` (round timeout detection, AI moves, auto-starts). With Socket.IO the server owns round timing via a background task, eliminating these side effects.

After migration, the server pushes `state_update` events whenever state changes. No polling needed.

---

## 2. Install Dependency

```bash
npm install socket.io-client
```

---

## 3. New File: `src/lib/socket.ts`

A thin wrapper around `socket.io-client` that manages a single connection per lobby.

```ts
import { io, Socket } from "socket.io-client";
import { BACKEND_URL } from "@/config";
import type { LobbyState, ChatMessage } from "@/types/game";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectToLobby(
  lobbyId: string,
  playerName: string,
  callbacks: {
    onStateUpdate: (state: LobbyState) => void;
    onChatMessage?: (msg: ChatMessage) => void;
    onError?: (err: { message: string }) => void;
  }
): Socket {
  // Disconnect previous connection if any
  if (socket) {
    socket.disconnect();
  }

  socket = io(BACKEND_URL, {
    transports: ["websocket", "polling"], // prefer WebSocket, fall back to polling
  });

  socket.on("connect", () => {
    socket!.emit("join_room", { lobby_id: lobbyId, name: playerName });
  });

  socket.on("state_update", callbacks.onStateUpdate);

  if (callbacks.onChatMessage) {
    socket.on("chat_message", callbacks.onChatMessage);
  }

  if (callbacks.onError) {
    socket.on("error", callbacks.onError);
  }

  // Auto-reconnect is built into socket.io-client.
  // On reconnect, re-join the room so the server sends fresh state.
  socket.on("reconnect", () => {
    socket!.emit("join_room", { lobby_id: lobbyId, name: playerName });
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

### Notes

- `BACKEND_URL` already points to the Flask server (same origin as REST).
- Flask-SocketIO serves the socket on the same port, so no URL change is needed.
- The `join_room` emit on connect triggers an immediate `state_update` push from the server, so the client gets initial state without a separate REST call.

---

## 4. Event Mapping: REST &rarr; Socket.IO

### Actions that move to Socket.IO (emit instead of fetch)

| Current REST call (in `api.ts`) | Socket.IO event (client &rarr; server) | Payload |
|---|---|---|
| `startGame(lobbyId, admin)` | `start_game` | `{ lobby_id, admin }` |
| `submitChoice(lobbyId, payload)` | `submit_choice` | `{ lobby_id, player, action, resource, target }` |
| `submitDenyTarget(lobbyId, player, target)` | `submit_deny_target` | `{ lobby_id, player, target }` |
| `kickPlayer(lobbyId, admin, target)` | `kick_player` | `{ lobby_id, admin, target }` |
| `addDummy(lobbyId, adminName)` | `add_dummy` | `{ lobby_id, name }` |
| `sendMessage(lobbyId, name, message)` | `send_message` | `{ lobby_id, name, message }` |
| `getState(lobbyId)` (polling) | **Removed** &mdash; replaced by listening to `state_update` |

### Events the client listens to (server &rarr; client)

| Event | Payload | Purpose |
|---|---|---|
| `state_update` | `LobbyState` (full lobby state dict) | Replaces polling; apply directly to React state |
| `chat_message` | `{ sender, message, timestamp }` | Single new chat entry; append to local chat array |
| `city_message` | `{ sender, message, timestamp, city_id }` | City chat push (for world map chat) |
| `joined` | `{ lobby_id, name }` | Acknowledgement after `join_room` |
| `error` | `{ message }` | Validation/permission errors |

### Endpoints that stay as REST (no change needed)

| Function | Why |
|---|---|
| `createLobby` | One-time call; returns `lobby_id` used to connect socket |
| `joinLobby` | Validation + DB check; socket `join_room` happens after |
| `getRaidLobby`, `createGremlinLobby` | One-time matchmaking |
| `getNextRaidTime`, `getPlayerRelics` | Infrequent reads |
| `getPlayerMessages` | Can stay REST for now (low traffic) |
| `requestReplay` | One-time action; returns `next_lobby_id` |

---

## 5. Migrating `SceneOverlay.tsx`

This is the core change. The component currently has a polling `useEffect` at line 145-158. Replace it with a socket connection.

### Before (polling)

```tsx
useEffect(() => {
  if (!lobbyId) return;
  const fetchState = async () => {
    try {
      const json = await getState(lobbyId);
      setState(json);
    } catch (e) {
      console.warn('get_state failed', e);
    }
  };
  fetchState();
  const interval = setInterval(fetchState, 2000);
  return () => clearInterval(interval);
}, [lobbyId]);
```

### After (Socket.IO)

```tsx
import { connectToLobby, disconnectSocket } from '@/lib/socket';

useEffect(() => {
  if (!lobbyId || !playerName) return;

  const sock = connectToLobby(lobbyId, playerName, {
    onStateUpdate: (newState) => setState(newState),
    onChatMessage: (msg) => {
      // Append to local chat state for immediate rendering
      setState((prev) =>
        prev ? { ...prev, chat: [...(prev.chat ?? []), msg] } : prev
      );
    },
    onError: (err) => console.warn('socket error:', err.message),
  });

  return () => {
    sock.emit('leave_room', { lobby_id: lobbyId, name: playerName });
    disconnectSocket();
  };
}, [lobbyId, playerName]);
```

**Key differences:**
- No `setInterval`. State arrives via push.
- `playerName` is a dependency &mdash; the socket must know who is joining. Ensure `playerName` is read from `localStorage` before this effect runs (it already is, via the effect on line 132-136, but make sure the ordering is correct).
- Chat messages arrive individually via `chat_message` instead of inside the polled state. Append them locally for instant rendering. The next `state_update` will also contain the full chat array, keeping things in sync.

### Migrating action handlers

Replace REST calls with socket emits. Example for `handleStartGame`:

**Before:**
```tsx
const handleStartGame = async () => {
  try {
    await startGame(lobbyId, playerName);
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to start game');
  }
};
```

**After:**
```tsx
import { getSocket } from '@/lib/socket';

const handleStartGame = () => {
  getSocket()?.emit('start_game', { lobby_id: lobbyId, admin: playerName });
};
```

The server broadcasts `state_update` after processing the event, so the UI updates automatically. Errors come via the `error` event listener set up in `connectToLobby`.

Apply the same pattern to all action handlers:

| Handler | Emit |
|---|---|
| `handleStartGame` | `socket.emit('start_game', { lobby_id: lobbyId, admin: playerName })` |
| `handleAddDummy` | `socket.emit('add_dummy', { lobby_id: lobbyId, name: playerName })` |
| `handleKick(target)` | `socket.emit('kick_player', { lobby_id: lobbyId, admin: playerName, target })` |
| `handleResource(resId)` | `socket.emit('submit_choice', { lobby_id: lobbyId, player: playerName, resource: resId, action: '' })` |
| `handleAction(act)` | `socket.emit('submit_choice', { lobby_id: lobbyId, player: playerName, action: act, resource: '', target })` |
| `handleDeny` | `socket.emit('submit_deny_target', { lobby_id: lobbyId, player: playerName, target: denyTarget })` |
| `handleSendChat` | `socket.emit('send_message', { lobby_id: lobbyId, name: playerName, message: chatInput.trim() })` |

### Error handling for emits

Socket.IO emits are fire-and-forget. The server responds with an `error` event if something is wrong. To surface errors to the user, set up the `onError` callback to display a toast/alert:

```tsx
onError: (err) => {
  // Use a toast library or simple alert
  alert(err.message);
},
```

---

## 6. Chat Migration

### Lobby chat

**Current**: `sendMessage()` REST call + chat is included in polled `state_update`.

**After**:
- **Send**: `socket.emit('send_message', { lobby_id, name, message })`
- **Receive**: Listen for `chat_message` events and append to local chat array. The `state_update` also includes the full `chat` array, so both paths keep the UI in sync.

### City chat (world map)

If the world map screen uses city chat, subscribe on mount:

```tsx
useEffect(() => {
  const sock = getSocket();
  if (!sock || !cityId) return;

  sock.emit('join_city', { city_id: cityId });
  sock.on('city_message', (msg) => {
    setCityChat((prev) => [...prev, msg]);
  });

  return () => {
    sock.off('city_message');
  };
}, [cityId]);
```

Initial chat history can still be loaded via `GET /get_city_chat/<city_id>` on page load.

---

## 7. Custom Hook (Optional): `useSocket`

To keep things clean, consider extracting the socket logic into a reusable hook:

```tsx
// src/hooks/useSocket.ts
import { useEffect, useRef, useState } from 'react';
import { connectToLobby, disconnectSocket, getSocket } from '@/lib/socket';
import type { LobbyState, ChatMessage } from '@/types/game';
import type { Socket } from 'socket.io-client';

export function useSocket(lobbyId: string, playerName: string) {
  const [state, setState] = useState<LobbyState | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!lobbyId || !playerName) return;

    const sock = connectToLobby(lobbyId, playerName, {
      onStateUpdate: (s) => setState(s),
      onChatMessage: (msg) => {
        setState((prev) =>
          prev ? { ...prev, chat: [...(prev.chat ?? []), msg] } : prev
        );
      },
      onError: (err) => console.warn('socket error:', err.message),
    });
    socketRef.current = sock;

    return () => {
      sock.emit('leave_room', { lobby_id: lobbyId, name: playerName });
      disconnectSocket();
      socketRef.current = null;
    };
  }, [lobbyId, playerName]);

  const emit = (event: string, data: Record<string, unknown>) => {
    socketRef.current?.emit(event, data);
  };

  return { state, emit, socket: socketRef };
}
```

Usage in `SceneOverlay`:
```tsx
const { state, emit } = useSocket(lobbyId, playerName);

const handleStartGame = () => emit('start_game', { lobby_id: lobbyId, admin: playerName });
```

---

## 8. Type Updates (`src/types/game.ts`)

The existing `LobbyState` and `ChatMessage` interfaces already match the backend's `build_state_payload()` output. No changes needed.

The `state_update` payload includes all the same fields: `round`, `players`, `winner`, `raidwinner`, `pending_deny`, `deny_target`, `readyPlayers`, `history`, `round_end_time` (ISO string), `boss_fight`, `gremlin_fight`, `start_time` (ISO string), `gameover`, `chat`.

---

## 9. What Can Be Removed from `api.ts`

After full migration, these functions are no longer needed:

```
getState          -> replaced by state_update listener
startGame         -> socket emit
submitChoice      -> socket emit
submitDenyTarget  -> socket emit
kickPlayer        -> socket emit
addDummy          -> socket emit
sendMessage       -> socket emit
```

Keep them during the transition period so both code paths work. Remove once all screens are on sockets.

---

## 10. Migration Sequence (Incremental)

Each step is independently deployable. The backend keeps REST shims during the transition.

### Step 1: Add `socket.io-client` and `src/lib/socket.ts`

- `npm install socket.io-client`
- Create the socket wrapper module (Section 3 above).
- No behavior changes yet.

### Step 2: Replace polling with socket connection

- In `SceneOverlay.tsx`, replace the `getState` polling `useEffect` with the socket connection (Section 5).
- Keep the REST action handlers (`startGame`, `submitChoice`, etc.) unchanged for now.
- **Test**: Verify state updates arrive via push. The timer, round transitions, and game-over should all work without polling.

### Step 3: Migrate action handlers to socket emits

- Replace `startGame`, `submitChoice`, `submitDenyTarget`, `kickPlayer`, `addDummy` with socket emits.
- Add the `error` event listener for user-facing error feedback.
- **Test**: Play a full game using only socket events.

### Step 4: Migrate chat to socket

- Replace `sendMessage` REST call with `send_message` socket emit.
- Listen for `chat_message` events for instant delivery.
- **Test**: Chat messages appear instantly without waiting for next state poll.

### Step 5: Migrate city chat (if applicable)

- Add `join_city` + `city_message` listener on the world map screen.
- **Test**: City chat updates in real time.

### Step 6: Clean up

- Remove unused REST functions from `api.ts` (`getState`, `startGame`, `submitChoice`, `submitDenyTarget`, `kickPlayer`, `addDummy`, `sendMessage`).
- Remove the `getState` import from all components.
- Verify no remaining `setInterval` polling loops exist.

---

## 11. GremlinOverlay / Other Scenes

`GremlinOverlay` likely reuses `SceneOverlay` (or a similar pattern). The same migration applies:
- Connect socket on mount with `join_room`.
- Listen for `state_update`.
- Emit game actions via socket.

The gremlin fight auto-starts via the backend's background watcher when the first `join_room` arrives, so no special handling is needed on the frontend.

---

## 12. Deployment Notes

- The backend must be running with `eventlet` worker (`gunicorn --worker-class eventlet -w 1`).
- CORS is configured server-side with `cors_allowed_origins="*"` on the SocketIO instance.
- `NEXT_PUBLIC_BACKEND_URL` does not need to change &mdash; `socket.io-client` connects to the same origin.
- On Render: WebSocket connections are supported out of the box. No additional configuration needed.
