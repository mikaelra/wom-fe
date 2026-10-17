# Branding

The World of Mythos logo (2026-10-05): the default frog (`frog_green_v1`,
"OG Green") with its head at the centre and its body running off the
bottom edge, in front of the loading animation at top speed in its purple
moment, on black. The same image on every platform (web, iOS, Steam,
Google Play), and the cover of the "World of Mythos" single.

**Every file here and the in-app copies below are generated — don't edit
them by hand.** Source: `wom-tools/animation-generation/frog_logo.py`
(it renders the frog from `public/models/frogs/frog_green_v1.glb` and the
spin frame from `loading_animation.py`). To regenerate, from a wom-fe
checkout (needs `npm install` for three.js + Playwright):

```
python3 ../wom-tools/animation-generation/frog_logo.py . --export
```

## Already wired in

| File | Used by |
|---|---|
| `src/app/icon.png` (512) | browser favicon (Next.js file-based icons) |
| `src/app/apple-icon.png` (180, opaque) | iOS Safari / Add to Home Screen |
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024, opaque) | iOS app icon (Capacitor shell) |
| `electron/resources/icon.png` (1024), `icon.ico` (16–256) | Steam/Electron executable + window icon (electron-builder `buildResources`) |

## Upload by hand

| File | Where |
|---|---|
| `steam/client-icon.ico` | Steamworks partner site → App Admin → Community Assets → Client Icon |
| `steam/community-icon-184.jpg` | same page → Community Icon (184×184 JPG) |
| `ios/AppIcon-1024.png` | App Store Connect, if it ever asks for the icon separately (the build already carries it) |
| `google-play/icon-512.png` | Play Console → Store listing → App icon (512×512) |
| `google-play/adaptive-background-432.png` + `adaptive-foreground-432.png` | Android adaptive launcher icon (`mipmap-anydpi-v26/ic_launcher.xml`) once the Android shell exists: the picture is the background layer (the launcher masks it to the middle, the head), the foreground is empty |
| `logo-3000.png`, `logo-1024.png` | master copies for anything else (3000×3000 = the Spotify cover size) |

Not covered here: Steam store capsules / library hero art (those are
artwork with the game title, made separately) and the iOS launch screen
(`Splash.imageset`, still the Capacitor placeholder).
