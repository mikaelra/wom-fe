# Apple Watch app — plan (no code yet)

Status: **plan for Mikael's go-ahead** (2026-10-13). Nothing here is built. The
watch app does **not** go into the build headed for App Store review now — iOS
review goes first (release target 25 Dec 2026); the watch ships in a later
version.

## 1. Why a native app

watchOS has no WKWebView, so the Capacitor web build cannot run on the watch.
A watch build is a **native SwiftUI watchOS app** talking to wom-be directly,
over the same Socket.IO/HTTP protocol the web client uses. LD (text mode) is the
template: text and dots only, zero-3D. The watch app is a **native LD client**,
not a port.

## 2. The constraint that shapes everything: networking on watchOS

As far as I know (Apple TN3135, "Low-level networking on watchOS"), from
watchOS 9 an app may only use **WebSockets (`URLSessionWebSocketTask`) and
`Network.framework`** while it has an **active audio session** (streaming
audio, calls). An ordinary game gets neither. **Plain HTTP(S) through
`URLSession` is always allowed.** When the iPhone is nearby, the watch's
traffic is routed through it; otherwise it goes over Wi-Fi or cellular.

So the watch cannot hold a WebSocket to wom-be. Two ways round it:

- **A. Socket.IO over long-polling (recommended).** Engine.IO v4's polling
  transport is plain HTTP: a `GET` that wom-be holds open until there's
  something to send, and `POST`s for what we send. Flask-SocketIO already
  serves it, since the web client falls back to it. **No backend change.**
- **B. A small REST surface in wom-be** (`GET /ld/state` as a long-poll,
  `POST /ld/choice`, …) if A turns out to be unreliable on a real watch. It
  would reuse the same handlers, but it's a second protocol to keep in step.

**Step 0 of the build is a 1–2 day spike** that settles this: a bare watch app
doing an Engine.IO polling handshake against dev, `join_room`, and receiving
`state_update`s for ~10 minutes, screen on and off. TN3135's rules need
checking against the current watchOS before we commit to A.

**The Swift client.** `socket.io-client-swift` is built round WebSockets
(Starscream), and I can't confirm it supports watchOS. Polling-only, a
**minimal Engine.IO v4 polling client of our own** (~200–300 lines over
`URLSession`: handshake, ping/pong, packet encoding, the 2-second long-poll
loop) is safer and has no dependency.

## 3. Scope of v1 (suggested)

**In:**
- Sign-in, handed over from the paired iPhone app (§5).
- Join and queue: the **boss fight**, the **ranked queue** (players or bots),
  and joining a lobby by code. The watch shows the same countdowns as the
  phone ("Match starts in …", "⏳ Boss-fight starts in …").
- **The LD battle loop**, laid out like the compact LD lobby (wom-fe #488):
  - one header line (title, round), and a compact player list (one line per
    player: crown or skull, avatar, name, Attack);
  - Well and Defend;
  - **HP / COINS / ATK** to pick a resource, with the time left and the
    10s/5s blink;
  - the round result as its latest message (a tap shows them all);
  - the deny chooser, and the game-over card with the rank change.
- Haptics on the 10s/5s warnings and at round end, which a watch is good at.

**Out (v1):** market, shop/IAP, merchant, inventory, wheel, the city and
Earth scenes, chat (read-only at most; typing on a watch is poor), relics
selection (maybe v1.1), any 3D.

## 4. What it uses in wom-be

Socket events — the same ones LD uses today:

| Direction | Events |
|---|---|
| watch → server | `join_lobby`, `join_room` (with `account_token`, wom-be #264 resume), `leave_room`, `submit_choice`, `submit_deny_target`, `join_ranked_queue` / `join_ai_ranked_queue`; later `toggle_relic_selection`, `send_message` |
| server → watch | `state_update`, `joined_lobby` (token), `joined`, `error`, `chat_message`, `joined_ranked_queue` / `joined_ai_ranked_queue` / `ai_ranked_match_found` |

HTTP: `POST /resolve_account_session`, `POST /get_bossfight_lobby`,
`POST /ranked/queue/join` and `/leave`, `POST /ranked/active`,
`GET /get_player_messages/<lobby>/<name>?token=` (the round messages, as
`useGameEvents` reads them), `GET /ranked/season`.

The **account-session resume from wom-be #264** is exactly what the watch
needs: it can join a match the phone is already in, and both stay connected.

CORS: native `URLSession` requests send no `Origin`, which python-engineio
accepts. To be confirmed in the spike.

## 5. Signing in: hand-over from the iPhone

**Recommended: WatchConnectivity from the iPhone app.**
- The account session token (`wom_account_session`) lives in the iPhone app's
  WKWebView localStorage. A small **Capacitor plugin** (Swift, in `ios/App`)
  receives it from the web code whenever it's set or cleared
  (`setStoredAccountToken`), and sends it with
  `WCSession.updateApplicationContext`.
- The watch stores it in its own Keychain and uses it for `account_token`.
  Log-out on the phone clears it on the watch.
- This works for **every account type** (email, Apple, Steam-linked).

**Alternative / later:** Sign in with Apple on the watch itself
(`/auth/apple`). It only covers Apple-linked accounts, so it's not enough on
its own.

Guests: no watch play (no account to resume with). The watch says to sign in
on the iPhone.

## 6. Project layout

- A **watch app target inside the existing `ios/App/App.xcodeproj`**: a
  single-target SwiftUI watch app (the modern style, no separate extension),
  bundle id **`net.worldofmythos.game.watchkitapp`**, sources in
  `ios/App/WatchApp/`, deployment target watchOS 10.
- Shared Swift (the Engine.IO client, models, token store) goes in a local
  Swift package `ios/WomKit/` used by the watch target. The iPhone target
  uses only the WatchConnectivity sender plugin.
- Not committed by hand: the App Store Connect app record already exists; a
  watch app embedded in the iOS app shares it (no new SKU).

## 7. CI and signing (`fastlane` + `ios.yml`) — without risking the phone build

The phone app must keep building and shipping **exactly as today**, even if
the watch target is broken:

1. **Not embedded until it's ready to ship.** The watch target stays out of
   the `App` scheme's "Embed Watch Content" phase. The `beta` lane (tags →
   TestFlight) is unchanged.
2. **Its own CI job, non-blocking.** A new `watch` job in `ios.yml` runs
   `xcodebuild -scheme WatchApp -destination 'generic/platform=watchOS'`
   unsigned, with `continue-on-error: true`, on PRs that touch
   `ios/App/WatchApp/**` or `ios/WomKit/**`.
3. **Signing, when it ships:** `match(type: "appstore", app_identifier:
   [BUNDLE_ID, "net.worldofmythos.game.watchkitapp"])` — one more
   provisioning profile in `wom-ios-certs`. Register the App ID with its
   WatchConnectivity/Keychain group first (developer.apple.com).
4. **The ship switch:** embed the watch target in `App`, and the existing
   `beta` lane's `build_app` archives both. One PR, cut at the version the
   watch ships in.

## 8. App Store consequence

Once an iOS version **with** the watch app goes to review, App Store Connect
requires **Apple Watch screenshots** for that version: Ultra at 410×502 or
422×514, plus a watch app icon set. Review will also test the watch app
itself, so it must work against prod for a reviewer, including the
sign-in hand-over. This is why it can't ride along with the 25 Dec review
build.

## 9. Effort (rough, focused days)

| Step | Days |
|---|---|
| 0. Networking spike on a real watch (settles A vs B) | 1–2 |
| Engine.IO polling client + models (WomKit) | 2–3 |
| Sign-in hand-over (Capacitor plugin + WatchConnectivity + Keychain) | 2–3 |
| Join/queue screens (boss fight, ranked, lobby code) | 2 |
| LD battle UI (players, actions, resources, timer, result, deny, game over, haptics) | 4–6 |
| CI job + match profile + project wiring | 1–2 |
| Testing on device, edge cases (screen off, reconnect, kicks) | 3–4 |
| **Total** | **~15–22 days** |

If the spike lands on B (REST), add ~3–4 days in wom-be, with tests and the
coverage ratchet.

## 10. Questions for Mikael

1. Scope: the battle loop plus boss fight and ranked queue for v1? Chat
   read-only or left out?
2. Sign-in: OK to require the iPhone app for the hand-over, with no watch-only
   sign-in in v1?
3. Which watch for testing the spike on: your own, on TestFlight?
4. Which version should carry it (after the 25 Dec release)?

Next step on a go-ahead: the spike (§2), on its own branch and PR (🧶), outside
the phone's build.
