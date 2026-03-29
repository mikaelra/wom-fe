# World of Mythos — API Reference

A complete reference of all REST endpoints and Socket.IO events used by the frontend.

The game uses a hybrid architecture:
- **Socket.IO** for all real-time in-game communication (state updates, actions, chat)
- **REST** for one-time operations (lobby creation, authentication, matchmaking, leaderboards, vault)

---

## Base URL

`http://<host>:<port>`

---

## Socket.IO Events

The frontend maintains a single Socket.IO connection per session (singleton in `src/lib/api.ts`). The server pushes state updates — no polling required.

### Client → Server (Emits)

| Event | Payload | Description |
|---|---|---|
| `join_room` | `{ lobby_id, name }` | Join a lobby room to receive state updates |
| `leave_room` | `{ lobby_id, name }` | Leave a lobby room |
| `join_lobby` | `{ lobby_id, name, email }` | Join an existing lobby (with validation) |
| `start_game` | `{ lobby_id, admin }` | Admin starts the game |
| `submit_choice` | `{ lobby_id, player, action, resource, target }` | Submit action + resource for the round |
| `submit_deny_target` | `{ lobby_id, player, target }` | Deny a player's choices |
| `kick_player` | `{ lobby_id, admin, target }` | Admin kicks a player |
| `add_dummy` | `{ lobby_id, name }` | Admin adds a bot player |
| `send_message` | `{ lobby_id, name, message }` | Send a lobby chat message |

### Server → Client (Listeners)

| Event | Payload | Description |
|---|---|---|
| `state_update` | `LobbyState` (full lobby state) | Pushed whenever lobby state changes — replaces polling |
| `chat_message` | `{ sender, message, timestamp }` | New chat message; append to local chat array |
| `joined_lobby` | `{ lobby_id, name }` | Acknowledgement after `join_lobby` |
| `error` | `{ message }` | Validation/permission errors |

---

## REST Endpoints

### Health Check

#### `GET /`
Returns API documentation as a styled HTML page.

---

## Authentication (`/routes/auth.py`)

### `POST /claim_name`
Registers a new player name linked to an email, or updates the email if the name was previously unclaimed.

**Request body:**
| Field   | Type   | Required | Description                                      |
|---------|--------|----------|--------------------------------------------------|
| `name`  | string | Yes      | 3–12 characters, no spaces or special characters |
| `email` | string | Yes      | Valid email address (must contain `@`)           |

**Responses:**
| Status | Body                                     | Meaning                        |
|--------|------------------------------------------|--------------------------------|
| 200    | `{"success": true}`                      | Name claimed or email updated  |
| 400    | `{"error": "Name must be 3–12 characters long"}` | Invalid name format   |
| 400    | `{"error": "Invalid email."}`            | Invalid email format           |
| 409    | `{"error": "Name already claimed."}`     | Name belongs to another email  |
| 500    | `{"error": "Server error."}`             | Database error                 |

---

### `POST /log_in`
Verifies that a name + email pair matches what is stored in the database.

**Request body:**
| Field   | Type   | Required | Description       |
|---------|--------|----------|-------------------|
| `name`  | string | Yes      | Registered name   |
| `email` | string | Yes      | Associated email  |

**Responses:**
| Status | Body                                  | Meaning                    |
|--------|---------------------------------------|----------------------------|
| 200    | `{"success": true}`                   | Credentials verified       |
| 403    | `{"error": "Email does not match."}`  | Wrong email for that name  |
| 404    | `{"error": "Name not found."}`        | Name does not exist        |
| 500    | `{"error": "Server error."}`          | Database error             |

---

## Lobby (`/routes/lobby.py`)

> **Note:** Most in-game lobby actions (start game, submit choice, deny, kick, add bot, chat) have been migrated to Socket.IO emits. The REST endpoints below are kept as server-side shims but the frontend uses Socket.IO for these operations. See the Socket.IO Events section above.

### `POST /create_lobby`
Creates a new game lobby. The creator becomes the admin.

**Request body:**
| Field   | Type   | Required | Description                         |
|---------|--------|----------|-------------------------------------|
| `name`  | string | Yes      | Player name (validated against DB)  |
| `email` | string | Yes      | Player email (must match DB record) |

**Responses:**
| Status | Body                                                    | Meaning                          |
|--------|---------------------------------------------------------|----------------------------------|
| 200    | `{"lobby_id": "<3-char-id>"}`                           | Lobby created                    |
| 400    | `{"error": "..."}`                                      | Invalid name format              |
| 403    | `{"error": "This name is already claimed. Please log in."}` | Name exists, wrong email     |
| 403    | `{"error": "Email does not match..."}`                  | Email mismatch                   |

**Notes:**
- The name `"Verden"` is reserved and joins as a spectator.

---

### `POST /join_lobby/<lobby_id>`
> **Frontend uses Socket.IO:** `socket.emit('join_lobby', { lobby_id, name, email })` — listens for `joined_lobby` or `error` response.

Joins an existing lobby as a player. Joining after round 1 has started results in spectator status.

**URL parameter:** `lobby_id`

**Request body:**
| Field   | Type   | Required | Description        |
|---------|--------|----------|--------------------|
| `name`  | string | Yes      | Player name        |
| `email` | string | Yes      | Player email       |

**Responses:**
| Status | Body                                   | Meaning                              |
|--------|----------------------------------------|--------------------------------------|
| 200    | `{"status": "joined"}`                 | Successfully joined                  |
| 400    | `{"error": "Name taken"}`              | Name already in lobby                |
| 403    | `{"error": "This name is claimed..."}` | Name exists in DB, email mismatch    |
| 404    | `{"error": "Lobby not found"}`         | Lobby ID does not exist              |

**Notes:**
- `"Verden"` always returns the current state without joining.
- Players joining after round 1 are automatically spectators.

---

### `POST /kick_player/<lobby_id>`
> **Frontend uses Socket.IO:** `socket.emit('kick_player', { lobby_id, admin, target })`

Admin removes a player from the lobby before the game starts.

**URL parameter:** `lobby_id`

**Request body:**
| Field    | Type   | Required | Description             |
|----------|--------|----------|-------------------------|
| `admin`  | string | Yes      | Name of the admin       |
| `target` | string | Yes      | Name of player to kick  |

**Responses:**
| Status | Body                                  | Meaning                             |
|--------|---------------------------------------|-------------------------------------|
| 200    | `{"status": "Player kicked"}`         | Player removed                      |
| 400    | `{"error": "Game already started"}`   | Cannot kick after game start        |
| 400    | `{"error": "You can't kick yourself"}`| Admin cannot kick themselves        |
| 403    | `{"error": "You are not the admin"}`  | Requester is not the admin          |
| 404    | `{"error": "Lobby not found"}`        | Lobby ID does not exist             |
| 404    | `{"error": "Player not found"}`       | Target not in lobby                 |

---

### `POST /start_game/<lobby_id>`
> **Frontend uses Socket.IO:** `socket.emit('start_game', { lobby_id, admin })`

Admin starts the game, advancing the lobby to round 1.

**URL parameter:** `lobby_id`

**Request body:**
| Field   | Type   | Required | Description       |
|---------|--------|----------|-------------------|
| `admin` | string | Yes      | Name of the admin |

**Responses:**
| Status | Body                                          | Meaning                     |
|--------|-----------------------------------------------|-----------------------------|
| 200    | `{"status": "Game started"}`                  | Game started                |
| 400    | `{"error": "Game already started"}`           | Already in progress         |
| 403    | `{"error": "Only admin can start the game"}`  | Requester is not admin      |
| 404    | `{"error": "Lobby not found"}`                | Lobby ID does not exist     |

---

### `GET /get_state/<lobby_id>`

> **Migrated to Socket.IO.** The frontend no longer polls this endpoint. Lobby state is pushed to clients via `state_update` Socket.IO events whenever state changes. The REST endpoint still exists on the backend and drives automatic game logic (round timeouts, AI moves, auto-starts).

Returns the complete current state of a lobby and also drives automatic game logic — making it the heartbeat of every active game session.

**URL parameter:** `lobby_id`

---

#### What it does

Clients call this endpoint repeatedly (polling) to stay in sync with the server's authoritative game state. Beyond returning data, the endpoint also has **side effects** that advance the game automatically:

1. **Auto-starts boss fights** when `start_time` is reached.
2. **Auto-starts gremlin fights** immediately on first poll.
3. **Triggers bot / boss AI moves** every time it is called.
4. **Auto-resolves the round** when the 40-second timer expires.

This design means the game progresses even if no player explicitly calls a mutation endpoint — as long as someone is polling `get_state`.

---

#### Step-by-step execution flow

```
GET /get_state/<lobby_id>
  │
  ├─ 1. Look up lobby from in-memory store (config.lobbies dict)
  │       └─ If not found → return {"error": "Lobby not found"}
  │
  ├─ 2. [Boss fight auto-start]
  │       If boss_fight == True AND round == 0:
  │         Compare UTC now against lobby["start_time"]
  │         If now >= start_time:
  │           Set round = 1
  │           Set round_end_time = now + 40s
  │           Append "🔥 The boss-fight has begun!" to history
  │           Notify each player via their messages list
  │
  ├─ 3. [Gremlin fight auto-start]
  │       If gremlin_fight == True AND round == 0:
  │         Immediately set round = 1
  │         Set round_end_time = now + 40s
  │         Notify each player: "A Gremlin appeared in the forest!"
  │
  ├─ 4. [AI moves]
  │       For each player in lobby["players"]:
  │         If player is a bot (player["bot"] == True) AND alive:
  │           Call make_dummy_move(lobby, player)
  │             → Bot randomly picks action + resource + target
  │         If player is the boss (player["boss"] == True) AND boss hasn't moved yet:
  │           If gremlin_fight: call gremlin_take_action(lobby)
  │           Else:             call boss_take_action(lobby)
  │             → Boss picks attack target, applies special behaviour per boss type
  │
  ├─ 5. [Round timeout check]
  │       Convert round_end_time to UTC
  │       If now >= round_end_time:
  │         If NOT gameover AND NOT round_locked:
  │           Call resolve_round(lobby_id)   ← advances the game
  │         If round_locked (already resolving):
  │           Log warning, skip (prevents double-resolve race condition)
  │
  ├─ 6. [Build readyPlayers list]
  │       Collect names of players where
  │         submittedAction != "" AND submittedResource != ""
  │
  └─ 7. Return JSON response (see schema below)
```

---

#### Round resolution (`resolve_round`) — triggered by step 5

When `resolve_round(lobby_id)` is called (from `engine/combat.py`) it:

1. Sets `round_locked = True` to prevent concurrent calls.
2. Applies **resource bonuses** for each alive player:
   - `gain_hp` → restores HP
   - `gain_coin` → adds coins
   - `gain_attack` → raises attack stat
3. Executes the **attack phase**:
   - Players with `action = "attack"` deal damage to their chosen target.
   - Defenders take reduced damage.
   - Raiders skip the attack phase but may earn raid rewards.
4. Executes the **raid phase** (if applicable):
   - Players who chose `action = "raid"` attack the boss.
   - On boss defeat, raid winner and relics are awarded.
5. **Eliminates dead players** (HP ≤ 0).
6. **Checks game-end conditions**:
   - PvP: one survivor remains → `winner` is set.
   - Raid: boss HP ≤ 0 → `raidwinner` is set.
7. Advances `round += 1` and sets a new `round_end_time = now + 40s`.
8. Clears all `submittedAction`, `submittedResource`, `messages` for next round.
9. Sets `round_locked = False` and `submittedBossMoves = False`.
10. If `gameover`, persists stats to Supabase (`games`, `game_player_stats`, `players` tables).

---

#### Early resolution (all players submitted)

Round resolution also triggers from `submit_choice` without waiting for the timeout, when **every alive non-bot, non-spectator player** has submitted both an action and a resource. The same `resolve_round` function is called and the same `round_locked` guard prevents double-resolution.

---

#### Response schema

```json
{
  "round": 2,
  "players": [ ... ],
  "winner": null,
  "raidwinner": null,
  "pending_deny": null,
  "deny_target": null,
  "readyPlayers": ["Alice", "Bob"],
  "history": ["Alice created a lobby.", "Bob joined.", "..."],
  "round_end_time": "2024-01-01T12:00:40+00:00",
  "boss_fight": false,
  "gremlin_fight": false,
  "start_time": "2024-01-01T12:00:00+00:00",
  "gameover": false,
  "chat": [ ... ]
}
```

**Field descriptions:**

| Field            | Type             | Description |
|------------------|------------------|-------------|
| `round`          | integer          | Current round number. `0` = lobby/waiting, `1+` = in-game. |
| `players`        | array of objects | All player objects in the lobby (see Player Object below). |
| `winner`         | string \| null   | Name of the PvP winner, or `null` if game is ongoing. Set by `get_winner()` once one alive non-spectator player remains. |
| `raidwinner`     | string \| null   | Name of the player who landed the killing blow on the raid boss, or `null`. |
| `pending_deny`   | string \| null   | Name of the player who currently holds the "deny" ability and must choose a target. `null` if no deny is pending. |
| `deny_target`    | string \| null   | Name of the player who was most recently denied their choices. Cleared each round. |
| `readyPlayers`   | array of strings | Names of players who have submitted both an action and a resource this round. |
| `history`        | array of strings | Ordered event log for the entire session (game-wide). Entries are human-readable strings. |
| `round_end_time` | ISO 8601 string  | UTC timestamp when the current round timer expires and auto-resolution fires. |
| `boss_fight`     | boolean          | `true` if this lobby is a cooperative raid against a boss. |
| `gremlin_fight`  | boolean          | `true` if this lobby is a solo gremlin encounter. |
| `start_time`     | ISO 8601 string  | UTC timestamp when a scheduled boss fight is set to begin. Irrelevant for PvP lobbies. |
| `gameover`       | boolean          | `true` once the game has ended (winner determined or all players eliminated). |
| `chat`           | array of objects | Lobby chat messages (see Chat Message Object below). Max 100 entries kept. |

**Player Object fields:**

| Field               | Type    | Description |
|---------------------|---------|-------------|
| `name`              | string  | Player's display name. |
| `hp`                | integer | Current hit points. |
| `coins`             | integer | Current coin count. |
| `attack`            | integer | Current attack stat. |
| `alive`             | boolean | `false` once eliminated. |
| `admin`             | boolean | `true` for the lobby creator. |
| `bot`               | boolean | `true` for AI dummy players. |
| `boss`              | boolean | `true` for the raid boss entity. |
| `spectator`         | boolean | `true` for observers (no actions). |
| `submittedAction`   | string  | Current round action, or `""` if not yet submitted. Cleared after round resolves. |
| `submittedResource` | string  | Current round resource choice, or `""` if not yet submitted. Cleared after round resolves. |
| `target`            | string  | Chosen attack target name, or `null`. |
| `messages`          | array   | Private messages for this player this round (e.g. "You were denied"). Cleared each round. |
| `personal_history`  | array   | Round-by-round summary of this player's actions and outcomes. |
| `idle_rounds`       | integer | Consecutive rounds without submission. Players with `idle_rounds > 1` are skipped in resolution. |

**Chat Message Object fields:**

| Field       | Type   | Description |
|-------------|--------|-------------|
| `sender`    | string | Name of the player who sent the message. |
| `message`   | string | Message content (max 200 characters). |
| `timestamp` | string | UTC ISO 8601 timestamp of when it was sent. |

---

#### Important notes

- **In-memory state only.** All lobby data lives in a Python dict (`config.lobbies`). It is not persisted to the database until the game ends. A server restart will lose all active lobbies.
- **No authentication required.** This is a read-only GET endpoint and does not verify identity.
- **Side effects on every call.** Even though it is a GET endpoint, calling it can mutate lobby state (starting fights, resolving rounds). Clients should poll it frequently (every 1–2 seconds) while in an active game.
- **Double-resolve protection.** The `round_locked` flag prevents two concurrent requests from both triggering `resolve_round` at the same time.
- **`get_winner` logic.** Returns the name of the sole surviving non-spectator, non-boss player, or `null` if multiple are still alive.

---

### `GET /get_history/<lobby_id>`
Returns the full event log for a lobby.

**URL parameter:** `lobby_id`

**Responses:**
| Status | Body                              | Meaning                 |
|--------|-----------------------------------|-------------------------|
| 200    | `{"history": ["...", "..."]}`     | Event log returned      |
| 404    | `{"error": "..."}`                | Lobby not found         |

---

### `GET /get_player_messages/<lobby_id>/<player_name>`
Returns the private messages for a specific player in the current round.

**URL parameters:** `lobby_id`, `player_name`

**Responses:**
| Status | Body                                              | Meaning            |
|--------|---------------------------------------------------|--------------------|
| 200    | `{"player": "<name>", "messages": [...]}`         | Messages returned  |
| 404    | `{"error": "..."}`                                | Not found          |

---

### `GET /get_player_history/<lobby_id>/<player_name>`
Returns a player's personal round-by-round history.

**URL parameters:** `lobby_id`, `player_name`

**Responses:**
| Status | Body                                                   | Meaning            |
|--------|--------------------------------------------------------|--------------------|
| 200    | `{"player": "<name>", "player_history": [...]}`        | History returned   |
| 404    | `{"error": "..."}`                                     | Not found          |

---

### `POST /submit_choice/<lobby_id>`
> **Frontend uses Socket.IO:** `socket.emit('submit_choice', { lobby_id, player, action, resource, target })`

Player submits their action and resource choice for the current round.

**URL parameter:** `lobby_id`

**Request body:**
| Field      | Type   | Required | Description                                        |
|------------|--------|----------|----------------------------------------------------|
| `player`   | string | Yes      | Player name                                        |
| `action`   | string | Yes      | One of: `attack`, `defend`, `raid`                 |
| `resource` | string | Yes      | One of: `gain_hp`, `gain_coin`, `gain_attack`      |
| `target`   | string | No       | Target player name (required when action=`attack`) |

**Responses:**
| Status | Body                                           | Meaning                     |
|--------|------------------------------------------------|-----------------------------|
| 200    | `{"status": "choice received"}`                | Choice accepted             |
| 400    | `{"error": "Invalid action"}`                  | Unknown action value        |
| 400    | `{"error": "Invalid resource"}`                | Unknown resource value      |
| 404    | `{"error": "Lobby not found"}`                 | Lobby ID does not exist     |
| 409    | `{"error": "Invalid action: the game has ended"}` | Game is over             |

**Notes:**
- When all alive players have submitted, the round resolves automatically.
- Bot players make their moves automatically after this call.

---

### `POST /submit_deny_target/<lobby_id>`
> **Frontend uses Socket.IO:** `socket.emit('submit_deny_target', { lobby_id, player, target })`

A player who has the "deny" ability chooses which other player to deny choices for this round.

**URL parameter:** `lobby_id`

**Request body:**
| Field    | Type   | Required | Description                        |
|----------|--------|----------|------------------------------------|
| `player` | string | Yes      | Must match the player in `pending_deny` |
| `target` | string | Yes      | Player to deny                     |

**Responses:**
| Status | Body                   | Meaning                             |
|--------|------------------------|-------------------------------------|
| 200    | `{"success": true}`    | Deny applied                        |
| 400    | `{"error": "Invalid"}` | Player is not the pending denier    |

---

### `POST /add_dummy`
> **Frontend uses Socket.IO:** `socket.emit('add_dummy', { lobby_id, name })`

Admin adds an AI bot player to the lobby.

**Request body:**
| Field      | Type   | Required | Description       |
|------------|--------|----------|-------------------|
| `name`     | string | Yes      | Admin's name      |
| `lobby_id` | string | Yes      | Target lobby ID   |

**Responses:**
| Status | Body                                         | Meaning                     |
|--------|----------------------------------------------|-----------------------------|
| 200    | `{"status": "<bot_name> added"}`             | Bot added                   |
| 400    | `{"error": "Dummy already exists"}`          | Lobby already has a bot     |
| 403    | `{"error": "Only the admin can add a dummy."}` | Requester is not admin    |
| 404    | `{"error": "Lobby not found"}`               | Lobby ID does not exist     |

---

### `POST /send_message/<lobby_id>`
> **Frontend uses Socket.IO:** `socket.emit('send_message', { lobby_id, name, message })`

Sends a chat message to the lobby's shared chat.

**URL parameter:** `lobby_id`

**Request body:**
| Field     | Type   | Required | Description                        |
|-----------|--------|----------|------------------------------------|
| `name`    | string | Yes      | Sender's player name (must be in the lobby) |
| `message` | string | Yes      | Message content (max 200 characters) |

**Responses:**
| Status | Body                                           | Meaning                      |
|--------|------------------------------------------------|------------------------------|
| 200    | `{"status": "sent"}`                           | Message delivered            |
| 400    | `{"error": "Message cannot be empty"}`         | Empty message body           |
| 400    | `{"error": "Message too long..."}`             | Exceeds 200-character limit  |
| 403    | `{"error": "You are not in this lobby"}`       | Sender not a lobby member    |
| 404    | `{"error": "Lobby not found"}`                 | Lobby ID does not exist      |

**Notes:**
- Lobby chat is capped at the last 100 messages.
- Messages appear in the `chat` array returned by `get_state`.

---

## Raids (`/routes/raids.py`)

### `POST /get_raid_lobby`
Joins an existing open raid lobby, or creates a new one if none is available.

**Request body:**
| Field  | Type   | Required | Description             |
|--------|--------|----------|-------------------------|
| `name` | string | Yes      | Player name (must exist in DB) |

**Responses:**
| Status | Body                                                  | Meaning                    |
|--------|-------------------------------------------------------|----------------------------|
| 200    | `{"lobby_id": "<5-char-id>", "start_time": <datetime>}` | Raid lobby joined/created |
| 500    | `{"error": "<message>"}`                              | Server/database error      |

**Notes:**
- Raids use a shared, scheduled lobby. Multiple players can join the same raid.
- Boss is selected randomly from the `bosses` table.
- Hades bosses: HP=8, DMG=2. Regular bosses: HP=30, DMG=4.
- Interval between raids: 1 minute (`RAIDINTERVAL`).

---

### `GET /get_next_raid_time`
Returns the scheduled start time of the next raid.

**Response (200):**
```json
{ "start_time": "<datetime>" }
```

**Notes:**
- If the current raid has timed out (>2 min with no activity), it is marked as over and a new one is scheduled.

---

### `POST /create_gremlin_lobby`
Creates a private gremlin encounter (forest fight) for a single player.

**Request body:**
| Field  | Type   | Required | Description  |
|--------|--------|----------|--------------|
| `name` | string | Yes      | Player name  |

**Responses:**
| Status | Body                             | Meaning              |
|--------|----------------------------------|----------------------|
| 200    | `{"lobby_id": "<g-uuid>"}`       | Gremlin lobby created |
| 400    | `{"error": "Name is required"}`  | Missing name field   |

**Notes:**
- Gremlin stats: HP=5, DMG=1.
- The lobby starts immediately and the player is its admin.

---

### `POST /get_player_relics`
Returns all relics collected by a player across all raids.

**Request body:**
| Field  | Type   | Required | Description  |
|--------|--------|----------|--------------|
| `name` | string | Yes      | Player name  |

**Responses:**
| Status | Body                                     | Meaning               |
|--------|------------------------------------------|-----------------------|
| 200    | `{"relics": [<relic objects>]}`          | Relics returned       |
| 500    | `{"error": "Failed to fetch relics"}`    | Database error        |

**Relic object fields:**
- `id`, `boss_id`, `name`, `power-cathegory`, `flavour_text`, `created_at`, `count`

---

## Vault (`/routes/vault.py`)

### `POST /vault_check`
Validates an artifact code and records that it was found.

**Request body:**
| Field  | Type           | Required | Description                                    |
|--------|----------------|----------|------------------------------------------------|
| `code` | string or int  | Yes      | Numeric passkey or the original finder's name  |

**Responses:**
| Status | Body                                                                      | Meaning                       |
|--------|---------------------------------------------------------------------------|-------------------------------|
| 200    | `{"first": true}`                                                         | First person to find this     |
| 200    | `{"first": false, "seen_before": <count>, "og_keyfinder": "<name>"}`      | Already found before          |
| 401    | `{"success": false}`                                                      | Invalid code                  |

**Notes:**
- Numeric codes are matched against the `passkey` column.
- String codes are matched against the `og_keyfinder` column.
- Each valid check increments the `times_found` counter.

---

### `POST /vault_register_name`
Registers the first finder's name for an artifact (only works if unclaimed).

**Request body:**
| Field  | Type           | Required | Description         |
|--------|----------------|----------|---------------------|
| `code` | string or int  | Yes      | Artifact passkey    |
| `name` | string         | Yes      | Name to register    |

**Responses:**
| Status | Body                    | Meaning                              |
|--------|-------------------------|--------------------------------------|
| 200    | `{"success": true}`     | Name registered                      |
| 401    | `{"success": false}`    | Artifact not found                   |
| 403    | `{"success": false}`    | Already claimed by someone else      |

---

### `POST /vault_register_email`
Registers an email address for the first finder (only if `times_found == 1` and no email yet).

**Request body:**
| Field   | Type           | Required | Description         |
|---------|----------------|----------|---------------------|
| `code`  | string or int  | Yes      | Artifact passkey    |
| `email` | string         | Yes      | Email to register   |

**Responses:**
| Status | Body                    | Meaning                              |
|--------|-------------------------|--------------------------------------|
| 200    | `{"success": true}`     | Email registered                     |
| 401    | `{"success": false}`    | Artifact not found                   |
| 403    | `{"success": false}`    | Email already registered             |

---

## Leaderboards (`/routes/leaderboards.py`)

### `GET /leaderboards`
Returns top-5 rankings across four categories.

**Query parameters:**
| Param  | Type   | Required | Description                                   |
|--------|--------|----------|-----------------------------------------------|
| `type` | string | No       | `"monthly"` (default) or omit for all-time    |

**Response (200):**
```json
{
  "top_wins":       [{ "name": "...", "wins": 5 }, ...],
  "top_kills":      [{ "name": "...", "kills": 12 }, ...],
  "top_played":     [{ "name": "...", "played_games": 20 }, ...],
  "top_raid_wins":  [{ "name": "...", "raid_wins": 8 }, ...]
}
```

**Error (500):**
```json
{ "error": "Could not fetch leaderboard" }
```

**Notes:**
- Monthly: aggregates from `game_player_stats` filtered to the current month.
- All-time: reads totals directly from the `players` table.

---

## Chat (`/routes/chat.py`)

### `POST /send_city_message`
Sends a message to a city's global chat channel.

**Request body:**
| Field     | Type           | Required | Description                          |
|-----------|----------------|----------|--------------------------------------|
| `name`    | string         | Yes      | Sender's player name                 |
| `city_id` | integer/string | Yes      | ID of the city chat channel          |
| `message` | string         | Yes      | Message content (max 200 characters) |

**Responses:**
| Status | Body                                                       | Meaning                     |
|--------|------------------------------------------------------------|-----------------------------|
| 200    | `{"status": "sent"}`                                       | Message sent                |
| 400    | `{"error": "name, city_id, and message are required"}`     | Missing required fields     |
| 400    | `{"error": "Message too long (max 200 characters)"}`       | Message exceeds limit       |

**Notes:**
- City chat is stored in memory (not persisted). Max 200 messages per city kept.

---

### `GET /get_city_chat/<city_id>`
Fetches the chat history for a city channel.

**URL parameter:** `city_id` (integer or string)

**Response (200):**
```json
{
  "city_id": 1,
  "chat": [
    { "sender": "Alice", "message": "Hello!", "timestamp": "2024-01-01T12:00:00+00:00" }
  ]
}
```

---

## Game Constants

| Constant         | Value      | Description                                       |
|------------------|------------|---------------------------------------------------|
| `ROUND_DURATION` | 40 seconds | How long each round lasts before auto-resolve     |
| `BOSS_HP`        | 30         | Default raid boss HP                              |
| `BOSS_DMG`       | 4          | Default raid boss damage                          |
| `HADES_HP`       | 8          | Hades boss HP                                     |
| `HADES_DMG`      | 2          | Hades boss damage                                 |
| `GREMLIN_HP`     | 5          | Gremlin encounter HP                              |
| `GREMLIN_DMG`    | 1          | Gremlin encounter damage                          |
| `RAIDINTERVAL`   | 1 minute   | Time between scheduled raids                      |

---

## Authentication Model

There are no session tokens or JWTs. Authentication works by verifying that the supplied `name` + `email` pair matches the record stored in the `players` database table. Unregistered names are created on first use via `/claim_name`.

---

## CORS

CORS is enabled globally for all routes (`flask_cors.CORS(app)`). All origins are allowed with default settings.
