# iOS shell (Capacitor)

The iOS version of World of Mythos is the **same static export** the Steam build
uses (`npm run build:native` → `out/`), wrapped in a Capacitor WKWebView and
pointed at the production backend. No game logic lives here — see
`../docs/MOBILE_AND_STEAM_PLAN.md` §5 and §7, and `../electron/README.md` for the
desktop counterpart.

```
capacitor.config.ts      appId / appName / webDir=out / capacitor://localhost
ios/App/                  the Xcode project (committed)
  App/App/Info.plist      landscape-locked, fullscreen
  App/App.xcodeproj       scheme "App" is shared (needed for CI xcodebuild)
  App/CapApp-SPM/         Capacitor pulled in via Swift Package Manager (no CocoaPods)
fastlane/                 build / sign (match) / upload (TestFlight) lanes
.github/workflows/ios.yml the macOS CI job
```

The web assets under `ios/App/App/public/` are **generated** by `npx cap sync
ios` and gitignored — never edit or commit them.

## Building locally (needs a Mac)

```bash
npm ci
npm run ios:sync                      # build:native + cap sync ios
npx cap open ios                      # opens Xcode
```

`build:native` sets `NODE_ENV=production` and so **requires**
`NEXT_PUBLIC_BACKEND_URL` (`src/config.ts` refuses to guess). The URL is baked
into the bundle at build time.

`bundle exec fastlane build_unsigned` reproduces the CI compile check.

## CI

`.github/workflows/ios.yml` runs on `macos-15`. It has two modes:

| Trigger | With signing configured? | What runs |
|---|---|---|
| Pull request touching `ios/**` etc. | — | `fastlane build_unsigned` (compile check, no secrets) |
| Tag push `v*` / manual dispatch | no (`IOS_TESTFLIGHT_ENABLED` unset) | `fastlane build_unsigned` |
| Tag push `v*` / manual dispatch | yes | `fastlane beta` → sign via `match`, upload to TestFlight |

Version (`CFBundleShortVersionString`) and build number (`CFBundleVersion`) are
injected at archive time from `git describe --tags` / `git rev-list --count
HEAD` — the same source as the web build's `NEXT_PUBLIC_APP_VERSION` /
`NEXT_PUBLIC_BUILD_NUMBER` (`../docs/MOBILE_AND_STEAM_PLAN.md` §4.2). No file is
mutated.

## One-time setup

### On developer.apple.com / App Store Connect

1. **Register the App ID** `net.worldofmythos.game` under Certificates, IDs &
   Profiles → Identifiers. (Permanent — must match `capacitor.config.ts`,
   `../electron-builder.yml`, and `../docs/MOBILE_AND_STEAM_PLAN.md` §14.2.)
2. **Create the app record** in App Store Connect (name "World of Mythos", that
   bundle ID, an SKU). Accept the free Apps agreement under *Agreements, Tax,
   and Banking* — enough for TestFlight; the paid agreement is only needed
   before the app can be sold.
3. **Create an empty private GitHub repo** for `match` to store the encrypted
   signing assets, e.g. `mikaelra/wom-ios-certs`.

### GitHub Actions secrets (repo settings → Secrets and variables → Actions)

| Secret | What it is | Where to get it |
|---|---|---|
| `APPLE_TEAM_ID` | 10-char Team ID | developer.apple.com → Membership details |
| `APP_STORE_CONNECT_API_KEY_ID` | Key ID of an App Store Connect API key | App Store Connect → Users and Access → Integrations → App Store Connect API → **+** (Access: Admin or App Manager) |
| `APP_STORE_CONNECT_API_ISSUER_ID` | Issuer ID (one per team) | same page, above the key list |
| `APP_STORE_CONNECT_API_KEY` | full contents of the downloaded `AuthKey_XXXXXXXX.p8` | downloaded **once** at key creation — Apple will not let you re-download it |
| `MATCH_PASSWORD` | passphrase that encrypts the certs repo | you choose it; keep it in your password manager |
| `MATCH_GIT_URL` | HTTPS URL of the empty private certs repo | e.g. `https://github.com/mikaelra/wom-ios-certs.git` |
| `MATCH_GIT_BASIC_AUTHORIZATION` | base64 of `username:PAT` so CI can clone that repo | `printf '%s' 'mikaelra:<PAT>' \| base64` — PAT with `repo` scope (classic) or fine-grained scoped to just the certs repo |

The API key covers **both** `match` and the TestFlight upload, so no Apple ID,
app-specific password, or 2FA session secret is needed.

### GitHub Actions variable

| Variable | Value | Effect |
|---|---|---|
| `IOS_TESTFLIGHT_ENABLED` | `true` | flips CI from unsigned-compile-check to sign + upload. Leave unset until the 7 secrets above exist. |

`NEXT_PUBLIC_BACKEND_URL` / `NEXT_PUBLIC_SENTRY_DSN` variables already exist
(used by `deploy.yml`).

## First run

1. Add the 7 secrets and set `IOS_TESTFLIGHT_ENABLED=true`.
2. Actions → **iOS build** → *Run workflow* with **bootstrap_certs = true**.
   This generates the distribution certificate and the `match AppStore
   net.worldofmythos.game` provisioning profile and pushes them (encrypted) to
   the certs repo. Run this once.
3. `git tag v0.1.1 && git push origin v0.1.1` → the `beta` lane builds, signs,
   and uploads to TestFlight.
4. App Store Connect → TestFlight → add the build to the internal testers
   group; install via the TestFlight app on the iPhone 14.

Milestone (`../docs/MOBILE_AND_STEAM_PLAN.md` §5.5): a full bossfight played on
the iPhone 14 from a TestFlight build.

## Not done yet

- **App icon / launch screen art.** Capacitor ships placeholders under
  `ios/App/App/Assets.xcassets/`.
- **Safe-area insets** for the notch / Dynamic Island — the HUD needs
  `env(safe-area-inset-*)` (§7.3).
- **Audio unlock on first tap** — `src/lib/sounds.ts` needs an explicit
  unlock-on-first-gesture for iOS's autoplay rules (§7.3).
- **Keep-screen-awake during a match.**
- **`window.Capacitor` runtime detection** in app code (the Electron shell has
  `window.wom.isSteam`; the mobile equivalent is not wired yet).
- **Asset tier.** `out/` currently bundles all of `public/` (~530 MB); §6 wants
  the tier resolver and a smaller mobile bundle. Not a blocker for a TestFlight
  build.
- **`deviceQuality.ts`** classifies every iOS device as `low` (§6.6).
- **Android / Google Play** — blocked on Play registration (§14.3).
