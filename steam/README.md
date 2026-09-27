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

## In CI (GitHub Actions)

`.github/workflows/steam-upload.yml` runs this same pipeline on every push to
`master` that touches frontend code (and on `workflow_dispatch`). It calls
`steam-upload.sh --ci`, which is identical to a local run except:

- the steamcmd container runs under `docker`, non-interactively (no `-it`);
- the login token is seeded from a secret instead of the `wom-steam` podman
  volume.

Still **upload-only** — CI never sets a build live. Pick a beta branch in the
web UI after reviewing.

### Required repo secrets

| Secret | What it is |
| --- | --- |
| `STEAM_APP_ID` | the app's ID from Steamworks |
| `STEAM_DEPOT_WIN` | Windows depot ID |
| `STEAM_BUILD_USER` | the **dedicated build account's** Steam login (not your personal one — its token lives in CI) |
| `STEAM_CONFIG_VDF` | base64 of a locally-seeded `~/Steam/config/config.vdf` (see below) |
| `STEAM_SSFN_FILENAME` / `STEAM_SSFN_FILE` | *only if* the build account also needs an `ssfn*` sentry file — its basename, and base64 of the file |

Repo **variables** (`vars.*`, already set for `deploy.yml`): `NEXT_PUBLIC_BACKEND_URL`,
`NEXT_PUBLIC_SENTRY_DSN`.

### Seeding CI auth (one-time, local, manual)

CI cannot answer a Steam Guard prompt, so you log the build account in **once**
on your machine and hand CI the resulting token. There is no headless
interactive login in `steamcmd` — this step is done by hand, once.

1. Create a **dedicated Steam account** for builds (Steamworks → *Users &
   Permissions*), grant it *Edit App Metadata* + *Publish App Changes To Steam*
   for the app, and set Steam Guard to **email** (mobile-authenticator accounts
   are harder to seed).
2. Log it in once, in the same container image CI uses, with an empty `/root`:

   ```sh
   mkdir -p /tmp/steam-seed
   podman run --rm -it -v /tmp/steam-seed:/root docker.io/steamcmd/steamcmd:latest \
     +login <build_account> +quit
   # enter the password, then the Steam Guard code from the account's email
   ```

3. Base64 the token file(s) it wrote and paste them into the repo secrets:

   ```sh
   base64 -w0 /tmp/steam-seed/Steam/config/config.vdf     # -> STEAM_CONFIG_VDF
   # only if an ssfn* file was also written next to it:
   ls /tmp/steam-seed/Steam/ssfn*                          # basename -> STEAM_SSFN_FILENAME
   base64 -w0 /tmp/steam-seed/Steam/ssfn*                  # -> STEAM_SSFN_FILE
   ```

4. `rm -rf /tmp/steam-seed`. Re-seed if the token is later invalidated (account
   password change, or Steam expiring it — the CI run fails with a login error).

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
- **CI**: automated on push to `master` — see "In CI (GitHub Actions)" above.
  Windows/Linux depots build on `ubuntu-latest` (`--win dir` needs no Wine).
  Still upload-only; setting a build live stays a manual web-UI step.
