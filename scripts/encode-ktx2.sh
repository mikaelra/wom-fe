#!/usr/bin/env bash
#
# Re-encode the HD textures as KTX2 (UASTC + zstd, with mipmaps). Why:
# src/lib/ktx2Textures.ts. Run after changing any source image below; commit
# the .ktx2 outputs. Sources live in assets-src/ (shipped nowhere), outputs
# in hd/ (bundled into the native builds, served to HD accounts on the web --
# src/lib/hdTextures.ts).
#
# Needs KTX-Software's `toktx` (https://github.com/KhronosGroup/KTX-Software/releases).
# Set TOKTX to its path, or wrap it, e.g. on a host whose libstdc++ is too old:
#   TOKTX="docker run --rm -v $PWD:/w -w /w -v /opt/ktx:/ktx -e LD_LIBRARY_PATH=/ktx/lib python:3.12-slim /ktx/bin/toktx"
#
# --lower_left_maps_to_s0t0 flips the image: compressed textures ignore
# three's flipY, so they must be stored the way GL samples them.
# Colour maps carry the sRGB transfer function; bump/spec are linear, one channel.
set -euo pipefail
cd "$(dirname "$0")/.."

TOKTX="${TOKTX:-toktx}"
T="$TOKTX --t2 --encode uastc --uastc_quality 2 --zcmp 19 --genmipmap --lower_left_maps_to_s0t0"

$T --target_type RGB --assign_oetf srgb hd/stars/MilkyWay-extreme.ktx2 assets-src/textures/stars/MilkyWay-extreme.png
$T --target_type RGB --assign_oetf srgb hd/earth/00_earthmap4k.ktx2 assets-src/textures/earth/high-res/00_earthmap4k.jpg
$T --target_type RGB --assign_oetf srgb hd/earth/03_earthlights4k.ktx2 assets-src/textures/earth/high-res/03_earthlights4k.jpg
$T --target_type R --assign_oetf linear hd/earth/01_earthbump4k.ktx2 assets-src/textures/earth/high-res/01_earthbump4k.jpg
$T --target_type R --assign_oetf linear hd/earth/02_earthspec4k.ktx2 assets-src/textures/earth/high-res/02_earthspec4k.jpg
