# Text-Only Frontend Plan — World of Mythos Without the 3D

Status: **plan only — nothing built** · Scope: `wom-fe` only (**no backend change, no
protocol change, no `PROTOCOL_VERSION` bump**) · Written: 2026-09-02 · Last
updated: 2026-09-02

Depends on / amends: `docs/CITY_SCENE_PLAN.md` (the three-scene shape this has to
mirror in text), `docs/CODEBASE_HARDENING_PLAN.md` (the `lib/` split this plan is
entirely parasitic on — see §0.4), `docs/MOBILE_AND_STEAM_PLAN.md` §5.3 (route
shapes and `output: "export"`, which constrain §4.3),
`docs/MONETIZATION_PLAN.md` §3.4/§3.5/§8.3 (the skin and wheel economy §7 has to
keep intact).

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

> **The bar.** This is not a fallback and not a degraded mode. **Every 3D scene
> is replicated as a 2D text scene, and every function reachable in 3D is
> reachable in text.** §5 is a scene-by-scene functional inventory built for
> exactly that audit, and §2's locked decision 4 is the rule it enforces.

---

## 0. What exists today — read this first

Six facts shape this plan. Two are much better news than expected, two are the
real work, and one is a correction to the obvious first impression.

### 0.1 — Only four shipped routes mount a scene `<Canvas>`.

The app is less 3D than it looks. Exhaustively, the routes that mount a *scene*:

| Route | Scene component | File |
|---|---|---|
| `/` | `WorldMap` | `src/app/page.tsx` |
| `/city` | `CityScene` | `src/app/city/page.tsx` |
| `/lobby` | `LobbyScene` | `src/app/lobby/page.tsx` |
| `/vault` | `VaultScene` | `src/app/vault/page.tsx` |

(`/modelling` is a fifth, but `next.config.ts`'s `pageExtensions` trick keeps it
out of every build — it is not a route that ships, and this plan ignores it.)

Every other route is plain DOM as far as *scenes* go: `/market`, `/shop`,
`/inventory`, `/stats`, `/settings`, `/rules`, `/rules/[page]`, `/login`,
`/signup`, `/terms`, `/privacy`, `/refunds`, `/forgot_username`,
`/verify_email`, `/email_verified`, and the `/lobby/[lobbyId]` redirect.

**But see §0.6** — "no scene" is not the same as "no WebGL", and the difference
matters a great deal to this plan.

`src/components/wheel/WheelCanvas.tsx` is a `<canvas>`, but a 2D one
(`getContext('2d')`) — not 3D, and it stays exactly as it is in text mode. It is
also, per §7.4, the codebase's best existing proof that a skin can be rendered
convincingly without an engine.

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
status glyphs and an inline ❌ kick. Rebuilding it — one list, every affordance
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
  `lib/useBossfightRoster.ts`, `lib/useCityPresence.ts`,
  `lib/useEnterBossfight.ts`, `lib/useEnterRanked.ts`, `lib/useRankedQueue.ts`,
  `lib/useAuthFlow.ts`, `lib/useMarketConnection.ts`, `lib/market.ts`,
  `lib/bossfightSign.ts`, `lib/sounds.ts`, `lib/music.ts`,
  `lib/soundSettings.ts`, `lib/cities.ts`, `lib/lobbyErrors.ts`,
  `lib/tradeUps.ts`, `lib/cosmetics.ts`, **`lib/frogSkins.ts`** (§7).

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

### 0.6 — 🔴 A fifth 3D surface: the wardrobe viewers. This is where the frogs actually are.

§0.1's table is about *scenes*. It is not the full WebGL inventory, and the
difference is the single most load-bearing correction in this document.

`src/components/SpinningModelViewer.tsx` mounts **its own `<Canvas>`** and
`useGLTF`s a model. It is used on pages that otherwise look like plain DOM:

| Surface | File | What it renders in 3D |
|---|---|---|
| Inventory hero | `app/inventory/page.tsx:295` | your equipped skin's `.glb` |
| Inventory relic card | `app/inventory/page.tsx:236` | `RelicCoin` → coin `.glb` |
| Shop product | `app/shop/page.tsx:311` | the product skin's `.glb` |
| Wheel reveal | `WheelSpinModal.tsx:259` | the won skin's `.glb` |
| Trade-up preview/result | `TradeUpModal.tsx:150, 205, 220` | input + output skins |
| Relic picker | `RelicSelectionPopover.tsx:178` | `RelicCoin` → coin `.glb` |

The existing test suites already know this — `app/inventory/__tests__/page.test.tsx`
and `app/shop/__tests__/page.test.tsx` both carry a
`vi.mock('@/components/SpinningModelViewer', …)` with the comment *"Real
SpinningModelViewer renders a react-three-fiber `<Canvas>`, which needs a WebGL
context jsdom can't provide"*.

Two consequences:

1. **`RelicSelectionPopover` is not a free "reuse as-is" component.** §4.2's
   Tier 1 list must exclude it, and every component that reaches `RelicCoin`,
   until §7.5 gives it a text-mode viewer.
2. **"3D rendering of frogs shouldn't happen anywhere" lands squarely here.**
   The lobby is not where most frog models are drawn — the wardrobe is.

§7 is the section that deals with it.

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
| `bot`, `bot_type` | ❌ | ✅ | picks the bot's model — §7.3's glyph map |
| `lost_soul` | ❌ | ✅ | |
| `skin`, `cosmetic` | ❌ | ✅ (optional) | **the whole basis of §7** |
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
this block. §6.1 sets out what text mode shows instead, and why.

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

None of these existed. All are already DOM-first (modulo §0.6's viewers) and so
are **already most of the way to text mode** — they need the wardrobe treatment
of §7.5 and a check that no 3D chrome wraps them:

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
  today; §5.2 reuses the same data as text.

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
4. **Full parity: every 3D scene is replicated in 2D text, and every function
   reachable in 3D is reachable in text.** Not a subset, not a fallback. §5 is
   the scene-by-scene inventory that makes this auditable rather than
   aspirational, and no step is done until its scene's inventory is fully
   accounted for — each row either implemented, or explicitly recorded as
   ambience with no function attached.
5. **No 3D rendering of frogs anywhere in text mode.** No `<Canvas>`, no
   `useGLTF`, no runtime WebGL — in the lobby, the city, the inventory, the
   shop, the wheel reveal or the trade-up modal (§0.6). A **pre-rendered PNG of
   a model is not 3D rendering**; it is committed art, and it is how skins
   survive (§7.2).
6. **Skins still read as skins, and the inventory thumbnail is how.** A
   player's skin must remain visible to them and to other players in text mode
   — the economy (wheel, trade-up, market, shop) sells these, and a mode that
   rendered every player identically would quietly devalue everything anyone
   has bought or won. Settled (§7.3): **the PNG already shown on the inventory
   skin grid is the skin's representation in text mode**, everywhere a player
   appears. Rainbow and bling are their thumbnails too — no gradient or
   sparkle special-casing. **Bots, the boss, ghosts and lost souls get a glyph
   vocabulary** rather than art. **The artifact cosmetic is not shown in game
   yet** — `Player.cosmetic` goes unrendered in the text lobby and city, and
   no cosmetic thumbnail is needed.
7. **The setting is device-local**, in `localStorage`, following
   `lib/soundSettings.ts` exactly. Which renderer suits you depends on the
   machine you are on, not on who you are logged in as — the same reasoning
   already written down for audio.
8. **Default stays 3D.** Text mode is opt-in.
9. **The toggle lives in `/settings`.** That is its canonical, discoverable
   home, alongside `AudioSettingsPanel` (§3.4).
10. **No auto-suggestion. No nudge, no prompt, no "we noticed your device is
    slow" banner** — not from `deviceQuality.isLowQuality()`, not from a
    dropped-frame heuristic, not from anything. The setting is discovered in
    Settings, and the only other places it appears are *recovery* affordances,
    never *suggestions* (§3.4).
11. **Text mode must actually avoid downloading Three.js.** A "text mode" that
    still ships a 3.5 MB engine to a machine that cannot run it has missed the
    point. This is not free today — see §4.3.
13. **The wheel is redesigned for text, not ported and not degraded.** The
    spin is the moment the skin economy is actually sold, and the canvas
    wheel's motion is hard-won and product-tuned. Text mode gets its own
    design that does the same three jobs — show the odds, build anticipation,
    reveal the result — without a wheel. §7.6. Note this is a *design*
    decision, not a technical one: `WheelCanvas` is a 2D canvas and would run
    fine in text mode (§7.6).
12. **The three-scene shape survives** (`docs/CITY_SCENE_PLAN.md` §1): world map →
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

This is not a suggestion mechanism and does not violate locked decision 10 — it
writes nothing and is never surfaced to a player who did not ask for it.

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

**One toggle, in Settings** (locked decision 9). A new **Display** block in
`src/app/settings/page.tsx`, beside the existing `AudioSettingsPanel`, with a
sentence of copy saying what it does: turns off 3D rendering; the game plays
exactly the same; helps on low-end machines and slow connections; takes effect
on reload (§4.4).

Two other places may *change* the setting, and neither is a suggestion:

- **The user menu in `SceneTopBar`** — an escape hatch. Somebody whose GPU is
  choking needs to be able to leave 3D from the screen that is choking, not
  navigate three pages through it. This is the same top bar the world map and
  city share (`CITY_SCENE_PLAN.md` locked decision 4), so one edit covers both.
- **The `ErrorBoundary` fallback** — if a WebGL scene has just crashed, "switch
  to text mode" is the single most useful button that can be on that screen.
  `src/components/ErrorBoundary.tsx` already exists and is already DOM.

Both are reached only after the player has hit a problem and gone looking. Per
locked decision 10, **nothing proposes text mode to anyone unprompted** — in
particular `lib/deviceQuality.ts`'s `isLowQuality()` keeps doing only what it
does today (lowering 3D quality) and is never wired to a banner or a modal.

---

## 4. Architecture

### 4.1 The seam

```
src/lib/renderMode.ts        # storage + subscribe (§3.1)
src/lib/useRenderMode.ts     # hook: mounted-gated, honours ?text= (§3.2–3.3)
src/components/text/         # the text render layer (new)
```

Each 3D route becomes a two-line branch at the top of its component:

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

For the §0.6 wardrobe viewers the seam is different and smaller: those are one
component deep inside otherwise-shared pages, so the branch goes **inside the
viewer** (§7.5), not at the page.

### 4.2 What the text layer is made of

Three tiers, cheapest first:

**Tier 1 — reuse as-is.** Already DOM, no WebGL anywhere in their import graph:
`ResourceCard`, `Toast`, `RulesModal`, `StartGameButton`,
`RelicCooldownOverlay`, `BossSignupNudge`, `WheelClaimNudge`,
`ArtifactClaimNudge`, `ArtifactLedger`, `AuthGatePopup`, `MarketBoard`,
`MarketItemChip`, `MarketChatPanel`, `RankBadge`, `WheelCanvas`,
`SpecialWheelEmblem`, `MusicToggleButton`, `SfxToggleButton`, `ErrorBoundary`.

**⚠ Not Tier 1**, contrary to first appearances (§0.6): `RelicSelectionPopover`
(→ `RelicCoin` → `<Canvas>`), `WheelSpinModal` and `TradeUpModal` (→
`SpinningModelViewer`). These are Tier 3 until §7.5 lands.

**Tier 2 — reuse behind a config flag.** `SceneOverlay` with
`hidePlayerActionButtons: false`, `suppressEnemyPanel: false`,
`stageCombatDamage: false` (§8.1), plus a new `layout: 'scene' | 'document'`
config field. `'document'` is the fix for §0.2's caveat: it swaps the
percentage-positioned absolute wrappers for ordinary flow layout and the
`ActionImageButton` PNGs for text buttons, without touching any of the 900 lines
of state logic above them. This is deliberately a *third* flag rather than
overloading `hidePlayerActionButtons`, whose existing meaning ("the 3D scene
owns these") is a different question from "how are they laid out".

**[assumption, flagged]** That `layout` cleaves cleanly. `SceneOverlay` is 976
lines and the positioning is scattered through the JSX rather than centralised.
If it fights back, the fallback is a `TextGameView` that consumes the same hooks
directly and leaves `SceneOverlay` untouched — more duplication, less risk.
Decide at step 4 of §12, on the code, not now.

**Tier 3 — build new.** The lost controls (§6), the text avatar and skin viewer
(§7), the text city and text world map (§5.1–5.2).

### 4.3 Actually shedding the bundle — a real refactor, not a flag

Today `<Canvas>` is a **static** import in all three main route files:

```tsx
// src/app/page.tsx, src/app/city/page.tsx, src/app/lobby/page.tsx
import { Canvas } from '@react-three/fiber';
```

The *scenes* are `dynamic(..., { ssr:false })` and so are split out — but the
static `Canvas` import pulls `@react-three/fiber` (and transitively `three`)
into each route's own chunk. **A text-mode branch below that import saves
nothing.** Locked decision 11 therefore requires a mechanical refactor: push
`<Canvas>` down inside each dynamically-imported scene wrapper so that
`@react-three/fiber` appears only in the lazily-loaded chunk. The same applies
to `SpinningModelViewer`, which is statically imported by `/inventory`, `/shop`,
`WheelSpinModal`, `TradeUpModal` and `RelicCoin` (§7.5).

Care needed, because the `<Canvas>` props are load-bearing and documented:

- `/lobby`: `camera={{ position:[33,26,33], fov: BASE_FOV }}`, `dpr={[1,2]}`,
  `gl={{ powerPreference:'high-performance' }}`.
- `/city`: `camera={{ position: CITY_CAMERA, fov: CITY_FOV }}`, `dpr={[1,2]}`,
  and **`style={{ isolation:'isolate' }}`, which is load-bearing** — `FreshHtml`
  appends 3D-anchored labels with drei z-indices up to 16777271, and without a
  stacking context on the container those escape into the root context and
  strike through the user menu. Same on `/`. This must move with the `Canvas`,
  and the comments explaining it must move with it.
- `BASE_FOV` comes from `sceneConstants.ts` (clean), but `/city` imports
  `CITY_CAMERA`/`CITY_FOV` **from `CityScene.tsx` itself** — a second static
  edge into the engine that must move too.

**Verify, don't assume.** Step 10 of §12 is an actual bundle check
(`next build` output, or `@next/bundle-analyzer`) proving no `three` chunk is
requested on a text-mode page load, on a game page *and* on `/inventory`.
Without that check this decision is a wish.

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

## 5. Scene-by-scene parity

Locked decision 4 is the bar: **every 3D scene replicated, every function
carried over.** These tables are the audit. Each row is either a *function* (must
have a text counterpart) or *ambience* (may be dropped, but the drop is a
recorded decision, not an oversight).

### 5.1 `/` — the world map

| 3D element | Kind | Text counterpart |
|---|---|---|
| `Globe` + Earth textures | ambience | dropped (a place list needs no globe) |
| `CityMarker` sword pins, hover, labels | **function** — navigation | a row per city from `CITIES`, name + `actionLabel`, activates `handleCityClick` |
| Marker colour / `swordColor` red-vs-blue | **function** — which city is the bossfight | text label on the row |
| `WorldMapOverlay` (top bar, create/join lobby, code input) | **function** | **reused verbatim** — already DOM |
| `Starfield`, `PlanetSprites`, `Sun/Moon/PlanetBody`, `AuraLayers`, `BodyAspect` | ambience | dropped |
| `SkyLabels` gaze naming | **function** — identifies bodies | see §5.2's note; the sky is not part of the text world map |
| `GlobeCrackleEffect` | ambience — a bossfight is live | folded into the city row's caption instead |
| `OrbitControls`, `CameraRig`, ranked zoom | ambience — camera | dropped (no camera) |
| `CityLoadingScreen` curtain | ambience | dropped — text navigation is instant |

`handleCityClick`'s vault/rules/city branching is reused unchanged, and the
marker's data-driven design (`CITY_SCENE_PLAN.md` §4.2 — no
`city.name === 'Athens'` checks) means the list is a `.map()` over the same
source.

Precedent worth stealing: `tjuvpakk`'s `Home()` is exactly this screen — name
field, join-code field, Create Lobby, an "Enter Boss-fight" line, and a stack of
links. The layout is right; the handlers behind it are §1.7's left column.

### 5.2 `/city` — Athens

| 3D element | Kind | Text counterpart |
|---|---|---|
| `Signpost` arms (Bossfight / Ranked) | **function** — the two entries | rows calling `useEnterBossfight` / `useEnterRanked` |
| Arm labels + sublabels | **function** — status | `bossfightSignSublabel(roster, mins, secs)` and `ranked.label`/`.sublabel`, **reused as strings** |
| `BuildingSign` ×3 occupancy | **function** — how busy | `useCityPresence()` counts, rendered as text |
| `BuildingTarget` Temple / Senate / Market clicks | **function** — navigation | the same three rows |
| `TempleTableau` — live bossfight roster as figures | **function** — who is fighting | roster names from `useBossfightRoster()`, with §7's text avatars |
| `Temple`, `Senate`, `Market`, `Terrain`, `Mountain`, `Campfire` | ambience | dropped |
| `CitySky`, `CityMoon`, day/night `nightness` | ambience | dropped (optionally one line: "night over Athens") |
| `SkyLabels` gaze naming (`CITY_SCENE_PLAN.md` §7) | **function** — identifies bodies | **open, §11.1** — gaze has no text analogue; a static list contradicts §7's "no always-on legend". Recommendation: omit for v1 and record it. |
| `CompassMarks` | ambience | dropped |
| `?t=` sky override | ambience — a 3D tuning instrument | dropped; `astrology.ts`/`skyLocal.ts` must not be imported (§0.4) |
| `OrbitControls` | ambience | dropped |
| Back to Earth | **function** | a link |
| `CityOverlay`, both `AuthGatePopup`s, `playMusic(CITY_MUSIC)` | **function** | reused as-is |

Sketch:

```
Athens
  The Temple    Bossfight — WAITING · starts in 12m 04s     [Enter]
                In the temple now: Kari, Ola, Nils
  The Senate    Ranked — 3 in queue                         [Play Ranked]
  The Market    7 in market                                 [Enter]
  ← Back to Earth
```

### 5.3 `/lobby` — the game

The one that matters. Four phases from `useLobbyGame`'s `phase`.

| 3D element | Kind | Text counterpart |
|---|---|---|
| Player avatars (skin `.glb`, cosmetic, bot/boss/ghost models) | **function** — identity | §7's text avatar in the player list |
| Nametags | **function** | the list row |
| Chat bubbles over players | **function** — who said what | chat panel (already in `SceneOverlay`), sender-attributed |
| Anchored ATTACK / DEFEND / WELL buttons | **function** | §6's row Attack; WELL/DEFEND in the action row |
| `DenyModelButton` | **function** | §6's row Deny |
| Kick ❌ beside nametag | **function** | §6's row Kick |
| `RelicSelectionPopover` off a nametag | **function** | §6's own row, text viewer per §7.5 |
| `InfoRevealContent` badge (❤/💰/⚔, fresh + `stale` "last round") | **function** — a Well reward | §6.1 — **must be carried over exactly** |
| `WinnerCrown` / `WellCrown` | **function** — who won | 👑 glyph in the row (tjuvpakk's own idiom) |
| Lost souls (N meshes, one shared name) | **function** — attackable | one collapsed row (§6) |
| Boss (Hades) + boss HP card | **function** | enemy panel, `suppressEnemyPanel: false` |
| `Sword`/`Shield`/`KillFire`/`Explosion`/`DamageNumber`/`WellSplash`/`WellGlow`/`WellReward`/`InstakillBurst`/`DenyRing`/`ResourceGain`/`SelectionGlow` | **function-bearing ambience** — each communicates an outcome | §5.3.4's combat log; §8.3 |
| `CameraFlyIn`, spin toggle, Reset Camera, `usePanOffset` | ambience — camera | dropped, and their buttons must not render (§8.6) |
| Instakill (Poisoned Dagger) cue on the ATK card | **function** | `useGameEvents().instakill` (§8.6) |
| `SeaAndSky`, `BossfightScenery`, `Table` | ambience | dropped |

#### 5.3.1 `loading`
`state === null`. A line of text. No curtain.

#### 5.3.2 `lobby` (pre-game, `round === 0`)
- Lobby code + `InviteSection` (copy link / QR — already DOM, reused).
- **The player list** (§6): kick, relic selection, ready ✅, bot markers.
- `StartGameButton` for the admin (reused; keeps its 5s grace window).
- Add Bot → `add_dummy { bot_type }`.
- Bossfight countdown when `boss_fight`.
- Chat.

#### 5.3.3 `playing`
- Round number, round timer (`useRoundTimer` off `round_end_time`).
- Enemy panel when there is a boss.
- **The player list** (§6): Attack, Deny, info-reveal badges (§6.1).
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
  You won The Well: +2 ❤, +1 ⚔  (blue)
```

Every line is a direct read of an `OutgoingEvent` / `IncomingEvent` /
`WitnessEvent` / `WellRewardGrantEvent` — no regex, no parsing, no new endpoint.
`glowForReward()` already maps a reward to a rarity tier and can name it in
words instead of colouring a glow. Keep `messages` as the fallback for anything
the structured events do not cover, exactly as they are "display-only now".

`tjuvpakk` had a `FloatingMessage` component for this and polled the strings; the
*idea* (a per-round readout of what happened to you) is the reusable part.

#### 5.3.5 `gameover`
`SceneOverlayConfig.renderGameOver` is already a render-prop the config supplies
— text mode passes a text version. `ranked_results` (tier before/after,
promoted) renders as text with the existing `RankBadge`. The claim nudges
(`BossSignupNudge`, `WheelClaimNudge`, `ArtifactClaimNudge`) are already DOM and
must keep working — they gate real rewards and are the most expensive thing to
silently break (§8.5).

### 5.4 `/vault`

The page is already a DOM card (`ArtifactLedger`) with `VaultScene` as pure
backdrop. Text mode: skip `<VaultScene/>`, keep the card. One conditional, and
the whole scene is ambience.

### 5.5 The wardrobe viewers (§0.6)

| Surface | 3D today | Text counterpart |
|---|---|---|
| Inventory equipped hero | `SpinningModelViewer` | §7.3 text avatar, large |
| Inventory skin grid | already 2D (`skinThumbnailUrl` + `skinColor`) | **unchanged — and it is now the model for everything else** |
| Inventory Artifacts card | `SpinningModelViewer` (`cosmeticModelUrl`) | §7.5 — an ownership record, not an in-game avatar |
| Inventory relic card | `RelicCoin` | relic name + icon |
| Shop product | `SpinningModelViewer` | §7.3 text avatar |
| Wheel spin animation | `WheelCanvas` (2D, not WebGL) | **replaced by the text wheel** (§7.6) |
| Wheel result reveal | `SpinningModelViewer` | §7.6 |
| Trade-up inputs/output | `SpinningModelViewer` ×3 | §7.3 text avatars |
| Relic picker | `RelicCoin` | relic name + icon |

### 5.6 Everything else

No change (§0.1). Worth one pass to confirm nothing pulls in 3D chrome
indirectly — that pass is what found §0.6.

---

## 6. The lost controls — one list

`src/components/text/TextPlayerList.tsx`. This is the plan's centre of gravity
and the thing `tjuvpakk` is actually being reused for.

Per row, from `LobbyState.players` plus `useLobbyGame`:

| Column | Source | Notes |
|---|---|---|
| avatar | `p.skin`, `p.cosmetic` | §7.3 — a swatch + thumbnail, never a `<Canvas>` |
| status glyphs | `hp<=0` ☠️, `spectator` 👁, `readyPlayers` ✅, `idle_rounds>=2` 👻, winner/well 👑 | **`tjuvpakk`'s glyph vocabulary, ported directly** |
| name + title | `p.name`, `p.title` | bots marked from `p.bot`/`p.bot_type` |
| own HP/coins/ATK | `myPlayer` | own row always; others only per §6.1 |
| **Attack** | `canAct && p.name !== me && p.hp > 0` | `submit_choice {action:'attack', target: p.name}` |
| **Deny** | `isPendingDenyChooser && p ∈ eligibleDenyTargets` | `submit_deny_target {target: p.name}` |
| **Kick** ❌ | `isAdmin && round === 0 && p.name !== me` | `kick_player {target: p.name}` |
| **Relic** | own row, `round === 0` | `RelicSelectionPopover` → `toggle_relic_selection` (needs §7.5 first — §0.6) |

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

### 6.1 Other players' stats — the info reveal, and nothing else

**This settles what the text list may show, and it is not a judgement call — 3D
already answers it.**

`PlayerAvatars.tsx` has an `InfoRevealBadge`:

```ts
/** A player's stats as revealed by an opponent's "info" Well reward. `stale`
 *  marks the one extra round it's shown greyed-out with a "last round" label
 *  before disappearing. */
export interface InfoRevealBadge { hp: number; coins: number; attackDamage: number; stale: boolean; }
```

rendered as `❤ {hp}  💰 {coins}  ⚔ {attackDamage}`, greyed with a "last round"
caption in its stale round. It is driven by `LobbyScene`'s `infoReveal` state,
which records the round the `reveal_info` Well reward was won in and derives
fresh/stale/gone from `state.round`.

So: **another player's HP, coins and ATK are shown only while an info reveal is
active, with the same fresh → stale → gone lifecycle.** Text mode replicates
that badge exactly and shows nothing otherwise. This is both the parity
requirement (locked decision 4 — it is a purchased game mechanic, not
decoration) and the hidden-information rule (§1.6's anti-pattern), and they
happen to agree.

The `infoReveal` round-tracking currently lives in `LobbyScene`. Text mode needs
the same derivation, so it should be **lifted into a shared hook**
(`lib/useInfoReveal.ts`) consumed by both renderers, rather than reimplemented —
two copies of a fresh/stale/gone rule will drift, and a drift here leaks
information.

---

## 7. Skins, cosmetics and avatars without 3D

Locked decisions 5 and 6 pull against each other: no runtime 3D frogs anywhere,
but a player's skin must still read as theirs. **This is the wrinkle that is not
ironed out.** What follows is what already exists, what is genuinely missing,
and a proposal — the gaps in §7.4 are the part still to settle.

### 7.1 Most of a 2D skin vocabulary already exists and already ships

`src/lib/frogSkins.ts` is not a 3D module. It exports, alongside `skinUrl()`:

```ts
skinThumbnailUrl(skin) // → /skins/thumbnails/<skin>.png
skinColor(skin)        // → a hex swatch, per skin
skinLabel(skin)        // → 'OG Green', 'Cursed Orange', 'Ponder Purple', …
COMMON_SKINS, RARE_SKINS  // rarity, ordered least→most rare
```

**All 13 thumbnails exist and are committed today** — `public/skins/thumbnails/`
holds a PNG for each of the 12 frog skins plus `cherub_v1`. They are
head-and-shoulders renders of the real `.glb` models, produced by
`scripts/renderSkinThumbnails.mjs`, which renders *through the app's own R3F
setup* precisely so "the thumbnail matches how the model actually looks
elsewhere in the app".

And the 2D presentation is already in production in six places:
`SceneTopBar` (the user-menu avatar: swatch + thumbnail), the inventory **skin
grid**, `MarketItemChip`, `WheelSpinModal`'s cycling tiles, `WheelCanvas`'s
slice fills, and `SpecialWheelEmblem`.

**[correction]** `frogSkins.ts`'s comment above `SKIN_COLORS` still reads *"No
pre-rendered 2D thumbnails exist for these models yet (only .glb) — a flat color
swatch stands in"*. That is stale; the thumbnails landed afterwards. Fix the
comment as part of this work so the next reader does not conclude, as a first
pass of this plan nearly did, that text mode has no artwork to work with.

### 7.2 The rule that makes this tractable

**A pre-rendered PNG of a model is not 3D rendering.** No WebGL context, no
`three` in the bundle, no GPU, no `.glb` download — a committed image, no
different in kind from `/images/buttons/well-ld.png`. It is *3D-derived art*,
and the pipeline that produces it is offline, documented and re-runnable.

That is the whole reconciliation of locked decisions 5 and 6: **skins transfer
as art, not as geometry.** The frog you own is still visibly your frog; it has
simply been photographed once, at build time, instead of being rebuilt on every
viewer's GPU.

### 7.3 `TextAvatar` — the inventory thumbnail, everywhere

**Settled.** The PNG already shown on the inventory skin grid *is* the skin's
representation in text mode — not a stand-in for one, not a placeholder until
something better exists. `src/components/text/TextAvatar.tsx` is the single
skin-rendering primitive, used by the player list (§6), the city's temple roster
(§5.2), the inventory hero, the shop, trade-up and the wheel (§7.6).

```
[ <img src={skinThumbnailUrl(skin)}> ]   ← the skin, exactly as the inventory shows it
   Kari · Zonked Red
```

- Sizes: `sm` (list row), `md` (roster), `lg` (inventory/shop/wheel hero).
- `skinLabel()` names it.
- **`skinColor()` survives in exactly one role**: the background tint behind the
  image, so a missing, still-loading or unrecognised skin degrades to a coloured
  chip rather than a broken image. `SceneTopBar` and `MarketItemChip` already
  layer precisely this way — swatch behind, thumbnail over — so this is the
  established idiom, not a new one.

**Rainbow and bling need no special case.** They are their thumbnails, like
every other skin. The `skinSwatchStyle` gradient/sparkle helper an earlier draft
proposed is **dropped**: the reason it existed was that a flat hex cannot look
like a rainbow, and a photograph of the model does not have that problem.
`WheelCanvas`'s own gradient and sparkle handling stays exactly where it is,
serving the canvas wheel — which text mode does not use anyway (§7.6).

**Bots, the boss, ghosts and lost souls get glyphs, not thumbnails:**

| Wire value | Glyph |
|---|---|
| `bot_type: 'TURTLE'` | 🐢 |
| `bot_type: 'SHEEP'` | 🐑 |
| `bot_type: 'OWL'` | 🦉 |
| `bot_type: 'WOLF'` | 🐺 |
| `boss: true` (Hades) | 💀 |
| `lost_soul: true`, ghosts | 👻 |

Cheap, needs no new assets, and degrades for an unrecognised `bot_type` the way
`BOT_MODEL_URLS` already falls back to turtle. This is the one place text mode
deliberately does not mirror 3D's art, and it is a decision rather than a gap.

**The artifact cosmetic is not shown in game yet.** `Player.cosmetic` is on the
wire and 3D renders it beside the avatar; text mode does not render it in the
lobby or the city roster. No `cosmeticThumbnailUrl` is needed and
`scripts/renderSkinThumbnails.mjs` needs no extension. `/inventory`'s own
Artifacts section is a different thing — an ownership record, not an avatar —
and is handled as a viewer in §7.5.

**[correction, carried from §7.1]** Fix `frogSkins.ts`'s stale comment claiming
no pre-rendered thumbnails exist. It is now not merely inaccurate but actively
misleading: those thumbnails are the entire basis of this section.

### 7.4 What is still open

Only rarity presentation. The thumbnails carry a great deal — a gold frog looks
like a gold frog — but a list row has none of the 3D shimmer, and `RARE_SKINS`
is an ordered list whose ordering currently reaches the player only through how
the model looks. Border weight, a `✦` count, or a tier word beside
`skinLabel()` are the candidates. Worth a design pass rather than a guess,
because this is what protects the perceived value of everything the wheel and
the shop sell (`MONETIZATION_PLAN.md` §3.4/§8.3). Tracked at §11.2.

Everything else in this section is settled: representation (§7.3), non-frog
avatars (§7.3), cosmetics (§7.3), the wheel (§7.6).

### 7.5 The wardrobe viewers

`SpinningModelViewer` gets a text-mode branch at the *component* level, not the
page level (§4.1), so `/inventory`, `/shop`, `WheelSpinModal` and `TradeUpModal`
need no branching of their own:

```tsx
// SpinningModelViewer.tsx
if (useRenderMode() === 'text') return <TextAvatar … size="lg" />;
```

- **The static import still costs the bundle.** Per §4.3 the branch must sit
  behind a dynamic boundary, or `/inventory` and `/shop` keep shipping `three`
  to text-mode users. The cleanest shape is a thin `SkinViewer` that branches
  and only then `dynamic()`-imports the spinning 3D one.
- **`RelicCoin`** takes the same treatment with the relic's own name and icon,
  which unblocks `RelicSelectionPopover` and therefore §6's relic column.
- **The inventory Artifacts card** also calls `SpinningModelViewer`, via
  `cosmeticModelUrl()`. This is the one artifact surface text mode still has to
  render something for — it is how an owner opens the discovery ledger. It is
  not an in-game avatar, so §7.3's "not shown in game yet" does not cover it:
  render the card with `cosmeticLabel()` / `cosmeticDescription()` text and keep
  it clickable. No new art needed.

### 7.6 The text wheel — a redesign, not a fallback

**First, an honesty note that shapes the whole section.** `WheelCanvas` is a 2D
canvas (`getContext('2d')`), not WebGL. It would run perfectly well in text
mode, and only the *result viewer* beside it is 3D. So replacing the wheel is a
**product decision** (locked decision 13), not a technical necessity — and that
means the replacement has to be judged as a design, not excused as a fallback.

#### What the physical wheel actually does

Three jobs, and a text version needs all three:

1. **Shows the odds** — slice area *is* probability (`oddsTable(kind)` →
   `buildSlices`).
2. **Builds anticipation** — it is already spinning when the modal opens and
   keeps spinning for as long as you take to press Roll; Roll commits; then it
   slows and lands.
3. **Reveals the result**, then offers Equip.

#### The tuning is hard-won — do not throw the lesson out with the geometry

`useWheelAnimation.ts` records three rounds of product feedback in its constants:

- Cruise speed was scaled down **three times** (`* 0.5 * 0.33 * 0.5`) because it
  read as too fast.
- There is deliberately **no speed jump when Roll commits** — *"tried a faster
  'snap up at Roll' speed, product feedback was that the jump itself was the
  problem."*
- Forced landing revolutions were cut to a floor because the stop was taking
  30–60s; it now lands in ~8–11s. The reasoning matters: *"the idle cruise
  already runs for however long the player takes to press Roll, so the stop
  itself doesn't need extra forced revolutions to sell 'this has been
  spinning'."*

The text wheel keeps all three lessons even though it keeps none of the physics.

#### The design

**Odds as a table, not an area.** `/wheel/tables` already returns
`{ skin, weight, probability }` plus `odds_denominator`, and `oddsTable(kind)`
computes the same client-side. Render it as rows — thumbnail · `skinLabel()` ·
"1 in 6". The canvas encodes this in slice widths; text states it outright,
which for odds is arguably the clearer medium. Same data either way.

**Anticipation as a decelerating cycle.** One large `TextAvatar` cycling the
wheel's own pool, driven by a phase machine mirroring the shape of
`useWheelAnimation`'s (`spin-up → cruise → stopping → settle → result`):

| Phase | Behaviour |
|---|---|
| `cruise` | steady ~120ms cycle from the moment the modal opens, running as long as the player takes to press Roll — same intent as the canvas idle cruise |
| Roll | `spinWheel()` commits. **No change of pace on commit** — the recorded feedback above |
| `stopping` | begins **only once the result is back**; the interval lengthens on an ease until it rests on the result |
| `settle` → `result` | a beat, then the result state |

Target the landing at ~4–6s rather than the canvas's 8–11: a cycling nameplate
has less to look at than a spinning wheel, so the same duration reads as
waiting rather than anticipation. Tune on feedback, not on this document.

**🔴 Deceleration must not begin before the result is known.** The canvas wheel
gets this right via `commitTarget`; a text version that starts easing on Roll
would let the *timing itself* telegraph the outcome. The cycle stays at cruise
pace until `spinWheel()` resolves, however long that takes.

**Result state**: large `TextAvatar` + `skinLabel()` + Equip / Close, the same
affordances the modal has today.

**Accessibility is inherited, not invented.** `MONETIZATION_PLAN.md` §3.5.10
already specifies it for the canvas wheel, and every line carries over:
`prefers-reduced-motion` renders the result immediately with no cycling
(`usePrefersReducedMotion` is already imported by the modal), the result is
announced through an `aria-live="polite"` region, Roll is a real focusable
`<button>`, and `Esc` closes once the result is in.

**The grant is not the reveal.** §3.5.10 again: *"the player already owns the
skin regardless of what renders."* `onSpun` fires when the server responds, not
when the animation ends. Closing the modal mid-cycle must not lose the skin —
keep that ordering exactly as it is.

#### What text mode does not use, and what it still does

Untouched, still serving 3D mode: `WheelCanvas`, `WheelFlapper`,
`useWheelAnimation`, `wheelGeometry`'s slice building, `wheelPhysics` — roughly
1,100 lines that text mode simply never imports.

Still reused: `oddsTable()`, `wheelKindFromString()`, `wheelKindLabel()` (pure
data, no canvas), `SpecialWheelEmblem` (inline SVG, Tier 1), and the modal's
existing `spinWheel`/`equipSkin` calls, `rollingRef` double-fire guard and error
states — none of which are rendering concerns.

**A free win alongside.** The modal already has a canvas-unsupported fallback:
a `skinColor` swatch strobing at a fixed 120ms with no odds, no deceleration and
no result thumbnail. It is a degradation, not a design, and the text wheel
supersedes it in text mode. Since the text wheel is strictly better and needs no
canvas, **point the 3D mode's fallback at it too** — one implementation, and
`prefers-reduced-motion` in 3D mode gets a better ending than a flat colour disc.

## 8. Things that will break quietly if not planned for

### 8.1 Staged resources — `stageCombatDamage` must be `false`
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

### 8.2 Sound
Independent of 3D (`lib/sounds.ts`, `lib/music.ts`, `lib/soundSettings.ts`) and
**should keep working** — text mode is about rendering, not audio. But music is
started by `WorldMapOverlay`, `LobbyOverlay` and `city/page.tsx`'s
`playMusic(CITY_MUSIC)` effect; the `/city` comment records that the toggle
*"was muting silence, and looked broken because it was working perfectly on
nothing"* when that call was missing. Every text route needs its `playMusic` call
kept, or the same bug returns.

### 8.3 Effects that vanish carry information
`SwordEffect`, `ShieldEffect`, `KillFireEffect`, `ExplosionEffect`,
`DamageNumberEffect`, `WellSplashEffect`, `WellGlowEffect`, `WellRewardEffect`,
`InstakillBurstEffect`, `DenyRingEffect`, `ResourceGainEffect`,
`SelectionGlow` — all 3D, all gone. Each currently communicates something (a hit
landed, a block held, a rarity tier, whose deny it was). §5.3.4's log is where
that information has to reappear; per locked decision 4, each one needs an
explicit "carried over as X" or "ambience, dropped" verdict, not silence.

### 8.4 The in-game guide
`lib/guideSteps.ts` / `lib/guideHighlights.ts` highlight UI elements for
first-time players. Whether the highlight targets exist in text mode needs a
check; a guide pointing at nothing is worse than no guide. Simplest correct
answer for v1: suppress the guide in text mode and note it as follow-up work.

### 8.5 Nudges and claim flows
`BossSignupNudge`, `WheelClaimNudge`, `ArtifactClaimNudge`, `WheelSpinModal`,
`TradeUpModal` are rendered *by* `LobbyOverlay`. Text mode must render them too —
they gate real rewards, and silently dropping them costs players things they
earned. Two of them additionally depend on §7.5. Explicit test coverage, not a
manual check (§10).

### 8.6 Camera-shaped UI
`spinEnabled`, `cameraMoved`, `onResetCamera`, `resetCameraSignal` are props
threaded from `/lobby` through `LobbyOverlay` into `SceneOverlay` purely to
bridge the camera and the overlay. In text mode they are meaningless and their
buttons must not render (`resetCameraButton` is emitted inside `SceneOverlay`'s
resource-card block).

`instakillActive` is **not** in that group — it is real game state (the player
holds a Poisoned Dagger charge) that today happens to be computed by
`LobbyScene`. Text mode needs it from elsewhere: `useGameEvents()` already
returns `instakill` on its result, which is the honest source.

### 8.7 `ErrorBoundary`
Already DOM. In text mode it is the last line of defence and should carry the
"switch back to 3D" affordance mirroring §3.4.

---

## 9. What this actually buys

State it as hypotheses to verify (§12 step 10), not as claims:

- **No WebGL context anywhere.** Runs where 3D cannot: old phones, locked-down
  machines, software rendering, headless CI. Note this only becomes true once
  §0.6's viewers are handled — until then `/inventory` still needs a GPU.
- **No engine download.** `three` + `@react-three/fiber` + `@react-three/drei` +
  `three-stdlib` dominate the JS payload — *if and only if* §4.3's refactor
  lands on both the scenes and the viewers.
- **No model download.** `public/models/*.glb` (per-skin frogs, bot and boss
  models, reward models) and the world-map Earth textures are the bulk of the
  network cost and are never requested. The thumbnails that replace them are
  kilobytes.
- **Testable.** The whole game loop becomes assertable in jsdom without mocking
  `@react-three/fiber` (§10).
- **Accessible.** Not in scope here, but `docs/LEGAL_COMPLIANCE_PLAN.md` §5
  (EAA) and `MOBILE_AND_STEAM_PLAN.md`'s accessibility row both carry an
  unstarted obligation that a real DOM rendering of the game is a precondition
  for. Worth noting; not worth claiming as delivered.

---

## 10. Testing

`vitest.config.ts` already runs two projects — `node` for `src/**/*.test.ts`,
`jsdom` (RTL, `vitest.setup.ts`) for `src/**/*.test.tsx`.

- `src/lib/__tests__/renderMode.test.ts` — default, persistence, subscribe,
  malformed stored value, `?text=` precedence, SSR-safety.
- `src/components/text/__tests__/TextPlayerList.test.tsx` — **the important
  one.** Assert each control emits the right event with the right payload;
  assert Attack is suppressed while a deny is pending; assert kick only for
  admin at `round === 0`; assert lost souls collapse to one row emitting the
  shared name; **assert another player's HP/coins/ATK render only under an
  active info reveal, and disappear after the stale round** (§6.1).
- `src/components/text/__tests__/TextAvatar.test.tsx` — thumbnail URL, the
  `skinColor` tint showing through when the image is missing, the bot/boss/
  ghost glyph map including an unrecognised `bot_type`, and that
  `Player.cosmetic` renders nothing in game (§7.3).
- `src/components/text/__tests__/TextWheel.test.tsx` — the odds table matches
  `oddsTable(kind)`; deceleration does not begin before `spinWheel()` resolves
  (§7.6's timing leak); `prefers-reduced-motion` shows the result with no
  cycling; the skin is kept when the modal is closed mid-cycle.
- `src/components/text/__tests__/TextLobby.test.tsx` — phase transitions, and
  that the nudge components still render (§8.5).
- A regression test that text mode passes `stageCombatDamage: false` (§8.1).
- **A guard test that no text-mode component imports `@react-three/*` or
  `three`** — a static import-graph assertion is the only thing that will keep
  locked decisions 5 and 11 true a year from now, and §0.6 is the proof that
  reviewing by eye does not.

Note what these tests do *not* need: the `vi.mock('@react-three/fiber', …)`
`Canvas` stub and the `vi.mock('@/components/SpinningModelViewer', …)` /
`vi.mock('@/components/RelicCoin', …)` stubs that the lobby, inventory, shop and
relic-popover suites all carry today. Text-mode components have no 3D in their
import graph at all, which is the point.

Existing page tests render the 3D branch, so they need the mode mocked. Default
`'3d'` should keep them green without edits — assert that rather than assume it.

---

## 11. Open questions

**11.1 — Does the city's gaze-naming have a text form?** `CITY_SCENE_PLAN.md` §7
is explicit that there is *no always-on legend*: a body is named only while it
drifts near the centre of the view, so that "identification becomes an act of
attention". A static list of what is overhead is the obvious text analogue and
is also exactly what that decision rejects. **Recommendation: omit for v1**,
record it as the one city function with no text counterpart, and revisit with
whoever owns that design.

**11.2 — Rarity presentation.** §7.4. Border weight, glyph count, tier word —
needs a design pass, because it is what protects the perceived value of the skin
economy. The only part of the skin question left open.

**11.3 — Does `SceneOverlay` take a `layout` flag cleanly, or does text mode get
its own view component?** §4.2 flags this as an assumption. **Decide at step 4,
on the code.**

**11.4 — Is text mode in the native build?** `MOBILE_AND_STEAM_PLAN.md` §5.3's
`output: "export"`. Nothing here obviously conflicts, but the branch is inside
statically-exported pages and should be built and smoke-tested under
`npm run build:native` before that is asserted.

**11.5 — Does the market's socket room behave with no 3D city around it?**
`/market` is already DOM, so this should be free — but `useMarketConnection`
joins from a page the city normally hands you to, and text mode changes that
path. Worth one deliberate check.

*Closed since the earlier drafts: "should low-end devices auto-suggest text
mode?" — no, locked decision 10. "How do skins survive without models?" — the
inventory thumbnail, locked decision 6 / §7.3. "How does the wheel reveal
land?" — §7.6 is the design. "What do cosmetics look like in game?" — the
artifact is not shown in game yet.*

---

## 12. Implementation steps

Ordered so each step is independently reviewable and nothing is built on an
unverified assumption.

1. **`lib/renderMode.ts` + `lib/useRenderMode.ts`** — storage, subscribe,
   `?text=` override, mounted-gating (§3.1–3.3). Tests. No UI yet.
2. **The toggle in `/settings`** — a Display block beside `AudioSettingsPanel`,
   with copy about the reload (§3.4, §4.4). Still no text rendering: at this
   point the setting is inert and provably persists.
3. **`/vault` first** (§5.4). One conditional, smallest possible end-to-end
   proof that the seam works.
4. **`SceneOverlay` layout flag** (§4.2 Tier 2) — resolve §11.3 here, in the
   code. If it fights back, fall back to a dedicated view and say so in this
   document.
5. **`TextAvatar`** (§7.3) — inventory thumbnail with the `skinColor` tint
   behind it, plus the bot/boss/ghost glyph map. No cosmetic, no swatch-gradient
   helper. Include the stale-comment fix in `frogSkins.ts` (§7.1). Everything
   downstream renders players, so this comes before they do.
6. **`useInfoReveal` lifted out of `LobbyScene`** (§6.1) — shared by both
   renderers, so the fresh/stale/gone rule has one implementation.
7. **`TextPlayerList`** (§6) — all controls, all guard rails, the info-reveal
   badge, full test suite. **The critical step.**
8. **`SkinViewer` / `SpinningModelViewer` text branch + `RelicCoin`** (§7.5) —
   unblocks `RelicSelectionPopover`, `TradeUpModal`, `/inventory` (including its
   Artifacts card) and `/shop`.
9. **The text wheel** (§7.6) — odds table, decelerating cycle, the
   result-before-deceleration guard, the §3.5.10 accessibility rules, and
   repointing the 3D mode's own canvas-unsupported fallback at it.
10. **`TextLobby`** (§5.3) — phases, combat log, resource cards, chat, nudges,
   `stageCombatDamage: false` (§8.1), `instakill` from `useGameEvents` (§8.6).
   Walk §5.3's table row by row and account for every one.
11. **Text `/city`** (§5.2) and **text `/`** (§5.1) — same row-by-row audit
    against their tables.
12. **The bundle refactor + proof** (§4.3) — push `<Canvas>` (and
    `CITY_CAMERA`/`CITY_FOV`, and `SpinningModelViewer`) down into dynamic
    chunks, carrying the `isolation: 'isolate'` comments with them; then
    *measure* that a text page load requests no `three` chunk, on a game page
    and on `/inventory`. Add the import-graph guard test (§10). Locked
    decisions 5 and 11 are not met until these numbers exist.
13. **The escape hatches** (§3.4) — `SceneTopBar` menu entry and the
    `ErrorBoundary` button. No suggestions anywhere (locked decision 10).
14. **Sweep** — music calls on every text route (§8.2), the §8.3 effect verdicts
    written down, guide suppressed (§8.4), `npm run build:native` smoke test
    (§11.4), market check (§11.5), and a pass over borrowed copy for the
    `raid` → `bossfight`/`well` vocabulary (§1.4).

Steps 1–3 are a day's work and de-risk the rest. Step 7 is where the game's own
design happens and step 9 is where the economy's does. Step 12 is where the
claim in the title gets earned.
