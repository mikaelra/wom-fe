# Text-Only Frontend Plan — World of Mythos Without the 3D

Status: **plan only — nothing built** · Scope: `wom-fe` only (**no backend change, no
protocol change, no `PROTOCOL_VERSION` bump**) · Written: 2026-09-02

Depends on / amends: `docs/CITY_SCENE_PLAN.md` (the three-scene shape this has to
mirror in text), `docs/CODEBASE_HARDENING_PLAN.md` (the `lib/` split this plan is
entirely parasitic on — see §0.4), `docs/MOBILE_AND_STEAM_PLAN.md` §5.3 (route
shapes and `output: "export"`, which constrain §4.3).

Reference repository: **`tjuvpakk-frontend`** (`mikaelra/tjuvpakk-frontend`,
`main` @ `48b4d1b`). This is the game's ancestor: a Vite + React SPA that rendered
the same game as flat HTML. The brief is to build a text-only mode in World of
Mythos "based on re-use of tjuvpakk-frontend".

> **The one thing to read before anything else.** That reuse is real, but it is
> reuse of an **interaction idiom**, not of code. Every line in
> `tjuvpakk-frontend` that talks to a backend is talking to a protocol that no
> longer exists — different transport, different identity model, different
> vocabulary, different state shape. §1 sets that out endpoint by endpoint,
> because getting this wrong is the single most expensive mistake available
> here: it looks like a copy-paste job and it is not. What *is* directly
> reusable is its **screen grammar** — a player list with per-row affordances,
> a round header, a plain action row, a message log — and that grammar happens
> to be the exact shape of the five controls this codebase has lost to 3D (§0.3,
> §6).

---

## 0. What exists today — read this first

Five facts shape this plan. Two of them are much better news than expected, and
one of them is the whole difficulty.

### 0.1 — Only four shipped routes mount a `<Canvas>`. Everything else is already text.

The app is far less 3D than it looks. Exhaustively, the routes that render WebGL:

| Route | Scene component | File |
|---|---|---|
| `/` | `WorldMap` | `src/app/page.tsx` |
| `/city` | `CityScene` | `src/app/city/page.tsx` |
| `/lobby` | `LobbyScene` | `src/app/lobby/page.tsx` |
| `/vault` | `VaultScene` | `src/app/vault/page.tsx` |

(`/modelling` is a fifth, but `next.config.ts`'s `pageExtensions` trick keeps it
out of every build — it is not a route that ships, and this plan ignores it.)

Every other route is already plain DOM with no Three.js anywhere in its import
graph: `/market`, `/shop` (+ `/cancel`, `/success`), `/inventory`, `/stats`,
`/settings`, `/rules`, `/rules/[page]`, `/login`, `/signup`, `/terms`,
`/privacy`, `/refunds`, `/forgot_username`, `/verify_email`, `/email_verified`,
and the `/lobby/[lobbyId]` legacy redirect.

**So "text-only mode" is a four-route problem, not an app-wide one.** Three of
those four are load-bearing (`/`, `/city`, `/lobby`); `/vault` is a text page
with a decorative scene behind it and is nearly free (§5.4).

`src/components/wheel/WheelCanvas.tsx` is a `<canvas>`, but a 2D one
(`getContext('2d')`) — it is not 3D and stays exactly as it is in text mode.

### 0.2 — The game HUD is already a DOM component, and it already has a no-3D branch.

`src/components/SceneOverlay.tsx` (976 lines) is the actual game HUD — round
number, timer, HP/coins/ATK cards, enemy panel, chat, messages — and it imports
nothing from Three.js. It is a pure React/Tailwind overlay. So is
`LobbyOverlay.tsx`, which wraps it.

Better still, `SceneOverlayConfig` already carries the exact seam this plan
needs:

```ts
/** When true the WELL/DEFEND/resource/nametag buttons are suppressed from the
 *  overlay — the 3D scene renders them anchored to the player model instead. */
hidePlayerActionButtons?: boolean;
/** When true the enemy HP panel is not rendered here — the 3D scene renders it
 *  anchored to the enemy model instead. */
suppressEnemyPanel?: boolean;
```

Both **default to `false`**, and the `false` branches are live code
(`SceneOverlay.tsx:842`, `:863`, `:877`, `:895`) rendering WELL, the nametag,
DEFEND and the resource cards from the overlay itself. `LobbyOverlay`'s
`lobbyConfig` sets both to `true` because `LobbyScene` took those jobs over.

**Flipping them back is most of the text lobby.** That is the good news.

**[caveat — do not skip]** Those branches are not a *document*; they are a
*screen overlay* that assumes a scene behind it. They position with
`top: '54%'`, `top: '59%'`, `top: '65%'`, `top: '72%'`, `left: '50%'`,
`transform: translate(-50%,-50%)`, and they render `<ActionImageButton>` —
PNGs (`/images/buttons/well-ld.png`) — not text. Reused verbatim on a blank
background you get floating images at arbitrary viewport percentages, which is
not what anyone means by "text only". §4.2 decides what to do about that.

### 0.3 — Five game actions exist **only** inside the 3D scene. This is the real work.

`grep` for the emit sites is unambiguous. Every one of these lives in
`src/components/lobby/LobbyScene.tsx` and has **no DOM equivalent anywhere**:

| Action | Wire event | Site | How it is reached today |
|---|---|---|---|
| Attack a specific player | `submit_choice {action:'attack', target}` | `LobbyScene.tsx:1197` | click a player's 3D avatar |
| Attack a lost soul | `submit_choice {action:'attack', target}` | `LobbyScene.tsx:1206` | click one of N soul meshes |
| Choose a deny target | `submit_deny_target {target}` | `LobbyScene.tsx:1216` | click the floating `DenyModelButton` GLB |
| Kick a player | `kick_player {target}` | `LobbyScene.tsx:~1236` | click ❌ beside a 3D nametag |
| Spend a relic | `toggle_relic_selection {relic_id}` | `LobbyScene.tsx:~1240` | popover off a 3D nametag |

`SceneOverlay`'s own `handleAction('attack')` (`:413`) sends
`target: act === 'attack' && enemy ? enemy.name : undefined` — it can only
attack *the boss*. **PvP targeting does not exist outside the 3D scene.** A text
mode that only flips §0.2's flags produces a lobby where you cannot attack
anybody, cannot resolve a deny, cannot kick, and cannot spend a relic.

The code says why, in a comment worth quoting because it is also the fix:

> `// Lobby-wait controls (pre-game only) — kicking and relic selection used to`
> `// live in the 2D "Players in Lobby" overlay list; that list is gone, so`
> `// they're wired up here instead, next to each player's name.`

**That deleted 2D list is precisely what `tjuvpakk-frontend` still has.** Its
`Lobby()` renders `state.players.map(...)` as an `<li>` per player carrying
status glyphs and an inline ❌ kick. Rebuilding it — one list, five affordances
— is the spine of this plan (§6), and is the sharpest sense in which this is
"re-use of tjuvpakk-frontend".

### 0.4 — The data layer is already render-agnostic. It is the whole reuse surface.

Phase 1–2 of `docs/CODEBASE_HARDENING_PLAN.md` already did the hard part. These
modules know nothing about how anything is drawn and are consumed unchanged by
text mode:

- `lib/http.ts` — `request()`, `ApiError`, `SchemaMismatchError`, the per-lobby
  session-token store and the account-token store.
- `lib/socket.ts` — the typed `ServerToClientEvents`/`ClientToServerEvents`
  maps, `getSocket()`, schema-validating `subscribe()`, `subscribeConnect()`.
- `lib/schemas.ts`, `types/game.ts` — every wire shape, as zod.
- `lib/api.ts` — the whole REST surface (669 lines).
- `lib/useLobbyConnection.ts` — join/rejoin/room lifecycle, `state_update` →
  React state, chat folding, connection status, the pre-game polling fallback.
- `lib/useLobbyGame.ts` — **already exposes every derivation the text UI needs**:
  `phase`, `myPlayer`, `isAdmin`, `isReady`, `canAct`, `isDenied`,
  `isPendingDenyChooser`, **`eligibleDenyTargets`**, `enemy`, `winner`,
  `wellWinner`.
- `lib/gameEvents.ts`, `lib/useGameEvents.ts`, `lib/useRoundTimer.ts`,
  `lib/useCountdown.ts`, `lib/useBossfightCountdown.ts`,
  `lib/useEnterBossfight.ts`, `lib/useEnterRanked.ts`, `lib/useRankedQueue.ts`,
  `lib/useAuthFlow.ts`, `lib/useMarketConnection.ts`, `lib/market.ts`,
  `lib/sounds.ts`, `lib/music.ts`, `lib/soundSettings.ts`, `lib/cities.ts`,
  `lib/lobbyErrors.ts`, `lib/tradeUps.ts`, `lib/cosmetics.ts`.

`eligibleDenyTargets` is worth pausing on: `useLobbyGame` computes it, it is
unit-tested, and **nothing currently renders it** — `LobbyScene` derives its own
deny affordance from `isPendingDenyChooser` plus mesh proximity. The text list
is its first consumer.

**The `lib/` modules that must NOT be pulled into a text render tree** (they
import Three.js and would drag the engine back into the bundle):
`astrology.ts`, `avatarFade.ts`, `citySkyGeometry.ts`, `gazeFocus.ts`,
`milkyWay.ts`, `skyLocal.ts`, `usePanOffset.ts`.

### 0.5 — `tjuvpakk-frontend`'s data layer is dead protocol. Reuse the idiom, not the plumbing.

`tjuvpakk-frontend` is ~1,800 lines across 12 files, with `App.tsx` alone at
1,139 — `Home()` and `Lobby()` as two god-components doing their own `fetch`,
their own polling, their own `alert()` error handling, with inline `style={{}}`
objects next to Tailwind classes and Norwegian `console.error` strings.

It is a genuinely useful reference for *what a screen of this game looks like as
text*. It is a genuinely dangerous reference for *how to talk to the backend*.
§1 is the itemised proof.

---

## 1. The protocol diff, in full

The brief flags this and it is correct: the dialogue has changed almost
completely. This section is the reference to check any borrowed line against.

### 1.1 Transport — polling became push

**tjuvpakk:** `Lobby()` runs `setInterval(fetchState, 2000)` against
`GET /get_state/{lobbyId}`, plus a second effect polling
`GET /get_player_messages/{lobbyId}/{playerName}` on every round change. Every
mutation is its own `POST`. There is no socket in the repo at all — `package.json`
has no `socket.io-client`.

**wom-fe:** Socket.IO is the game transport. `state_update` is pushed on every
change; `chat_message` is pushed and folded into `state.chat`; and **every
in-lobby mutation is a socket emit**, not a request:
`start_game`, `kick_player`, `add_dummy`, `toggle_relic_selection`,
`submit_choice`, `submit_deny_target`, `send_message`, `join_lobby`,
`join_room`, `leave_room`, `join_ranked_queue`, `watch_bossfight`,
`watch_city_presence`, `join_market`, `send_market_message`.

`GET /get_state/{id}` **is gone.** Anything in `tjuvpakk` shaped like "fetch the
state and set it" is not portable; `useLobbyConnection` is its replacement and
already handles the parts `tjuvpakk` never did: rejoining the room on every
reconnect (Socket.IO rooms are keyed by connection, so a reconnect silently
drops every room), and refusing to flip back to `connected` on raw transport
recovery alone.

The one polling fallback that survives is deliberate and narrow:
`useLobbyConnection` re-emits `join_room` every 3s **only while `round === 0`**,
covering the idle pre-game window where a dropped broadcast has no other event
to self-correct it.

### 1.2 Identity — the client used to assert it; now the server derives it

This is the deepest change and the one most likely to be copied wrongly.

**tjuvpakk** sends the actor's identity in the request body, and trusts itself:

```ts
// tjuvpakk-frontend/src/App.tsx — start game
body: JSON.stringify({ admin: playerName })
// — kick
body: JSON.stringify({ admin: playerName, target: p.name })
```

The client tells the server who it is *and* that it is the admin.

**wom-fe** issues a **per-lobby session token** on join (HTTP
`create_lobby`/`get_bossfight_lobby` responses, and the socket `joined_lobby`
ack). The token is presented once on `join_room`, which binds the connection;
after that **every action event derives the actor server-side from that binding,
and carries no name, no `admin`, no identity at all**:

```ts
kick_player:  (payload: { lobby_id: string; target: string }) => void;
submit_choice:(payload: { lobby_id: string; action?: ...; resource?: ...; target?: ... }) => void;
```

Two token stores, deliberately different (`lib/http.ts`):

| | Per-lobby session token | Account session token |
|---|---|---|
| Key | `wom_session_token` | `wom_account_session` |
| Storage | `sessionStorage`, **keyed by `lobby_id`** | `localStorage` |
| Why | reissued on every join, and one tab can hold membership in several lobbies at once — a single global slot let one lobby's token clobber another's | one per account, meant to survive tabs and restarts |
| Accessors | `getStoredToken(lobbyId)` / `setStoredToken` | `getStoredAccountToken()` / `setStoredAccountToken` |

**Text mode must not invent an identity path.** It goes through `api.ts` and
`useLobbyConnection` like everything else, and any borrowed `tjuvpakk` handler
that puts a name in a body is wrong by construction.

### 1.3 Versioning handshake — new, and mandatory

Neither exists in `tjuvpakk`. Both are automatic if you use `lib/http.ts` and
`lib/socket.ts`, and are silently missing if you hand-roll a `fetch`:

- REST: `X-Protocol-Version: 2` on every request (`http.ts`'s `request()`).
- Socket: `io(BACKEND_URL, { auth: { protocol_version: PROTOCOL_VERSION } })`,
  checked server-side in the connect handler *before* any room binding.

`config.ts` also now refuses to fall back to a default backend in a production
build (`NEXT_PUBLIC_BACKEND_URL` unset ⇒ throw), where `tjuvpakk` hardcoded
`https://tjuvpakk-backend.onrender.com` in source. **Text mode changes no wire
shape, so `PROTOCOL_VERSION` stays at 2.**

### 1.4 Vocabulary — "raid" is retired

`docs/CITY_SCENE_PLAN.md` §1.1 settled this: **"Bossfight" and "The Well", never
"raid"**. "Raid" meant both at different times, which is why it had to go. The
rename reaches the wire:

| tjuvpakk | wom-fe |
|---|---|
| `GET /get_next_raid_time` | `GET /get_next_bossfight_time` |
| `POST /get_raid_lobby` | `POST /get_bossfight_lobby` |
| `LobbyState.raidwinner` | `LobbyState.wellwinner` |
| `raid_wins` | `well_wins` (backend migration `ea153b861903`) |
| copy: "Boss-fight", "boss fight", "BOSSFIGHT" | **Bossfight** |

The one deliberate exception is `isBossFight`, which mirrors the wire field
`boss_fight`. New text-mode copy follows the current vocabulary; borrowed
`tjuvpakk` strings do not.

### 1.5 Validation — every payload is parsed, and drift is loud

`tjuvpakk` casts: `const json: LobbyState = await res.json();`. A backend change
produces `undefined` deep inside a render.

`wom-fe` parses every REST response and every socket payload against zod
(`EVENT_SCHEMAS` in `socket.ts`, `request(path, schema)` in `http.ts`). A bad
socket payload is logged with a formatted diff and **dropped**; a bad REST body
throws `SchemaMismatchError`. Text mode inherits this for free and must not
introduce a parse-free path around it.

### 1.6 State shape — field by field

`LobbyState`:

| Field | tjuvpakk | wom-fe | Note |
|---|---|---|---|
| `round`, `players`, `winner`, `pending_deny`, `deny_target`, `readyPlayers`, `round_end_time` | ✅ | ✅ | unchanged |
| `raidwinner` | ✅ | ❌ | → `wellwinner` |
| `start_time` | `number` | `string \| null` | **always an ISO8601 string.** `tjuvpakk` typed it `number` and only "worked" because `new Date()` accepts either |
| `boss_fight` | `boolean \| null` | `boolean` | no longer nullable |
| `gameover` | `boolean \| null` | `boolean` | no longer nullable |
| `chat` | ❌ | `ChatMessage[]` | in-lobby chat did not exist |
| `history` | ❌ | `string[]` | |
| `deny_denier` | ❌ | `string \| null` (optional) | who performed the deny |
| `ranked`, `ranked_countdown_deadline`, `ranked_results` | ❌ | optional | `docs/RANK_SYSTEM_PLAN.md` §10 |

`Player`:

| Field | tjuvpakk | wom-fe | Note |
|---|---|---|---|
| `name`, `hp`, `coins`, `attackDamage`, `alive`, `admin`, `spectator`, `idle_rounds`, `title`, `boss` | ✅ | ✅ | `title`/`boss` now explicitly nullable/required |
| `messages` | ✅ | ❌ | never sent on `state_update` |
| `submittedAction`, `submittedResource`, `target` | ✅ | ❌ | **removed by the backend's hidden-info fix** |
| `bot`, `bot_type` | ❌ | ✅ | |
| `lost_soul` | ❌ | ✅ | |
| `skin`, `cosmetic` | ❌ | ✅ (optional) | |
| `selected_relic_ids` | ❌ | ✅ (optional) | |
| `wheel_awarded`, `artifact_awarded`, `pending_relic_nudge`, `pending_wheel_nudge`, `pending_artifact_nudge` | ❌ | ✅ | post-match claim flows |

**🔴 One `tjuvpakk` screen must never be ported.** Its player list contains:

```tsx
{playerName == "Verden" && p.name !== playerName && (
  <div>❤{p.hp} 💰{p.coins} ⚔{p.attackDamage}
       {p.submittedResource}{p.submittedAction}{p.target}</div>
)}
```

A hardcoded name unlocking every other player's *submitted choices for the
current round* — a god view over hidden information, gated on a string. The
fields behind it were deliberately removed from the wire, and the pattern must
not come back in any form. When copying that `<li>`, copy the glyph row and drop
this block.

### 1.7 Endpoint-by-endpoint

| tjuvpakk call | Status in wom-fe | Replacement |
|---|---|---|
| `GET /get_state/{id}` | **removed** | socket `state_update` (`useLobbyConnection`) |
| `POST /submit_choice/{id}` | **now a socket event** | `submit_choice` |
| `POST /submit_deny_target/{id}` | **now a socket event** | `submit_deny_target` |
| `POST /start_game/{id}` | **now a socket event** | `start_game` |
| `POST /kick_player/{id}` | **now a socket event** | `kick_player` |
| `POST /add_dummy` | **now a socket event** | `add_dummy {bot_type}` |
| `POST /join_lobby/{code}` | **now a socket event** | `join_lobby`; `api.joinLobby()` wraps the emit + `joined_lobby`/`error` ack in a promise |
| `POST /create_lobby` | kept (REST) | `api.createLobby()` — now also returns and stores a `token` |
| `GET /get_player_messages/{id}/{name}` | kept, **changed** | now `?token=`-gated and returns `{messages, events, instakill}` (§1.9) |
| `POST /get_raid_lobby` | renamed | `POST /get_bossfight_lobby` |
| `GET /get_next_raid_time` | renamed | `GET /get_next_bossfight_time` |
| `POST /get_player_relics` | kept | `api.getPlayerRelics()` |
| `POST /log_in` | kept, expanded | `/log_in` + `/verify_code` + `/check_name` + `/claim_name` |
| `POST /claim_name` | kept | |
| `GET /leaderboards` | **removed** | per-player `/player/profile/{name}`, `/ranked/profile/{name}`, `/well/profile/{name}` behind `/stats` |
| `POST /vault_check`, `/vault_register_name`, `/vault_register_email` | **removed** | the passkey mechanic is retired (`wom-be` `routes/vault.py` deleted); `/vault` is now the public `/artifacts/ledger` |

### 1.8 Whole subsystems with no `tjuvpakk` ancestor

None of these existed. All are already pure DOM (§0.1) and so are **already
"text mode"** — they need nothing but a check that no 3D chrome wraps them:

- **Market** — `/market/catalog`, `/listings`, `/trades`, `/enter`,
  `/accept_terms`, `/listings/{id}/accept`, `/listings/{id}/cancel`, plus a
  socket room (`join_market`, `listing_created/updated/expired`,
  `market_chat_message`, `market_chat_backlog`, `market_frogs`).
- **Ranked** — `/ranked/queue/join|leave`, `/ranked/profile`, `/ranked/active`,
  socket `join_ranked_queue`, `joined_ranked_queue`, `ranked_match_found`.
- **Inventory / cosmetics / skins / trade-up** — `/inventory`, `/inventory/equip`,
  `/inventory/equip_cosmetic`, `/inventory/trade_up`, `/tradeup/rules`.
- **Wheel** — `/wheel/spin`, `/wheel/tables`.
- **Shop** — `/shop/products`, `/shop/checkout` (with `code` discriminators).
- **Artifacts** — `/artifacts/ledger`, `/claim_pending_artifact`.
- **Account** — `/log_out`, `/resolve_account_session`,
  `/get_always_verify_email_flag`, `/request_toggle_verify_email`,
  `/confirm_toggle_verify_email`, `/confirm_email_verification`,
  `/forgot_username`, `/check_claim_verified`.
- **City ambience** — `watch_city_presence` → `city_presence`,
  `watch_bossfight` → `bossfight_roster`, `online_count`. These feed 3D signage
  today; §5.2 reuses the data as text.

### 1.9 `get_player_messages` — same URL, different contract

The one endpoint present in both, and the trap. `tjuvpakk` reads
`json.messages` as strings and renders them; wom-fe's `useGameEvents` reads
`{ messages, events, instakill }`, where `events` are the structured
`GameEvent`s in `lib/gameEvents.ts`:

```
outgoing     { target, outcome: hit|blocked|reflected|instakill|instakill_blocked,
               attackerDied, eliminated?, coinsReceived?, damage?, reflectDamage? }
incoming     { attacker: string|null, outcome: hit|blocked|reflected_back|…, … }
witness      { attacker, victim }
well_reward  { components: [{ type: gold|health|sword|instakill|deny|info|steal, count, victims? }] }
```

The module docstring is explicit: *"These replace the old regex-parsing of the
human-readable message strings — the messages are display-only now."*
`attacker: null` is meaningful — the backend anonymised the attack (deception
mechanic) and the client genuinely does not know.

**For text mode this is a gift.** The structured events are exactly what a
readable combat log wants, and a text log is arguably their most honest
consumer — see §5.3.4.

---

## 2. Locked decisions

1. **Text mode is a render-layer feature.** No backend change, no new endpoint,
   no wire-shape change, no `PROTOCOL_VERSION` bump. Everything it needs is
   already on the wire.
2. **One data layer, two render layers.** Text mode consumes the *same*
   `lib/` hooks as the 3D mode (§0.4). No parallel fetching, no second socket
   path, no divergent state. A bug fixed in `useLobbyConnection` is fixed in both.
3. **The reuse from `tjuvpakk-frontend` is its screen grammar**, above all the
   **player list with per-row affordances** (§0.3, §6). Its data layer is not
   ported (§1). Its Norwegian log strings, `alert()` error handling, inline
   `style={{}}` and god-view block (§1.6) are not ported either.
4. **Text mode is a real mode, not a degraded one.** Every action available in
   3D is available in text. A mode that cannot attack a player is not shippable.
5. **The setting is device-local**, in `localStorage`, following
   `lib/soundSettings.ts` exactly. Which renderer suits you depends on the
   machine you are on, not on who you are logged in as — the same reasoning
   already written down for audio.
6. **Default stays 3D.** Text mode is opt-in.
7. **Text mode must actually avoid downloading Three.js.** A "text mode" that
   still ships a 3.5 MB engine to a machine that cannot run it has missed the
   point. This is not free today — see §4.3.
8. **The three-scene shape survives** (`docs/CITY_SCENE_PLAN.md` §1): world map →
   city → lobby. Text mode renders the same three places and the same
   navigation, not a flattened menu. Locked decisions 3 and 4 of that plan
   (lobby controls on the world map; Rules and the user menu in a continuous
   top bar) hold in text too.

---

## 3. The setting

### 3.1 Storage

New module `src/lib/renderMode.ts`, modelled line-for-line on
`lib/soundSettings.ts` (module-level listener `Set`, write-through, SSR guards):

```ts
export type RenderMode = '3d' | 'text';
export function getRenderMode(): RenderMode;          // default '3d'
export function setRenderMode(mode: RenderMode): void;
export function subscribeRenderMode(fn: () => void): () => void;
```

- Key: `renderMode`. Any unrecognised stored value falls back to `'3d'` —
  never trust a hand-edited or half-written value (`readVolume`'s reasoning).
- `typeof window === 'undefined'` ⇒ `'3d'`, so an SSR pass and Node tests behave.

### 3.2 A URL override

`?text=1` forces text mode for one page load without writing the preference;
`?text=0` forces 3D. Precedent: `docs/CITY_SCENE_PLAN.md` §6.6's `?t=`. This is
for support ("open this link and tell me if it loads") and for E2E, and it is
worth having before the first bug report from a machine nobody on the team owns.
Unparseable values fall back to the stored preference rather than erroring.

### 3.3 The hydration hazard — call it out now

`localStorage` read during render ⇒ server HTML and first client render
disagree ⇒ React hydration error. The repo already has the idiom, in
`settings/page.tsx` and `hud/SceneTopBar.tsx`:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return null;
```

`useRenderMode()` (§4.1) must return `'3d'` until mounted and only then settle to
the stored value, and every route branching on it must tolerate one frame of
`'3d'`. Two consequences to design for, not discover:

- The 3D chunk must not be *fetched* during that frame. `dynamic(..., {ssr:false})`
  loads on render, so the branch has to gate the element, not just its output.
- The first paint in text mode should be the text shell, not a flash of the
  loading curtain. Prefer rendering `null` (or a neutral shell) pre-mount over
  rendering the 3D path optimistically.

### 3.4 Where the toggle lives

Three surfaces, one setting:

1. **`/settings`** — the canonical home, in a new "Display" block beside
   `AudioSettingsPanel`, with a sentence of copy saying what it does (turns off
   3D rendering; the game plays the same; helps on low-end machines and slow
   connections; takes effect on reload — see §4.4).
2. **The user menu in `SceneTopBar`** — a one-tap escape hatch. Somebody whose
   GPU is choking needs to leave 3D from the screen that is choking, not
   navigate three pages through it. This is the same top bar the world map and
   city share (`CITY_SCENE_PLAN.md` locked decision 4), so one edit covers both.
3. **The `ErrorBoundary` fallback** — if a WebGL scene has just crashed, "switch
   to text mode" is the single most useful button that can be on that screen.
   `src/components/ErrorBoundary.tsx` already exists and is already DOM.

**[open question — §10.1]** Whether the toggle should also auto-suggest itself
when `lib/deviceQuality.ts`'s `isLowQuality()` is true.

---

## 4. Architecture

### 4.1 The seam

```
src/lib/renderMode.ts        # storage + subscribe (§3.1)
src/lib/useRenderMode.ts     # hook: mounted-gated, honours ?text= (§3.2–3.3)
src/components/text/         # the text render layer (new)
```

Each of the four 3D routes becomes a two-line branch at the top of its
component:

```tsx
const mode = useRenderMode();
if (mode === 'text') return <TextLobby lobbyId={lobbyId} />;
```

The branch goes **in the existing route file**, not in a parallel route tree.
Two reasons: the route's non-visual concerns (query-param parsing, the Suspense
boundary `useSearchParams` requires, auto-join, the join/auth overlay, music)
are shared and must not be duplicated; and `output: "export"` (§4.3 /
`MOBILE_AND_STEAM_PLAN.md` §5.3) makes a parallel `/text/...` route tree a
second set of statically-exported pages to keep in sync forever.

### 4.2 What the text layer is made of

Three tiers, cheapest first:

**Tier 1 — reuse as-is.** Components that are already DOM and already
mode-agnostic: `ResourceCard`, `Toast`, `RulesModal`, `StartGameButton`,
`RelicSelectionPopover`, `RelicCooldownOverlay`, `BossSignupNudge`,
`WheelClaimNudge`, `ArtifactClaimNudge`, `ArtifactLedger`, `AuthGatePopup`,
`MarketBoard`, `WheelSpinModal`, `TradeUpModal`, `RankBadge`,
`MusicToggleButton`, `SfxToggleButton`, `ErrorBoundary`.

**Tier 2 — reuse behind a config flag.** `SceneOverlay` with
`hidePlayerActionButtons: false`, `suppressEnemyPanel: false`,
`stageCombatDamage: false` (§7.1), plus a new `layout: 'scene' | 'document'`
config field. `'document'` is the fix for §0.2's caveat: it swaps the
percentage-positioned absolute wrappers for ordinary flow layout and the
`ActionImageButton` PNGs for text buttons, without touching any of the 900 lines
of state logic above them. This is deliberately a *third* flag rather than
overloading `hidePlayerActionButtons`, whose existing meaning ("the 3D scene
owns these") is a different question from "how are they laid out".

**[assumption, flagged]** That `layout` cleaves cleanly. `SceneOverlay` is 976
lines and the positioning is scattered through the JSX rather than centralised.
If it turns out to fight back, the fallback is a `TextGameView` that consumes the
same hooks directly and leaves `SceneOverlay` untouched — more duplication, less
risk. Decide at step 4 of §11, on the code, not now.

**Tier 3 — build new.** The five lost controls, as one component (§6), plus the
text city and text world map (§5.1–5.2).

### 4.3 Actually shedding the bundle — a real refactor, not a flag

Today `<Canvas>` is a **static** import in all three main route files:

```tsx
// src/app/page.tsx, src/app/city/page.tsx, src/app/lobby/page.tsx
import { Canvas } from '@react-three/fiber';
```

The *scenes* are `dynamic(..., { ssr:false })` and so are split out — but the
static `Canvas` import pulls `@react-three/fiber` (and transitively `three`)
into each route's own chunk. **A text-mode branch below that import saves
nothing.** Locked decision 7 therefore requires a mechanical refactor: push
`<Canvas>` down inside each dynamically-imported scene wrapper so that
`@react-three/fiber` appears only in the lazily-loaded chunk.

Care needed, because the `<Canvas>` props are load-bearing and documented:

- `/lobby`: `camera={{ position:[33,26,33], fov: BASE_FOV }}`, `dpr={[1,2]}`,
  `gl={{ powerPreference:'high-performance' }}`.
- `/city`: `camera={{ position: CITY_CAMERA, fov: CITY_FOV }}`, `dpr={[1,2]}`,
  and **`style={{ isolation:'isolate' }}`, which is load-bearing** — `FreshHtml`
  appends 3D-anchored labels with drei z-indices up to 16777271, and without a
  stacking context on the container those escape into the root context and
  strike through the user menu. Same on `/`. This must move with the `Canvas`,
  and the comments explaining it must move with it.
- `BASE_FOV`, `CITY_CAMERA`, `CITY_FOV` are imported from modules that
  themselves import Three (`sceneConstants.ts` is clean; `CityScene.tsx` is not
  — `/city` imports `CITY_CAMERA`/`CITY_FOV` **from `CityScene.tsx` itself**,
  which is a second static edge into the engine and must move too).

**Verify, don't assume.** Step 9 of §11 is an actual bundle check
(`next build` output, or `@next/bundle-analyzer`) proving no `three` chunk is
requested on a text-mode page load. Without that check this decision is a
wish.

### 4.4 Reload semantics

Flipping the toggle mid-session: simplest correct behaviour is to persist and
then `window.location.reload()`. Live-switching would need to tear down a WebGL
context and rebuild a component tree mid-match, and `SceneTopBar`'s logout
handler already records the repo's instinct here — *"a location.reload() here
would tear down and re-initialise the entire WebGL scene just to swap the
top-bar button"* — which cuts the other way for a change that is *about* the
scene. A reload from inside a lobby is safe: `useLobbyConnection` rejoins from
the `sessionStorage` token, which is the same path a refresh already takes.
Say so in the toggle's copy.

---

## 5. Route by route

### 5.1 `/` — the world map as text

3D today: a globe with clickable city markers; `WorldMapOverlay` (already DOM)
carries the top bar and the create/join lobby controls.

Text: keep `WorldMapOverlay` verbatim, replace the globe with a list of places
from `lib/cities.ts` (`CITIES`, `findCity`, `CITY_PATH`), one row per city with
its `actionLabel`/`name`. The marker's data-driven design
(`CITY_SCENE_PLAN.md` §4.2 — no `city.name === 'Athens'` checks) means the list
is a `.map()` over the same source, and `handleCityClick`'s vault/rules/city
branching is reused unchanged.

`CityLoadingScreen` (the entry curtain) is a 3D component — text mode navigates
without it.

Precedent worth stealing: `tjuvpakk`'s `Home()` is exactly this screen — name
field, join-code field, Create Lobby, an "Enter Boss-fight" line, and a stack of
links. The layout is right; the handlers behind it are §1.7's left column.

### 5.2 `/city` — the city as text

3D today: Athens under a real sky, with a signpost (Bossfight / Ranked arms),
a Temple, a Senate, a Market, and occupancy signs.

Text: a place with exits. Reuse the same hooks the 3D page already calls —
`useEnterBossfight`, `useEnterRanked`, `useBossfightCountdown`,
`useBossfightRoster`, `bossfightSignSublabel`, `useCityPresence` — and render
their output as lines instead of signage:

```
Athens
  The Temple    Bossfight — WAITING · starts in 12m 04s     [Enter]
  The Senate    Ranked — 3 in queue                         [Play Ranked]
  The Market    7 in market                                 [Enter]
  ← Back to Earth
```

`bossfightSignSublabel()` already produces that caption string, and
`useCityPresence` already yields the counts. `CityOverlay` and both
`AuthGatePopup`s are already DOM and are reused as-is. The sky, the ephemeris
(`astrology.ts`, `skyLocal.ts`, `citySkyGeometry.ts`) and `?t=` are 3D-only and
simply absent — text mode must not import them (§0.4).

### 5.3 `/lobby` — the game

The one that matters. Four phases from `useLobbyGame`'s `phase`.

#### 5.3.1 `loading`
`state === null`. A line of text. No curtain.

#### 5.3.2 `lobby` (pre-game, `round === 0`)
- Lobby code + `InviteSection` (copy link / QR — already DOM, reused).
- **The player list** (§6), carrying kick and relic selection.
- `StartGameButton` for the admin (reused; keeps its 5s grace window).
- Add Bot → `add_dummy { bot_type }`.
- Bossfight countdown when `boss_fight`.
- Chat.

#### 5.3.3 `playing`
- Round number, round timer (`useRoundTimer` off `round_end_time`).
- Enemy panel when there is a boss (`suppressEnemyPanel: false`).
- **The player list** (§6), now carrying Attack and Deny.
- Action row: Well / Defend (Attack lives per-row, where its target is).
- Resource cards (`ResourceCard`, reused) — HP / coins / ATK.
- The combat log (§5.3.4).
- Chat.

#### 5.3.4 The combat log — text mode's one genuine advantage
`useGameEvents` returns both display strings and structured `events`. 3D spends
those events on sword arcs, shield flashes, damage numbers and flying reward
models. Text mode renders them as a round-stamped log:

```
Round 7
  You attacked Kari — blocked.
  Someone attacked you — 2 damage.        (attacker: null → "Someone", §1.9)
  Ola eliminated Nils.
  You won The Well: +2 ❤, +1 ⚔
```

Every one of those lines is a direct read of an `OutgoingEvent` /
`IncomingEvent` / `WitnessEvent` / `WellRewardGrantEvent` — no regex, no
parsing, no new endpoint. Keep `messages` as the fallback for anything the
structured events do not cover, exactly as they are "display-only now".

`tjuvpakk` had a `FloatingMessage` component for this and polled the strings; the
*idea* (a per-round readout of what happened to you) is the reusable part.

#### 5.3.5 `gameover`
`SceneOverlayConfig.renderGameOver` is already a render-prop the config supplies
— text mode passes a text version. `ranked_results` (tier before/after,
promoted) renders as text with the existing `RankBadge`. The claim nudges
(`BossSignupNudge`, `WheelClaimNudge`, `ArtifactClaimNudge`) are already DOM and
must keep working — they gate real rewards and are the most expensive thing to
silently break.

### 5.4 `/vault` — nearly free

The page is already a DOM card (`ArtifactLedger`) with `VaultScene` as a
backdrop. Text mode: skip `<VaultScene/>`, keep the card. One conditional.

### 5.5 Everything else

No change (§0.1). Worth one pass to confirm nothing pulls in 3D chrome
indirectly.

---

## 6. The five lost controls — one list

`src/components/text/TextPlayerList.tsx`. This is the plan's centre of gravity
and the thing `tjuvpakk` is actually being reused for.

Per row, from `LobbyState.players` plus `useLobbyGame`:

| Column | Source | Notes |
|---|---|---|
| status glyphs | `hp<=0` ☠️, `spectator` 👁, `readyPlayers` ✅, `idle_rounds>=2` 👻, winner 👑 | **`tjuvpakk`'s glyph vocabulary, ported directly** |
| name + title | `p.name`, `p.title` | bots marked from `p.bot` |
| HP | `p.hp` | **own row only** unless boss — see the warning below |
| **Attack** | `canAct && p.name !== me && p.hp > 0` | `submit_choice {action:'attack', target: p.name}` |
| **Deny** | `isPendingDenyChooser && p ∈ eligibleDenyTargets` | `submit_deny_target {target: p.name}` |
| **Kick** ❌ | `isAdmin && round === 0 && p.name !== me` | `kick_player {target: p.name}` |
| **Relic** | own row, `round === 0` | `RelicSelectionPopover` (already DOM) → `toggle_relic_selection` |

**🔴 Hidden information.** Other players' `coins`/`attackDamage` are on the wire
because the 3D scene shows some of it contextually. Text mode is a fresh
rendering decision and must match what the 3D scene actually reveals, not dump
every field it can reach. §1.6's `"Verden"` block is the anti-pattern. Settle
this against `LobbyScene`/`PlayerAvatars` at implementation time (§10.2) and
default to showing less.

Guard rails to carry over from `LobbyScene`, which learned them the hard way:

- Attack must be blocked while a deny is pending (`pendingDenyActive`) — the 3D
  handlers check this and a naive text port will not.
- `LobbyScene` deliberately keeps buttons *looking* enabled a beat past the real
  death reveal so the animation lands, while guarding the actual emit on the
  immediate `canAct`. Text mode has no animation to protect, so it should show
  the truthful state immediately — but it must keep the emit guard.
- **Lost souls** share one server name (`p.lost_soul`); the 3D scene tracks a
  clicked index purely for local selection UI. Text mode collapses them to one
  row ("Lost Souls ×3") with one Attack emitting the shared name. That is a
  deliberate simplification and behaviourally identical on the wire.

---

## 7. Things that will break quietly if not planned for

### 7.1 Staged resources — `stageCombatDamage` must be `false`
`useStagedResources` peels combat damage off the HP card one attack at a time,
and the *timing* comes from the `resourceFx` bus, which **only `LobbyScene`
emits into**. Set `stageCombat: true` with no 3D scene and the cards freeze at
the pre-combat baseline and are never decremented — a silently wrong HP readout,
the worst possible bug in this app. Text mode passes `stageCombatDamage: false`.

Note the Well path is different: `if (prevRound > 0 && prev && (wonWell || stageCombat))`
runs on a Well win **regardless** of `stageCombat`, and reveals via its own
`setTimeout`s — self-contained, so it will not hang. But those delays are
calibrated to a reward model landing that text mode never draws, so the cards sit
frozen for a beat with nothing on screen explaining why. Either pass a "no
staging" flag through to `useStagedResources` for text mode, or accept the
delay knowingly. Decide with the numbers in front of you.

### 7.2 Sound
Independent of 3D (`lib/sounds.ts`, `lib/music.ts`, `lib/soundSettings.ts`) and
**should keep working** — text mode is about rendering, not audio. But music is
currently started by `WorldMapOverlay`, `LobbyOverlay` and `city/page.tsx`'s
`playMusic(CITY_MUSIC)` effect; the `/city` comment records that the toggle
"was muting silence, and looked broken because it was working perfectly on
nothing" when that call was missing. Every text route needs its `playMusic` call
kept, or the same bug returns.

### 7.3 Effects that vanish
`SwordEffect`, `ShieldEffect`, `KillFireEffect`, `ExplosionEffect`,
`DamageNumberEffect`, `WellSplashEffect`, `WellGlowEffect`, `WellRewardEffect`,
`InstakillBurstEffect`, `DenyRingEffect`, `ResourceGainEffect`,
`SelectionGlow` — all 3D, all gone. Each one currently communicates something
(a hit landed, a block held, a rarity tier). §5.3.4's log is where that
information has to reappear; `glowForReward()` already maps a reward to a rarity
tier and can name it in words instead of colouring a glow.

### 7.4 The in-game guide
`lib/guideSteps.ts` / `lib/guideHighlights.ts` highlight UI elements for
first-time players. Whether the highlight targets exist in text mode needs a
check; a guide pointing at nothing is worse than no guide. Simplest correct
answer for v1: suppress the guide in text mode and note it as follow-up work.

### 7.5 Nudges and claim flows
`BossSignupNudge`, `WheelClaimNudge`, `ArtifactClaimNudge`, `WheelSpinModal`,
`TradeUpModal` are DOM but are rendered *by* `LobbyOverlay`. Text mode must
render them too — they gate real rewards, and silently dropping them costs
players things they earned. Explicit test coverage, not a manual check (§9).

### 7.6 Camera-shaped UI
`spinEnabled`, `cameraMoved`, `onResetCamera`, `resetCameraSignal`,
`instakillActive` are props threaded from `/lobby` through `LobbyOverlay` into
`SceneOverlay` purely to bridge the camera and the overlay. In text mode the
first four are meaningless and their buttons must not render (`resetCameraButton`
is emitted inside `SceneOverlay`'s resource-card block). `instakillActive` is
*not* in that group — it is a real game state (the player holds a Poisoned
Dagger charge) that today happens to be computed by `LobbyScene`. Text mode
needs it from somewhere else: `useGameEvents` already returns `instakill` on
its result, which is the honest source.

### 7.7 `ErrorBoundary`
Already exists and is DOM. In text mode it is the last line of defence and
should carry the "switch back to 3D" affordance mirroring §3.4's third surface.

---

## 8. What this actually buys

State it as hypotheses to verify (§11 step 9), not as claims:

- **No WebGL context.** Runs where 3D cannot: old phones, locked-down machines,
  software rendering, headless CI.
- **No engine download.** `three` + `@react-three/fiber` + `@react-three/drei` +
  `three-stdlib` dominate the JS payload — *if and only if* §4.3's refactor
  lands.
- **No model/texture download.** `public/models/*.glb` (per-skin frogs, boss
  models, reward models) and the world-map Earth textures are the bulk of the
  network cost and are never requested.
- **Testable.** The whole game loop becomes assertable in jsdom without mocking
  `@react-three/fiber` (§9).
- **Accessible.** Not in scope here, but `docs/LEGAL_COMPLIANCE_PLAN.md` §5
  (EAA) and `MOBILE_AND_STEAM_PLAN.md`'s accessibility row both have an
  unstarted obligation that a real DOM rendering of the game is a
  precondition for. Worth noting; not worth claiming as delivered.

---

## 9. Testing

`vitest.config.ts` already runs two projects — `node` for `src/**/*.test.ts`,
`jsdom` (RTL, `vitest.setup.ts`) for `src/**/*.test.tsx`.

- `src/lib/__tests__/renderMode.test.ts` — default, persistence, subscribe,
  malformed stored value, `?text=` precedence, SSR-safety.
- `src/components/text/__tests__/TextPlayerList.test.tsx` — **the important
  one.** Assert each of the five controls emits the right event with the right
  payload; assert Attack is suppressed while a deny is pending; assert kick only
  for admin at `round === 0`; assert lost souls collapse to one row emitting the
  shared name; **assert no other player's hidden fields are rendered** (§6).
- `src/components/text/__tests__/TextLobby.test.tsx` — phase transitions, and
  that the nudge components still render (§7.5).
- A regression test that text mode passes `stageCombatDamage: false` (§7.1).

Note what these tests do *not* need: the `vi.mock('@react-three/fiber', ...)`
`Canvas` stub that `src/app/lobby/__tests__/page.test.tsx` and the other page
suites all carry. Text-mode components have no 3D in their import graph at all,
which is the point.

Existing page tests will need their mode mocked, since they render the 3D
branch. Default `'3d'` keeps them green without edits — but assert that rather
than assume it.

---

## 10. Open questions

**10.1 — Auto-suggest on low-end devices?** `lib/deviceQuality.ts` already
detects a low tier (`mem <= 4 && dpr >= 2`) and currently only lowers 3D
quality. Should it prompt "try text mode"? A one-time dismissible nudge is
attractive; it is also the kind of thing that annoys people on perfectly good
hardware, since the heuristic is deliberately crude. **Recommendation: no for
v1.** Ship the toggle, see who finds it.

**10.2 — Exactly which fields does the text player list show?** §6 flags this.
Needs a read of what `PlayerAvatars`/`LobbyScene` actually reveal in 3D, so text
mode matches rather than exceeds it. **Blocking for step 5** — get it right the
first time; a hidden-information leak is not a thing to patch later.

**10.3 — Does `SceneOverlay` take a `layout` flag cleanly, or does text mode get
its own view component?** §4.2 flags this as an assumption. **Decide at step 4,
on the code.**

**10.4 — Is text mode in the native build?** `MOBILE_AND_STEAM_PLAN.md` §5.3's
`output: "export"`. Nothing here obviously conflicts, but the branch is inside
statically-exported pages and should be built and smoke-tested under
`npm run build:native` before that is asserted.

**10.5 — Does the market's socket room behave with no 3D city around it?**
`/market` is already DOM, so this should be free — but `useMarketConnection`
joins from a page the city normally hands you to, and text mode changes that
path. Worth one deliberate check.

---

## 11. Implementation steps

Ordered so each step is independently reviewable and nothing is built on an
unverified assumption.

1. **`lib/renderMode.ts` + `lib/useRenderMode.ts`** — storage, subscribe,
   `?text=` override, mounted-gating (§3.1–3.3). Tests. No UI yet.
2. **The toggle in `/settings`** — a Display block beside `AudioSettingsPanel`,
   with copy about the reload (§3.4, §4.4). Still no text rendering: at this
   point the setting is inert and provably persists.
3. **`/vault` first** (§5.4). One conditional, smallest possible end-to-end
   proof that the seam works.
4. **`SceneOverlay` layout flag** (§4.2 Tier 2) — resolve §10.3 here, in the
   code. If it fights back, fall back to a dedicated view and say so in this
   document.
5. **`TextPlayerList`** (§6) — resolve §10.2 *before* writing the row. All five
   controls, all guard rails, full test suite. **The critical step.**
6. **`TextLobby`** (§5.3) — phases, combat log, resource cards, chat, nudges,
   `stageCombatDamage: false` (§7.1), `instakill` from `useGameEvents` (§7.6).
7. **Text `/city`** (§5.2) — reusing the entry hooks and `bossfightSignSublabel`.
8. **Text `/` (world map)** (§5.1) — `CITIES` as a list, `WorldMapOverlay` kept.
9. **The bundle refactor + proof** (§4.3) — push `<Canvas>` (and `CITY_CAMERA`/
   `CITY_FOV`) down into the dynamic chunks, carrying the `isolation: 'isolate'`
   comments with them; then *measure* that a text page load requests no `three`
   chunk. Locked decision 7 is not met until this number exists.
10. **The escape hatches** (§3.4) — `SceneTopBar` menu entry and the
    `ErrorBoundary` button.
11. **Sweep** — music calls on every text route (§7.2), guide suppressed (§7.4),
    `npm run build:native` smoke test (§10.4), market check (§10.5), and a pass
    over borrowed copy for the `raid` → `bossfight`/`well` vocabulary (§1.4).

Steps 1–3 are a day's work and de-risk the rest. Step 5 is where the real design
happens. Step 9 is where the claim in the title gets earned.
