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
#                            default "wom-steam" (ignored under --ci)
#   STEAM_CONTAINER_RUNTIME  "podman" (default) or "docker". --ci forces
#                            "docker" unless this is set explicitly.
#
# --ci mode (GitHub Actions -- see .github/workflows/steam-upload.yml):
#   Same build + VDF rendering, but the steamcmd container runs
#   non-interactively (no -it) with the login token seeded from a secret
#   instead of the podman volume. Extra env, all from repo secrets:
#     STEAM_CONFIG_VDF     base64 of a locally-seeded ~/Steam/config/config.vdf
#                          (required -- one-time seeding steps in steam/README.md)
#     STEAM_SSFN_FILENAME  name of the ssfn* sentry file, if the account needs one
#     STEAM_SSFN_FILE      base64 of that ssfn* file
#
# Usage:
#   scripts/steam-upload.sh                # full build + upload
#   scripts/steam-upload.sh --skip-build   # reuse dist-electron/, just upload
#   scripts/steam-upload.sh --ci           # non-interactive upload for CI
#   (flags combine, in any order)
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
CI_MODE=0
for arg in "$@"; do
	case "$arg" in
		--skip-build) SKIP_BUILD=1 ;;
		--ci)         CI_MODE=1 ;;
		*) echo "!! unknown argument: $arg" >&2; exit 2 ;;
	esac
done

# Local runs use rootless podman with the login token cached in a volume.
# CI has no TTY and no persistent volume, so it uses docker with the token
# seeded from a secret (see below). Either is overridable.
if [[ -n "${STEAM_CONTAINER_RUNTIME:-}" ]]; then
	RUNTIME="$STEAM_CONTAINER_RUNTIME"
elif [[ $CI_MODE -eq 1 ]]; then
	RUNTIME=docker
else
	RUNTIME=podman
fi

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

echo "==> steamcmd upload as '$STEAM_BUILD_USER' ($RUNTIME, image: $IMAGE)"

# The container's HOME is /root; steamcmd keeps its login token under
# /root/Steam/config/. Locally that's a persistent podman volume seeded by
# the interactive first run. In CI there's no such volume, so we materialise
# an equivalent /root tree from base64 secrets and mount it instead.
RUN_TTY=(-it)
HOME_MOUNT=(-v "$STEAM_VOLUME:/root")
if [[ $CI_MODE -eq 1 ]]; then
	: "${STEAM_CONFIG_VDF:?set STEAM_CONFIG_VDF -- base64 of a locally-seeded ~/Steam/config/config.vdf (steam/README.md)}"
	RUN_TTY=()
	STEAM_HOME="$OUT/steam-home"
	rm -rf "$STEAM_HOME"
	mkdir -p "$STEAM_HOME/Steam/config"
	printf '%s' "$STEAM_CONFIG_VDF" | base64 -d > "$STEAM_HOME/Steam/config/config.vdf"
	if [[ -n "${STEAM_SSFN_FILE:-}" && -n "${STEAM_SSFN_FILENAME:-}" ]]; then
		printf '%s' "$STEAM_SSFN_FILE" | base64 -d > "$STEAM_HOME/Steam/$STEAM_SSFN_FILENAME"
	fi
	HOME_MOUNT=(-v "$STEAM_HOME:/root:z")
else
	echo "    First run prompts for password + Steam Guard; the login token is then"
	echo "    cached in the '$STEAM_VOLUME' podman volume and reused."
fi
echo

"$RUNTIME" run --rm "${RUN_TTY[@]}" \
	-v "$REPO/dist-electron:/data/dist-electron:ro,z" \
	-v "$OUT:/data/steam/output:z" \
	"${HOME_MOUNT[@]}" \
	"$IMAGE" \
	+login "$STEAM_BUILD_USER" \
	+run_app_build /data/steam/output/app_build.vdf \
	+quit

# `set -e` already fails the script on a non-zero steamcmd exit. Belt-and-
# braces for the failure paths where steamcmd still exits 0: a SteamPipe log
# with an explicit error marker is a hard fail. A missing success line is
# only a warning -- steamcmd's wording shifts between versions and a false
# failure here would be worse than a missed one.
if grep -rqsiE "ERROR! Failed|Fatal Error|App build failed" "$OUT/steampipe"/*.log 2>/dev/null; then
	echo "!! steamcmd logged a build error -- see $OUT/steampipe/*.log" >&2
	exit 1
fi
if ! grep -rqs "Successfully finished" "$OUT/steampipe"/*.log 2>/dev/null; then
	echo "!! warning: no 'Successfully finished' line in $OUT/steampipe/*.log -- check the logs" >&2
fi

echo
echo "==> upload finished. Review the build and set it live on a branch:"
echo "    https://partner.steamgames.com/apps/builds/$STEAM_APP_ID"
