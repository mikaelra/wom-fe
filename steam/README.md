# SteamPipe upload

Ships the Electron shell to Steam. `../scripts/steam-upload.sh` builds the
unpacked game tree(s) and hands them to `steamcmd`. Windows always; Linux too
when `STEAM_DEPOT_LINUX` is set. Docs:
<https://partner.steamgames.com/doc/sdk/uploading>,
`../docs/MOBILE_AND_STEAM_PLAN.md` §10.

## Layout

```
steam/
  app_build.vdf         AppBuild script -- template, ${VARS} filled by envsubst
  depot_build_win.vdf   Windows depot   -- template
  depot_build_linux.vdf Linux depot     -- template
  output/               rendered VDFs (real IDs) + steamcmd logs  [gitignored]
```

The templates hold no IDs. `steam-upload.sh` renders concrete VDFs into
`output/` at run time from your shell env.

## One-time setup

### On partner.steamgames.com

1. **App** created → note the **App ID**.
2. **Depots** page: a Windows depot (required); a Linux depot when you want it
   → note the **Depot IDs**. Add each to a package on *Associated Packages & DLC*.
3. **Installation → General**: launch options per OS (executable name is
   pinned via `executableName` in `../electron-builder.yml`) —
   - Windows: executable `world-of-mythos.exe`, OS `windows`
   - Linux: executable `world-of-mythos`, OS `linux`
4. **Publish** those changes (depots/launch options aren't live until published).
5. An account with **Edit App Metadata** + **Publish App Changes To Steam** for
   the app. The account you created the Steamworks partner site with already
   has this (it's the owner) and is fine for local uploads. A dedicated account
   is worth setting up before moving this to CI, where its token lives in a
   secret. Setting builds live for a *released* app needs the mobile app / a
   phone on the account — not needed for pre-release beta branches.

### On this machine

`steamcmd`'s Linux binary is 32-bit and this box has no 32-bit runtime and no
root, so the script runs it in a container (`podman`, already installed). Pull
once:

```
podman pull docker.io/steamcmd/steamcmd:latest
```

## Running it

Put the config in `../.steam.env` (gitignored) and `source` it:

```sh
# .steam.env
export STEAM_APP_ID=xxxxxx
export STEAM_DEPOT_WIN=xxxxxx
export STEAM_BUILD_USER=your_steam_login
# export STEAM_DEPOT_LINUX=xxxxxx   # uncomment once the Linux depot exists
```

```sh
source .steam.env
npm run steam:upload
```

- **Windows-only** unless `STEAM_DEPOT_LINUX` is set — then Linux is built and
  uploaded in the same run.
- **First run** prompts for the account password and a **Steam Guard** code
  (email / mobile app). The login token is then cached in the `wom-steam`
  podman volume, so later runs need neither.
- Builds against `https://api.worldofmythos.net` by default — override with
  `NEXT_PUBLIC_BACKEND_URL`.
- `npm run steam:upload -- --skip-build` reuses whatever is in `dist-electron/`.

The build is **uploaded, not set live**. Review it and choose a branch at

    https://partner.steamgames.com/apps/builds/$STEAM_APP_ID

`steamcmd` can't set the `default` branch live anyway — do a beta branch first,
test, then promote `default` from the web UI.

## Notes / not done

- **`app://wom` CORS** is live on the backend (wom-be #208), so REST + Socket.IO
  work from the shell — verified 2026-09-07.
- **No code signing.** Steam distributes the binary, so an unsigned `.exe` is
  fine for a first release (§10.1). Add a cert for direct downloads later.
- **Bundle is ~600 MB/platform** — the export currently ships all of `public/`
  (§6 asset tiering not done). First upload is a full transfer; SteamPipe deltas
  after that.
- **macOS depot** not wired — needs a macOS runner + notarization (§7).
- **`SHOP_ENABLED`** — the plan (§10.3, §14.1) leans toward shipping Steam as a
  paid game with the shop off. That's a separate decision; this pipeline just
  uploads whatever `build:native` produces.
- **CI**: this runs locally for now. Moving it to a `windows`/`linux` runner
  with `SteamAuthToken` (see the CI note in the SteamPipe doc) is §10.2.
