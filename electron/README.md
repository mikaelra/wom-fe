# Electron shell (Steam build)

The Steam version of World of Mythos is the **same static export** the mobile
build uses (`npm run build:native` → `out/`), wrapped in Electron and pointed
at the production backend. No game logic lives here — see
`docs/MOBILE_AND_STEAM_PLAN.md` §10.

```
electron/
  main.js       window + custom app:// scheme serving out/ + lifecycle
  preload.js    contextBridge → window.wom (isSteam flag, getSteamInfo())
  steam.js      steamworks.js wrapper; a no-op when Steam isn't running
  resources/    electron-builder buildResources (icons, entitlements) — TODO
```

Uploading to Steam: see [`../steam/README.md`](../steam/README.md) and
`npm run steam:upload`.

## Running it locally

```bash
# against the local backend
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000 npm run electron:dev

# against production
NEXT_PUBLIC_BACKEND_URL=https://<prod-backend> npm run electron:dev
```

`build:native` runs `next build`, which sets `NODE_ENV=production` and so
**requires** `NEXT_PUBLIC_BACKEND_URL` (`src/config.ts` refuses to guess). The
URL is baked into the bundle at build time — a packaged build can't be
repointed later.

Fast iteration on shell-only changes (no asset/UI change): rebuild once, then
`npm run electron` re-runs against the existing `out/`.

Flags:

| env | effect |
|-----|--------|
| `WOM_STEAM=0` | skip Steam entirely (no client needed) |
| `WOM_STEAM_APPID=<id>` | override the app id (default `480`, Valve's Spacewar test app) |
| `WOM_DEVTOOLS=1` | open DevTools detached |

## Packaging

```bash
NEXT_PUBLIC_BACKEND_URL=https://<prod-backend> npm run dist:steam
```

Outputs to `dist-electron/` (gitignored). Config is `electron-builder.yml`.
Build Windows artifacts on a `windows-latest` runner and macOS on `macos-*`
(§10.1) — cross-building from Linux with Wine is not worth the debugging for a
Steam release.

## Not done yet

- **Real Steam app id.** `480` is a placeholder until Steam Direct is paid and
  Valve assigns one (§10.2). Set it in `steam.js`'s `APP_ID` default;
  `electron-builder.yml`'s `appId` stays `net.worldofmythos.game`.
- **Real Steam app id.** `480` is a placeholder — set `steam.js`'s `APP_ID`
  default (and `WOM_STEAM_APPID` / the `steam:upload` env) to the assigned one.
- **Content-Security-Policy.** No CSP is set on the renderer yet; it needs to
  allow the backend origin + `wss:` and the app's blob/wasm workers (Draco),
  which is easiest to tune against the app actually running.
- **Icons / installer art** under `electron/resources/`.
- **Asset tier.** The export currently bundles everything in `public/` (~530 MB);
  §6.4 wants Steam on the `extreme` tier once the resolver exists.
- **Fullscreen / gamepad / pause** wiring (§11 "Steam-only").
- **Server-status screen** instead of a hang when the backend is down (§10.4).
- **SteamPipe upload from CI** (§10.2) — `steam:upload` runs locally for now.

Done: first real run (2026-09-07, renders + plays on Wayland); `app://wom`
CORS live on the backend (wom-be #208); Sentry tagged per shell (#360);
SteamPipe pipeline (`steam/`, `npm run steam:upload`).
