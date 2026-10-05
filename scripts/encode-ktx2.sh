#!/usr/bin/env bash
#
# Re-encode the native build's big textures as KTX2 (UASTC + zstd, with
# mipmaps). Why: src/lib/ktx2Textures.ts. Run after changing any source
# image below; commit the .ktx2 outputs next to their sources.
#
# Needs KTX-Software's `toktx` (https://github.com/KhronosGroup/KTX-Software/releases).
# Set TOKTX to its path, or wrap it, e.g. on a host whose libstdc++ is too old:
#   TOKTX="docker run --rm -v $PWD:/w -w /w -v /opt/ktx:/ktx -e LD_LIBRARY_PATH=/ktx/lib python:3.12-slim /ktx/bin/toktx"
#
# --lower_left_maps_to_s0t0 flips the image: compressed textures ignore
# three's flipY, so they must be stored the way GL samples them.
# Colour maps carry the sRGB transfer function; bump/spec are linear, one channel.
set -euo pipefail
cd "$(dirname "$0")/../public/textures"

TOKTX="${TOKTX:-toktx}"
T="$TOKTX --t2 --encode uastc --uastc_quality 2 --zcmp 19 --genmipmap --lower_left_maps_to_s0t0"

$T --target_type RGB --assign_oetf srgb stars/MilkyWay-extreme.ktx2 stars/MilkyWay-extreme.png
$T --target_type RGB --assign_oetf srgb earth/high-res/00_earthmap4k.ktx2 earth/high-res/00_earthmap4k.jpg
$T --target_type RGB --assign_oetf srgb earth/high-res/03_earthlights4k.ktx2 earth/high-res/03_earthlights4k.jpg
$T --target_type R --assign_oetf linear earth/high-res/01_earthbump4k.ktx2 earth/high-res/01_earthbump4k.jpg
$T --target_type R --assign_oetf linear earth/high-res/02_earthspec4k.ktx2 earth/high-res/02_earthspec4k.jpg
