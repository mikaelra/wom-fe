#!/bin/sh
# Steam launch option for the Linux depot (steam/README.md). Steam starts
# Electron in a way that crashes it twice over (found 2026-10-08):
#  - the Steam overlay, which Steam LD_PRELOADs into every process, segfaults
#    Chromium's zygote at startup -- the main process lives on with no window;
#  - inside Steam's runtime container Chromium's Wayland backend segfaults.
# So: drop the overlay from LD_PRELOAD (no Shift+Tab overlay on Linux) and
# run on X11 (XWayland on Wayland desktops).
set -f
preload=
IFS=': '  # LD_PRELOAD entries are separated by colons or spaces
for lib in ${LD_PRELOAD-}; do
	case "$lib" in
		*gameoverlayrenderer.so) ;;
		*) preload="${preload:+$preload:}$lib" ;;
	esac
done
unset IFS
if [ -n "$preload" ]; then export LD_PRELOAD="$preload"; else unset LD_PRELOAD; fi
exec "$(dirname "$0")/world-of-mythos" --ozone-platform=x11 "$@"
