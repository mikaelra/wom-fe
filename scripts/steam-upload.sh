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
# Required env (never commit these -- export them in your shell or a
# gitignored .env you `source`):
#   STEAM_APP_ID        the app's ID from Steamworks
#   STEAM_DEPOT_WIN     Windows depot ID
#   STEAM_DEPOT_LINUX   Linux depot ID
#   STEAM_BUILD_USER    Steam build account login (needs "Edit App Metadata"
#                       + "Publish App Changes To Steam")
#
# Optional env:
#   NEXT_PUBLIC_BACKEND_URL   default https://api.worldofmythos.net
#   STEAM_BUILD_DESC          default "wom-fe <git-describe> <utc-timestamp>"
#   STEAMCMD_IMAGE            default docker.io/steamcmd/steamcmd:latest
#   STEAM_VOLUME              podman volume holding the cached login token,
#                             default "wom-steam"
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
: "${STEAM_DEPOT_LINUX:?set STEAM_DEPOT_LINUX}"
: "${STEAM_BUILD_USER:?set STEAM_BUILD_USER (Steam build account login)}"

BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-https://api.worldofmythos.net}"
GIT_DESC="$(git describe --tags --always --dirty 2>/dev/null || echo dev)"
STEAM_BUILD_DESC="${STEAM_BUILD_DESC:-wom-fe $GIT_DESC $(date -u +%Y-%m-%dT%H:%MZ)}"
IMAGE="${STEAMCMD_IMAGE:-docker.io/steamcmd/steamcmd:latest}"
STEAM_VOLUME="${STEAM_VOLUME:-wom-steam}"

SKIP_BUILD=0
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=1

WIN_DIR="$REPO/dist-electron/win-unpacked"
LINUX_DIR="$REPO/dist-electron/linux-unpacked"

if [[ $SKIP_BUILD -eq 0 ]]; then
	echo "==> static export  (NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL)"
	NEXT_PUBLIC_BACKEND_URL="$BACKEND_URL" npm run build:native

	echo "==> electron-builder: unpacked Windows + Linux trees"
	# SteamPipe wants the raw game files, not an installer -- `dir` is the
	# unpacked tree it chunks and deltas. Installer targets in
	# electron-builder.yml are for direct downloads, not this.
	npx electron-builder --linux dir --win dir --publish never
fi

[[ -d "$WIN_DIR"   ]] || { echo "!! $WIN_DIR missing -- run without --skip-build"; exit 1; }
[[ -d "$LINUX_DIR" ]] || { echo "!! $LINUX_DIR missing -- run without --skip-build"; exit 1; }

echo "==> rendering VDFs"
OUT="$REPO/steam/output"
mkdir -p "$OUT/steampipe"

# Paths below are as seen *inside* the container (repo mounted at /data).
export STEAM_APP_ID STEAM_DEPOT_WIN STEAM_DEPOT_LINUX STEAM_BUILD_DESC
export STEAM_CONTENT_ROOT="/data/dist-electron"
export STEAM_BUILD_OUTPUT="/data/steam/output/steampipe"
export STEAM_CONTENT_WIN="/data/dist-electron/win-unpacked"
export STEAM_CONTENT_LINUX="/data/dist-electron/linux-unpacked"

SUBST='$STEAM_APP_ID $STEAM_DEPOT_WIN $STEAM_DEPOT_LINUX $STEAM_BUILD_DESC'
SUBST="$SUBST "'$STEAM_CONTENT_ROOT $STEAM_BUILD_OUTPUT $STEAM_CONTENT_WIN $STEAM_CONTENT_LINUX'
for f in app_build depot_build_win depot_build_linux; do
	envsubst "$SUBST" < "$REPO/steam/$f.vdf" > "$OUT/$f.vdf"
done

echo "==> steamcmd upload as '$STEAM_BUILD_USER' (image: $IMAGE)"
echo "    First run prompts for password + Steam Guard code; the login token is"
echo "    then cached in the '$STEAM_VOLUME' podman volume and reused."
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
