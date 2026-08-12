# Mobile (iOS / Android) & Steam Distribution Plan

Status: **draft, nothing implemented** · Scope: `wom-fe` + `wom-be` · Last updated: 2026-08-12

Goal: ship World of Mythos as an installable app on the Apple App Store and Google Play,
and as a purchasable PC game on Steam, reusing the existing web build rather than
rewriting the game. First milestone is narrower and comes first: **a working test build
running on the developer's own phone.**

Backend-owned work items are specified in `wom-be/docs/MOBILE_AND_STEAM_PLAN.md`; this
document is the whole picture and the build order.

---

## 1. Summary

The game is a Next.js 16 App Router app whose every page is already a client component,
talking to a separate Flask/Socket.IO backend over CORS with a bearer-style token. That
architecture is *unusually* well-suited to being wrapped: there is no server-side
rendering to lose, no API routes to relocate, no session cookie to reissue. The app is
already, in effect, a single-page client that happens to be served by Next.

Both store apps and the Steam build are therefore the **same artifact**: a static export
of `wom-fe` loaded in a native webview (Capacitor on phones, Electron on Steam), pointed
at the existing production backend. One codebase, one protocol, three shells.

The work that stands between here and there is not the wrapping — that part is small.
It is five specific blockers, listed in §2, of which only one is a genuine engineering
problem and three are policy/paperwork that must start early because of lead times.

**Recommended first two weeks** are in §14. The single most useful thing that can happen
on day one — an APK on the Samsung that proves the 3D game is playable on a phone at all
— is §5.1 and needs no refactor whatsoever.

---

## 2. The five blockers

| # | Blocker | Nature | Where |
|---|---|---|---|
| 1 | `/lobby/[lobbyId]` prevents static export | Engineering, ~½ day | §4 |
| 2 | 490 MB of assets in `public/` vs a 200 MB store limit | Engineering, 1–2 weeks | §6 |
| 3 | Stripe Checkout is not permitted for in-app digital goods | Policy + engineering, 1–2 weeks | §8 |
| 4 | No in-app account deletion, no privacy policy, no age gate | Policy + engineering, ~3 days | §9 |
| 5 | iOS builds require macOS; the dev machine is Fedora | Logistics, cost | §7 |

Blockers 3, 4 and 5 have **lead times measured in weeks that are not developer time** —
Apple enrollment, Google's 14-day closed-testing requirement, Steam's 30-day hold. Start
those clocks in week one (§13), independent of whether any code is ready.

---

## 3. What is already true (verified, 2026-08-12)

These were checked against the codebase, not assumed:

- **Every page is `'use client'`.** No API routes (`src/app/**/route.ts`: none), no
  `middleware`, no `next/headers`, no `cookies()`. Nothing server-side to give up.
- **A static export builds successfully** once the one dynamic route is handled. Verified
  by running `next build` with `output: "export"`: it fails on exactly one error —
  `Page "/lobby/[lobbyId]" is missing "generateStaticParams()"` — and with that route
  stubbed, all 22 routes export as static. `/rules/[page]` already has
  `generateStaticParams` and is fine.
- **The compiled app is 2.9 MB.** `out/_next` after a full export. The size problem is
  entirely assets, not code.
- **`public/` is 489 MB**: 318 MB models, 132 MB textures, 31 MB audio. Individual
  offenders: `models/well/well-hd.glb` 62 MB, `textures/stars/MilkyWay-extreme.png`
  60 MB, `textures/stars/MilkyWay-Stars.png` 56 MB, `models/crowns/crown_hd_v1.glb`
  51 MB, four `models/buttons/*-hd.glb` at 12–24 MB each.
- **Auth is already token-in-header, not cookie** (`src/lib/http.ts`) — survives a
  webview origin change untouched. Backend already reads `CORS_ALLOWED_ORIGINS` from env
  for both REST and Socket.IO (`wom-be/app.py:68-83`), so admitting a native origin is a
  config change, not a code change.
- **Draco is already wired** (`public/draco/`), and `src/lib/deviceQuality.ts` already
  tiers `low`/`high` — the scaffolding for §6 partly exists.
- **No numeric protocol version exists.** `wom-be/docs/PROTOCOL.md` is a prose contract
  with golden tests, which is good, but nothing on the wire says which version a client
  speaks. On the web that is survivable because a refresh updates everyone at once. On a
  phone it is not (§3.1 below, and §3 of the backend doc).
- **No account-deletion route** exists anywhere in `wom-be/routes/`. No privacy policy
  page in `src/app/`. No age affirmation in `src/app/signup/page.tsx`. All three are
  store-review blockers, and all three are already flagged in
  `docs/LEGAL_COMPLIANCE_PLAN.md` §2.1/§2.2/§6 as outstanding.

### 3.1 Why versioning becomes load-bearing

Today both repos deploy from `master`/`main` with no tags, and the frontend is served
fresh on every page load. A backend protocol change and a frontend change ship together
and no user is ever running old client code for longer than a refresh.

A phone breaks that assumption permanently. Once a build is on a device:

- The user chooses when to update, and some never do.
- Store review adds 1–3 days between "fix committed" and "fix installable".
- A bad build cannot be rolled back — it can only be superseded by a *newer* build, which
  must itself pass review.

So the backend must serve **old clients it cannot fix**. That is the real reason to start
with versioning, and it is why §3 is Phase 0 rather than housekeeping. `src/lib/http.ts`
already has a `SchemaMismatchError` whose docstring says "the two repos have drifted" —
that error currently indicates a bug. After launch it will indicate a *supported state*
that has to degrade gracefully.

---

## 4. Phase 0 — Versioning and release identity

**Effort: 2–3 days across both repos. Blocks nothing technically, but everything after
this is harder to do retroactively.**

### 4.1 Semantic versioning and tags

Adopt `MAJOR.MINOR.PATCH` on both repos, tagged in git. `wom-fe/package.json` is at
`0.1.0` and has never moved; start both repos at `v0.1.0` and tag from there.

- `PATCH` — no protocol change; safe to ship to one platform alone.
- `MINOR` — additive protocol change (new event, new optional field). Old clients keep
  working.
- `MAJOR` — breaking protocol change. Requires a min-client bump and a forced-update
  window (§4.3).

### 4.2 One build identity, four consumers

A store build needs a monotonically increasing integer that is *not* the semantic
version. Derive both from CI so they can never disagree:

```
APP_VERSION  = git describe --tags --abbrev=0   # 0.4.2 — shown to users
BUILD_NUMBER = git rev-list --count HEAD        # 1873  — monotonic, never reused
```

Feeding, respectively:

| Target | Version field | Build field |
|---|---|---|
| Android | `versionName` | `versionCode` (must strictly increase) |
| iOS | `CFBundleShortVersionString` | `CFBundleVersion` (must strictly increase) |
| Steam | depot build description | SteamPipe build ID (Valve-assigned) |
| Web | `NEXT_PUBLIC_APP_VERSION` | — |

Expose both to the client as `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_BUILD_NUMBER`,
built into the bundle at compile time the way `NEXT_PUBLIC_BACKEND_URL` already is
(`.github/workflows/deploy.yml` build-args). Show them on the settings page — the first
question in any store support ticket is "which build are you on".

### 4.3 Protocol version and forced update

This is the piece that has no equivalent today and is the most important item in Phase 0.

- Add a `PROTOCOL_VERSION` integer to `wom-be/docs/PROTOCOL.md`, incremented on any wire
  change, asserted by the existing `tests/test_wire_format.py` golden tests.
- Client sends it: `X-Protocol-Version` on REST, and in the Socket.IO connect auth
  payload.
- Backend advertises `{protocol_version, min_supported_protocol}` from `/healthz` and
  rejects below-minimum connections with a distinguishable error code.
- Client, on that code, renders a blocking **"Update required"** screen with a deep link
  to the correct store listing for the running platform. On web it just reloads.

Also add a **soft** update nudge (dismissible, "a new version is available") for the
common case where the old client still works. Without it, the only lever is the hard
block, and using a hard block for non-breaking changes annoys players into uninstalling.

### 4.4 Compatibility policy

Write it down, because it is the thing that will be violated by accident:

- Support the current and previous `MINOR` protocol for at least 90 days.
- Never remove or repurpose a Socket.IO event or response field in a `MINOR`.
- Deprecations get a full release of overlap, and the deprecated shape stays golden-tested
  until removal.

### 4.5 Release workflow

Tag push (`v*`) triggers builds. Keep the existing `master`-push web deploy exactly as it
is — the web should stay continuously deployed. Store artifacts are cut from tags only,
so a tag is a durable, reproducible reference to what a given user has installed.

Add a `CHANGELOG.md` to both repos now; store listings require release notes on every
submission and writing them retroactively is miserable.

---

## 5. Phase 1 — A test build on the developer's phone

This is the first milestone. It splits into a throwaway smoke test that answers the
riskiest product question immediately, and the real build.

### 5.1 Day one: the disposable APK (2–4 hours, zero refactor)

Capacitor can point a native webview at a **live URL** instead of bundled files. That
produces an installable APK of the existing production site with no changes to the app at
all:

```bash
npm i -D @capacitor/cli && npm i @capacitor/core @capacitor/android
npx cap init "World of Mythos" net.worldofmythos.game --web-dir=out
# capacitor.config.ts:  server: { url: 'https://worldofmythos.net', cleartext: false }
npx cap add android
cd android && ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

**This is not shippable** — Apple's guideline 4.2 (Minimum Functionality) treats a bare
website wrapper as grounds for rejection, and it defeats the entire point of bundling.
But it is worth doing first because it answers, in an afternoon, the questions that
determine whether the rest of this plan is worth executing:

- Does a React Three Fiber scene of this weight actually render at a playable frame rate
  on the Samsung?
- Does a 490 MB asset set over mobile data produce a tolerable first load, or does the
  webview get OOM-killed?
- Do touch controls work at all on the world map and the lobby table, or does the camera
  interaction (`usePanOffset`, `CameraFlyIn`) need a real input redesign?
- Does audio play, given mobile autoplay restrictions?

Answer those before spending a week on asset pipelines. If the game is unplayable on a
mid-range phone, that is a game-design finding, and it is much cheaper to learn on day
one.

### 5.2 Building on the actual hardware

The dev machine is a Surface Go running Fedora. This is fine, with constraints:

- **Build in the Docker denv, not on the host.** Add JDK 21 + Android `cmdline-tools` +
  the current platform/build-tools to the dev image. Android Studio is unnecessary and
  should not be installed — everything here is `gradlew` from a terminal.
- **Do not attempt an Android emulator.** A Surface Go cannot run one usefully. Test on
  the real Samsung exclusively — which is better testing anyway.
- **`adb` lives on the host**, not in the container, because it needs USB. On Fedora:
  `sudo dnf install android-tools`, add a udev rule for the device vendor ID, and put the
  user in `plugdev`. Alternatively use `adb connect` over Wi-Fi and skip USB entirely,
  which is the better option on a two-port tablet.
- **Cap the Gradle daemon** — `org.gradle.jvmargs=-Xmx1g` in `gradle.properties`. The
  default heap will swap the machine to death. A Capacitor shell has no native code to
  compile, so builds are I/O-bound and tolerable; expect a few minutes cold, seconds warm.
- **Move release builds to CI early.** GitHub Actions `ubuntu-latest` builds the signed
  AAB far faster than the Surface will, and it is the only sane place to keep signing
  keys.

### 5.3 The real build: static export

The one code change that unblocks everything (§3, verified):

1. **Convert `/lobby/[lobbyId]` to a non-dynamic route.** A `'use client'` page cannot
   export `generateStaticParams`, and lobby IDs are runtime values that cannot be
   enumerated at build time, so the path segment has to go. Move to `/lobby?id=<lobbyId>`
   and read it with `useSearchParams` (wrapped in `<Suspense>`) instead of `useParams`.
   Everything downstream of `lobbyId` in that page is unaffected. Update every internal
   link and any `router.push` that targets a lobby, plus the QR-code share path
   (`qrcode.react` is in the dependency list, so a lobby URL is being handed around
   physically — check what it encodes).
2. **Make the output target conditional** in `next.config.ts`, so the web deploy is
   untouched:

   ```ts
   const isNative = process.env.BUILD_TARGET === "native";
   output: isNative ? "export" : "standalone",
   images: isNative ? { unoptimized: true } : undefined,
   async headers() { return isNative ? [] : [ /* existing cache rules */ ]; },
   ```

   The `headers()` block must be skipped under export — Next warns that it silently does
   nothing there. Its long-cache rules are a *server* concern; bundled assets are local
   files and remote ones are served by the origin that already applies those headers.
3. **Sentry**: `@sentry/nextjs` assumes a server side that a static export does not have.
   Either scope it to the browser SDK for native builds or verify the client-only path
   works with `output: export`. `instrumentation.ts` / `sentry.server.config.ts` /
   `sentry.edge.config.ts` are all inert in a native build and should not be shipped.
   Source-map upload should be keyed per platform so a phone crash resolves to the right
   release.
4. **Verify before wrapping**: `BUILD_TARGET=native npx next build && npx serve out`, then
   load it from the phone over the LAN. If the game works there, Capacitor will work.

### 5.4 Native shell wiring

- `webDir: 'out'`, `appId: net.worldofmythos.game` (reverse-DNS, permanent — it cannot be
  changed after first publish on either store, so pick it deliberately).
- **Backend CORS must admit the native origins.** Capacitor serves from
  `https://localhost` on Android and `capacitor://localhost` on iOS. Both must be added
  to `CORS_ALLOWED_ORIGINS`, and both apply to the Socket.IO handshake as well as REST —
  `wom-be/app.py` passes the same list to both, so it is one env var.
- `NEXT_PUBLIC_BACKEND_URL` must be an absolute HTTPS URL in native builds. It already
  throws on an unset value in production, which is the right behaviour here.
- Status bar, splash screen, safe-area insets, orientation lock (this game is almost
  certainly landscape-locked), and keeping the screen awake during a match.
- Hardware back button on Android must be handled explicitly or it will exit the app
  mid-match.

### 5.5 Milestone definition

Phase 1 is done when the developer can play a full bossfight round on the Samsung, from a
locally built debug APK, against the staging backend. Not before.

---

## 6. Phase 2 — The asset budget

**Effort: 1–2 weeks. This is the largest genuine engineering task in the plan.**

490 MB does not fit. The relevant ceilings:

- **Google Play**: the base app bundle's compressed download is capped at ~200 MB.
  Anything beyond that requires Play Asset Delivery packs.
- **Apple**: apps above roughly 200 MB prompt before downloading over cellular, and a
  large install is a measurable conversion loss. Hard cap is far higher but irrelevant.
- **Steam**: no meaningful cap, but download size is visible on the store page and
  affects wishlishlist conversion.

Target: **≤ 150 MB installed, ideally under 100 MB**, with HD assets fetched on demand.

### 6.1 Measure first

Instrument what the game actually loads in a full session at `low` tier versus `high`.
There are almost certainly assets in `public/` that no code path references any more, and
several that are only reachable from one screen. Do not optimise anything until the
loaded set is known.

### 6.2 Compress

`gltf-transform optimize` on every `.glb`, with:

- **Draco or meshopt** geometry compression — the decoder is already shipped in
  `public/draco/`.
- **KTX2 / Basis Universal** textures instead of embedded PNG. This is where the wins
  are; texture data dominates these files and KTX2 typically takes 5–10× off while also
  reducing *GPU* memory, which matters more than download size on a phone.
- Dedupe, prune unused nodes, quantize attributes.

`MilkyWay-extreme.png` (60 MB) and `MilkyWay-Stars.png` (56 MB) are 116 MB of skybox in
two files and should become a compressed cubemap or an equirectangular KTX2 — likely a
single-digit-megabyte result on its own.

### 6.3 Split bundled from downloaded

Introduce a tiering split that the `-hd` suffix convention already half-implies:

- **Bundled**: SD tier only — enough to play a complete match offline-of-CDN.
- **Downloaded on first run**: HD tier, fetched from the existing origin (which already
  serves these paths with `max-age=31536000, immutable`) into the app's cache directory,
  gated on `deviceQuality` and on a Wi-Fi check.

A plain CDN fetch is preferable to Play Asset Delivery or iOS On-Demand Resources for the
first release: one mechanism that works identically on Android, iOS *and* Steam, versus
two platform-specific ones. Revisit only if bundle size still fails after §6.2.

### 6.4 Improve the quality tiering

`deviceQuality.ts` currently guesses from `deviceMemory` and DPR, and notes that Safari
does not report `deviceMemory` at all (defaults to 4). In a native build that heuristic
gets worse, not better. Add: the WebGL `UNMASKED_RENDERER_WEBGL` string, an actual
frame-time probe over the first few seconds, and — most importantly — a **manual quality
setting** in the settings page. Players know their own device better than a heuristic
does, and a manual override is also the cheapest possible fix for a device-specific
performance bug reported through a store review.

### 6.5 iOS webview memory

WKWebView has a harsher memory ceiling than desktop Safari and kills the page silently
rather than throwing. A scene that runs on Android may not survive on an older iPhone.
Budget time for this specifically; it is the most likely source of "works on the Samsung,
mysteriously dies on the iPhone".

---

## 7. Phase 3 — iOS

**The constraint: Xcode runs only on macOS, and the dev machine is Fedora. Nothing
changes that — it is Apple's licensing, not a tooling gap.**

### 7.1 Options

| Option | Cost | Verdict |
|---|---|---|
| GitHub Actions `macos-*` runners | ~$0.08/min on private repos | **Start here.** No hardware, no setup. |
| Codemagic / Bitrise / EAS Build | Free tiers, then subscription | Equivalent; more Capacitor-specific hand-holding. |
| Used Mac mini (M1/M2) | ~$400 one-off | Buy once iteration frequency justifies it. |

Start with cloud CI: the entire iOS project is generated by `npx cap add ios` on the
runner and never needs to exist on the Surface Go. Expect to want a Mac eventually —
debugging a WKWebView-specific crash through a 20-minute CI cycle is grim — but do not buy
one to find out whether the app builds.

### 7.2 Prerequisites, in order

1. **Apple Developer Program**, $99/year. Individual enrolment needs no D-U-N-S; an
   organisation does, and that adds weeks. Enrolment itself can take days. **Start this in
   week one** regardless of code readiness.
2. **Certificates and provisioning via `fastlane match`**, with the encrypted cert repo
   private. Manual signing from a machine you do not own is not workable.
3. **TestFlight** requires the paid membership. There is no Mac-free way to get a build
   onto an iPhone without it: free-provisioning sideloading needs Xcode locally and
   expires after 7 days.

### 7.3 iOS-specific work

- WKWebView memory limits (§6.5).
- Audio requires a user gesture before playback; the existing `src/lib/sounds.ts` needs an
  explicit unlock-on-first-tap.
- Safe-area insets around the notch/Dynamic Island — the HUD components will need
  `env(safe-area-inset-*)`.
- If OAuth is ever added (`MONETIZATION_PLAN.md` §7.5 keeps it spec'd), **Sign in with
  Apple becomes mandatory** alongside any third-party social login. Worth knowing before
  choosing providers.

---

## 8. Phase 4 — Payments: the policy blocker

**This is the one that can invalidate assumptions about the business, not just the build.**

### 8.1 The rule

Apple guideline 3.1.1 and Google Play's Payments policy both require that digital goods
consumed inside the app be sold through the platform's own billing, at their commission
(broadly 30%, 15% under the small-business programmes). The current flow —
`postCheckout` → `window.location.href = checkout_url` → Stripe — is precisely the
redirect both policies prohibit, and is a well-known rejection reason.

There is genuine legal turbulence here: US antitrust rulings against both Apple and
Google, and the EU's DMA, have opened varying degrees of external-payment steering,
depending on storefront and date. **Do not build on those.** They are jurisdiction-scoped,
actively litigated, and subject to change between now and submission. Build for the
default rule and treat any steering allowance as upside.

### 8.2 What it means concretely

- Revenue on mobile is 70% of gross, not ~97% after Stripe. That changes the arithmetic
  in `MONETIZATION_PLAN.md` §6.6 and needs a deliberate decision: absorb it, or price
  mobile higher.
- The **$500 Cherub** (§3.4 of that plan) is inside Apple's tier ceiling but is a
  high-price digital item and will attract scrutiny — and a 30% cut on it is $150.
- Consumables (wheel spins) and non-consumables (skins) are different IAP product types
  with different restore semantics. The `orders` table already distinguishes `kind`, which
  maps cleanly.

### 8.3 Architecture

The good news: `wom-be/services/payments.py` already defines a `PaymentProvider`
Protocol with `StripePaymentProvider` as one implementation, precisely so tests can
inject a fake. That seam is the right one — extend it rather than reworking it.

- Frontend: `@revenuecat/purchases-capacitor` is the recommended path. It abstracts
  StoreKit and Play Billing behind one API, handles receipt validation and restore, and
  is free below a revenue threshold. Raw `@capacitor-community/in-app-purchases` avoids
  the dependency but means implementing Apple's App Store Server API and Google's
  Play Developer API validation by hand, plus their respective server notification
  webhooks.
- Backend: a `POST /shop/verify_purchase` taking `{platform, product_id, receipt}`,
  validating server-side, and landing in **the same atomic fulfilment path** as the
  existing Stripe webhook (`MONETIZATION_PLAN.md` §6.4). One fulfilment code path, four
  entry points. Details in the backend doc.
- Products must be created and priced in App Store Connect and Play Console, mapped to
  the same `PRODUCTS` ids in `routes/shop.py`.

### 8.4 Loot-box compliance at the store layer

Both stores permit paid randomised items **with published odds**, which the shop already
does (`formatOddsPercent`) — that is a real head start. But:

- Odds must be visible **before** purchase, not only after. Verify the current UI meets
  that; the odds are currently behind a toggle (`toggleOddsInfo`), which may not qualify.
- Age ratings will be pushed upward by the IARC questionnaire once randomised paid items
  are declared. Declare them accurately — misdeclaration is a removal risk, not a warning.
- The **Belgium/Netherlands** exclusion that `LEGAL_COMPLIANCE_PLAN.md` §4 already
  contemplates must be enforced as a store-level territory exclusion in App Store Connect
  and Play Console, in addition to the existing in-app region check. In-app enforcement
  alone does not satisfy a regulator looking at store availability.
- `SHOP_ENABLED` already gates the whole storefront server-side, which makes shipping a
  shop-free v1 to the stores entirely viable — and that is a genuinely attractive option
  (§14).

---

## 9. Phase 5 — Store compliance, the non-code half

Every item here is a hard review blocker, and three of them are already known gaps.

| Requirement | Status | Notes |
|---|---|---|
| Privacy policy at a public URL | 🔴 **Missing** | `LEGAL_COMPLIANCE_PLAN.md` §2.1. Both stores require the URL at submission. |
| **In-app** account deletion | 🔴 **Missing** | Apple 5.1.1(v): any app with account creation must offer deletion *in the app*. A documented manual process is GDPR-sufficient but **not** App Store-sufficient. Needs a real endpoint + settings UI. |
| Age gate | 🔴 **Missing** | `LEGAL_COMPLIANCE_PLAN.md` §6. Required for rating accuracy; more so with paid randomised items. |
| Play Data Safety form | Not started | Must match actual behaviour: email, gameplay data, chat, Stripe/Resend/Sentry processors. |
| Apple privacy nutrition labels | Not started | Same data, different form. Must be consistent with the above. |
| Content rating (IARC) | Not started | Questionnaire covers chat (user-generated content → moderation questions, see `LEGAL_COMPLIANCE_PLAN.md` §8) and paid randomised items. |
| Screenshots per device class | Not started | Multiple sizes each store. A landscape 3D game needs real gameplay captures. |
| Support URL + support email | Partial | `SUPPORT_EMAIL` already exists and is surfaced on shop pages. |
| Terms / EULA | Partial | `/terms` and `/refunds` exist; both need review against store requirements. |
| Accessibility | Not started | `LEGAL_COMPLIANCE_PLAN.md` §5 (EAA) already flags this for checkout; stores increasingly surface it too. |

Note the ordering consequence: **account deletion and the privacy policy are needed
before the first store submission, not before launch.** They gate TestFlight/internal-track
review too. They are also small — an endpoint, a confirm dialog, and a page.

### 9.1 Google's closed-testing requirement

Personal (non-organisation) Play Console accounts created after late 2023 must run a
**closed test with a minimum number of opted-in testers for 14 continuous days** before
production access is granted. This is the single most commonly missed timeline item in
Android launches. It cannot be compressed, and the 14 days only start once real testers
are enrolled. If the account is (or can be) an organisation account, this requirement does
not apply — worth checking which type the account is *now*, because it affects the launch
date by at least two weeks.

---

## 10. Phase 6 — Steam

### 10.1 The shell

Same static export, wrapped in **Electron**. Tauri is smaller and would also work, but
Electron bundles a known Chromium version rather than inheriting the host WebView2/WebKit,
and for a WebGL game deterministic renderer behaviour across a decade of Windows installs
is worth the disk space. Electron is also what the mature Steamworks Node bindings
(`steamworks.js`) target.

- Build Windows artifacts on a `windows-latest` runner. `electron-builder` can
  cross-build from Linux with Wine, but for a Steam release it is not worth the debugging.
- A Linux build is cheap to add and makes Steam Deck work natively rather than through
  Proton. Given the dev is already on Fedora, this is close to free.
- Windows code signing (~$200–400/yr) is optional for Steam, since Steam's own client
  distributes the binary; it matters much more for direct downloads.

### 10.2 Steamworks logistics

- **Steam Direct: $100 per app**, recoupable against revenue.
- Partner account, bank details, and **tax interview** — for a Norwegian ENK this
  intersects with `MONETIZATION_PLAN.md` §6.6; Valve becomes merchant of record for the
  game price, which is a materially different VAT position from selling via Stripe.
  Worth an explicit look before assuming the existing tax setup carries over.
- **A mandatory ~30-day wait** between paying the fee / publishing the store page and
  being allowed to release. Another clock to start early.
- Store page assets: capsule art in several sizes, trailer, description. This is real
  design work, not a checkbox.
- Builds upload via SteamPipe (`steamcmd`), which automates cleanly from CI.

### 10.3 The Steam-specific product question

Valve's terms require that purchases made inside a Steam build go through Steam's
microtransaction system rather than an external processor. So the Stripe shop cannot
simply be exposed in the Steam build. Two viable shapes:

1. **Premium**: sell the game for a fixed price on Steam with `SHOP_ENABLED` off for that
   platform. Simplest, and a paid-up-front multiplayer game with no monetisation is a
   clean pitch.
2. **Free-to-play + Steam Inventory Service / MTX**: mirrors the web model but is
   substantially more integration work and pulls the item economy into Steam's inventory
   system.

Recommend (1) for the first Steam release. It also sidesteps the loot-box rating question
on that platform entirely.

### 10.4 Steam realities for an online-only game

The game cannot be played without the backend. Steam reviews punish this hard when a
server hiccups. Budget for: a clear server-status screen rather than a hang, an honest
"online only, requires an account" disclosure on the store page (Valve requires disclosing
required third-party accounts), and a plan for what the game does the day the Hetzner box
is turned off.

---

## 11. Overlap between mobile and Steam

This is where the plan pays for itself. Of the work above:

**Shared across all three platforms** (do once):
- Phase 0 versioning, protocol version, forced update (§4)
- Static export refactor (§5.3)
- Asset budget and quality tiering (§6) — Steam benefits less from size but identically
  from the tiering and the manual quality setting
- Payment provider abstraction on the backend (§8.3) — the same seam serves Stripe,
  StoreKit, Play Billing and Steam MTX
- Account deletion, privacy policy, age gate (§9)
- Input handling: gamepad/fullscreen/pause work for Steam largely rides on the same
  refactor as touch controls for mobile
- Crash reporting per platform release (§5.3)

**Mobile-only**: IAP integration, store listings and ratings, TestFlight/Play tracks,
touch controls, safe areas, WKWebView memory work, macOS build access.

**Steam-only**: Electron shell, Steamworks SDK, store page art, the $100 fee and 30-day
hold, Steam Deck verification.

Rough split: **roughly 70% of the total work is shared.** The correct order is therefore
mobile-first — mobile forces the harder constraints (asset size, IAP, review scrutiny),
and a build that satisfies those satisfies Steam almost incidentally. Doing Steam first
would leave every hard problem still ahead.

---

## 12. Costs

| Item | Cost | Recurring |
|---|---|---|
| Apple Developer Program | $99 | Yearly |
| Google Play Console | $25 | One-time |
| Steam Direct | $100/app | Per app, recoupable |
| GitHub Actions macOS minutes | ~$0.08/min | Per build |
| Used Mac mini (optional) | ~$400 | One-off |
| Windows code signing cert (optional) | $200–400 | Yearly |
| RevenueCat | Free below threshold | Revenue-scaled |

Minimum to have a test app on both phones: **$124** plus CI minutes.

---

## 13. Lead times to start immediately

These run in parallel with all development and are the actual critical path:

| Clock | Duration | Start when |
|---|---|---|
| Apple Developer enrolment | Days to weeks | **Week 1** |
| Play Console account + account-type check | Days | **Week 1** |
| Google closed testing (14 continuous days, tester minimum) | ≥ 2 weeks | As soon as an installable AAB exists |
| Steam Direct 30-day hold | 30 days | Whenever Steam is committed to |
| Store review, per submission | 1–3 days typical | Per submission, forever |
| Legal opinion on loot boxes (`LEGAL_COMPLIANCE_PLAN.md` §4) | Weeks | Before any paid randomised item ships to a store |

---

## 14. Recommended order

### First two weeks

1. **Day 1** — §5.1 disposable APK. Learn whether the game is playable on a phone. This
   answers more than the next two weeks of code will.
2. **Day 1** — Start the Apple enrolment and check the Play Console account type. Pure
   waiting; start it now.
3. **Days 2–4** — Phase 0 (§4): tags, build identity, protocol version, forced-update
   screen, changelog. Backend and frontend together.
4. **Days 5–6** — §5.3 static export: the lobby route change, conditional
   `next.config.ts`, Sentry split. Verify with `serve out` from the phone.
5. **Days 7–9** — §5.4 real Capacitor Android build with bundled `out/`, remote assets.
   Backend CORS for `https://localhost`. Touch controls, orientation, back button.
   **Milestone: a full bossfight played on the Samsung from a local build.**
6. **Days 10–12** — §9 blockers: account-deletion endpoint + settings UI, privacy policy
   page, age gate at signup. Small, and they gate every store submission including test
   tracks.
7. **Days 13–14** — iOS via cloud CI, assuming enrolment cleared. First TestFlight build
   to the dev's iPhone.

### Then

8. Phase 2 asset budget (§6) — the long pole, 1–2 weeks.
9. Play Console internal → closed testing track. **Start the 14-day clock.**
10. Decide the shop question (§14.1) and, if shipping it, Phase 4 IAP (§8).
11. Store listings, ratings, screenshots (§9).
12. Steam: Electron shell, Steam Direct, store page (§10).

### 14.1 One decision worth making early

**Ship v1 to the stores with `SHOP_ENABLED` off.**

It removes Phase 4 (§8) entirely from the critical path — no IAP integration, no
loot-box rating questions, no 30% arithmetic, no store-level territory exclusions — and
Phase 4 is both the largest policy risk and the largest source of rejection. The web build
keeps selling through Stripe at ~97% margin exactly as it does today, unaffected.

That converts the first release into a purely technical problem, gets real installs and
real crash data from real devices, and lets the monetisation integration be designed
against a shipped app rather than a hypothetical one. Adding IAP to a live app is a normal
update; getting a first submission rejected on payment policy costs a review cycle each
time.

The counter-argument is that mobile players who cannot buy anything are unmonetised, and
that the two-week IAP delay is small next to the other lead times. Both are true. But the
asymmetry favours shipping: the cost of deferring is delayed revenue on a platform with no
users yet, and the cost of not deferring is a rejection loop on the most-rejected
guideline in the store.

---

## 15. Status tracker

| Phase | Item | Status |
|---|---|---|
| 0 | SemVer + tags, both repos | Not started |
| 0 | `APP_VERSION` / `BUILD_NUMBER` in CI | Not started |
| 0 | `PROTOCOL_VERSION` + min-client + forced update | Not started |
| 0 | Compatibility policy documented | Not started |
| 1 | Disposable remote-URL APK | Not started |
| 1 | Android SDK in the Docker denv | Not started |
| 1 | `/lobby/[lobbyId]` → `/lobby?id=` | Not started |
| 1 | Conditional `output: export` | Not started |
| 1 | Capacitor Android shell + CORS origins | Not started |
| 1 | **Bossfight played on the Samsung** | Not started |
| 2 | Asset audit | Not started |
| 2 | GLB → Draco/meshopt + KTX2 | Not started |
| 2 | Skybox PNGs → compressed | Not started |
| 2 | Bundled/downloaded tier split | Not started |
| 2 | Quality tiering + manual override | Not started |
| 3 | Apple Developer enrolment | Not started |
| 3 | fastlane match + macOS CI | Not started |
| 3 | First TestFlight build | Not started |
| 4 | IAP products in both consoles | Not started |
| 4 | `verify_purchase` + entitlement path | Not started |
| 4 | Odds visible pre-purchase | Not started |
| 5 | 🔴 Privacy policy page | Not started |
| 5 | 🔴 In-app account deletion | Not started |
| 5 | 🔴 Age gate | Not started |
| 5 | Data Safety / nutrition labels / IARC | Not started |
| 5 | Play closed-testing 14 days | Not started |
| 6 | Electron shell | Not started |
| 6 | Steam Direct + store page | Not started |
| 6 | SteamPipe upload from CI | Not started |
