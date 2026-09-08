#!/usr/bin/env bash
#
# Build the Electron/Steam shell and upload it to SteamPipe.
#
# Upload-only: the build is NOT set live. Review it and pick a branch at
#   https://partner.steamgames.com/apps/builds/$STEAM_APP_ID
#
# One-time partner-site setup (App ID, depots, launch options) is in
# steam/README.md. docs/MOBILE_AND_STEAM_PLAN.md §10.2 has the wider context.
#
# Required env (never commit these -- keep them in a gitignored file you
# `source`, e.g. .steam.env):
#   STEAM_APP_ID       the app's ID from Steamworks
#   STEAM_DEPOT_WIN    Windows depot ID
#   STEAM_BUILD_USER   Steam account with "Edit App Metadata" + "Publish App
#                      Changes To Steam" for this app (your own works)
#
# Optional env:
#   STEAM_DEPOT_LINUX        Linux depot ID. Set it and the Linux depot is
#                            built and uploaded too; leave it unset for a
#                            Windows-only upload.
#   NEXT_PUBLIC_BACKEND_URL  default https://api.worldofmythos.net
#   STEAM_BUILD_DESC         default "wom-fe <git-describe> <utc-timestamp>"
#   STEAMCMD_IMAGE           default docker.io/steamcmd/steamcmd:latest
#   STEAM_VOLUME             podman volume holding the cached login token,
#                            default "wom-steam"
#
# Usage:
#   scripts/steam-upload.sh                # full build + upload
#   scripts/steam-upload.sh --skip-build   # reuse dist-electron/, just upload
#
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"

: "${STEAM_APP_ID:?set STEAM_APP_ID (from partner.steamgames.com)}"
: "${STEAM_DEPOT_WIN:?set STEAM_DEPOT_WIN}"
: "${STEAM_BUILD_USER:?set STEAM_BUILD_USER (Steam account with publish rights)}"

BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-https://api.worldofmythos.net}"
GIT_DESC="$(git describe --tags --always --dirty 2>/dev/null || echo dev)"
STEAM_BUILD_DESC="${STEAM_BUILD_DESC:-wom-fe $GIT_DESC $(date -u +%Y-%m-%dT%H:%MZ)}"
IMAGE="${STEAMCMD_IMAGE:-docker.io/steamcmd/steamcmd:latest}"
STEAM_VOLUME="${STEAM_VOLUME:-wom-steam}"
LINUX="${STEAM_DEPOT_LINUX:-}"

SKIP_BUILD=0
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=1

WIN_DIR="$REPO/dist-electron/win-unpacked"
LINUX_DIR="$REPO/dist-electron/linux-unpacked"

# Which electron-builder targets, and which "AppID depot -> vdf" lines go in
# app_build.vdf. Linux is opt-in via STEAM_DEPOT_LINUX.
EB_TARGETS=(--win dir)
DEPOT_LINES=$'\t\t"'"$STEAM_DEPOT_WIN"'"'$'\t"depot_build_win.vdf"'
if [[ -n "$LINUX" ]]; then
	EB_TARGETS+=(--linux dir)
	DEPOT_LINES+=$'\n\t\t"'"$LINUX"'"'$'\t"depot_build_linux.vdf"'
	echo "==> depots: Windows ($STEAM_DEPOT_WIN) + Linux ($LINUX)"
else
	echo "==> depots: Windows only ($STEAM_DEPOT_WIN)  [set STEAM_DEPOT_LINUX to add Linux]"
fi

if [[ $SKIP_BUILD -eq 0 ]]; then
	echo "==> static export  (NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL)"
	NEXT_PUBLIC_BACKEND_URL="$BACKEND_URL" npm run build:native

	echo "==> electron-builder ${EB_TARGETS[*]}  (unpacked -- SteamPipe chunks raw files)"
	npx electron-builder "${EB_TARGETS[@]}" --publish never
fi

[[ -d "$WIN_DIR" ]] || { echo "!! $WIN_DIR missing -- run without --skip-build"; exit 1; }
if [[ -n "$LINUX" ]]; then
	[[ -d "$LINUX_DIR" ]] || { echo "!! $LINUX_DIR missing -- run without --skip-build"; exit 1; }
fi

echo "==> rendering VDFs"
OUT="$REPO/steam/output"
mkdir -p "$OUT/steampipe"

# Paths below are as seen *inside* the steamcmd container (repo at /data).
export STEAM_APP_ID STEAM_DEPOT_WIN STEAM_BUILD_DESC
export STEAM_DEPOT_LINUX="$LINUX"
export STEAM_DEPOTS="$DEPOT_LINES"
export STEAM_CONTENT_ROOT="/data/dist-electron"
export STEAM_BUILD_OUTPUT="/data/steam/output/steampipe"
export STEAM_CONTENT_WIN="/data/dist-electron/win-unpacked"
export STEAM_CONTENT_LINUX="/data/dist-electron/linux-unpacked"

envsubst '$STEAM_APP_ID $STEAM_BUILD_DESC $STEAM_CONTENT_ROOT $STEAM_BUILD_OUTPUT $STEAM_DEPOTS' \
	< "$REPO/steam/app_build.vdf" > "$OUT/app_build.vdf"
envsubst '$STEAM_DEPOT_WIN $STEAM_CONTENT_WIN' \
	< "$REPO/steam/depot_build_win.vdf" > "$OUT/depot_build_win.vdf"
if [[ -n "$LINUX" ]]; then
	envsubst '$STEAM_DEPOT_LINUX $STEAM_CONTENT_LINUX' \
		< "$REPO/steam/depot_build_linux.vdf" > "$OUT/depot_build_linux.vdf"
fi

echo "==> steamcmd upload as '$STEAM_BUILD_USER' (image: $IMAGE)"
echo "    First run prompts for password + Steam Guard; the login token is then"
echo "    cached in the '$STEAM_VOLUME' podman volume and reused."
echo
podman run --rm -it \
	-v "$REPO/dist-electron:/data/dist-electron:ro,z" \
	-v "$OUT:/data/steam/output:z" \
	-v "$STEAM_VOLUME:/root" \
	"$IMAGE" \
	+login "$STEAM_BUILD_USER" \
	+run_app_build /data/steam/output/app_build.vdf \
	+quit

echo
echo "==> upload finished. Review the build and set it live on a branch:"
echo "    https://partner.steamgames.com/apps/builds/$STEAM_APP_ID"
