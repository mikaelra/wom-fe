# Branding

The World of Mythos logo (2026-10-05): the default frog (`frog_green_v1`,
"OG Green") with its head at the centre and its body running off the
bottom edge, in front of the loading animation at top speed in its purple
moment, on black. The same image on every platform (web, iOS, Steam,
Google Play), and the cover of the "World of Mythos" single.

**Every logo/icon file here and the in-app copies below are generated —
don't edit them by hand.** (Store art and screenshots: see the end.) Source: `wom-tools/animation-generation/frog_logo.py`
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

Not covered here: the iOS launch screen (`Splash.imageset`, still the
Capacitor placeholder).

## Store art and screenshots (2026-10-07)

Made with `wom-tools/store-art` (see its README). The Steam art is
generated from clean in-game shots — rebuild with
`python3 ../wom-tools/store-art/steam_art.py .`; the screenshots are taken
by hand and only filed (size-checked, 24-bit PNG, no alpha).

### Steam: Steamworks → Store Page Admin → Graphical Assets

| File | Size | Steam slot |
|---|---|---|
| `steam/store/header-capsule.png` | 920 × 430 | Header Capsule, **and** Library Header |
| `steam/store/small-capsule.png` | 462 × 174 | Small Capsule |
| `steam/store/main-capsule.png` | 1232 × 706 | Main Capsule |
| `steam/store/vertical-capsule.png` | 748 × 896 | Vertical Capsule |
| `steam/store/library-capsule.png` | 600 × 900 | Library Capsule |
| `steam/store/library-hero.png` | 3840 × 1240 | Library Hero (no logo) |
| `steam/store/library-logo.png` | 988 × 720, transparent | Library Logo (placed on the hero) |
| `steam/store/page-background.png` | 1438 × 810 | Page Background (optional) |
| `steam/screenshots/*.png` (9) | 1920 × 1080 | Screenshots |

### App Store Connect → the version → Previews and Screenshots

| Folder | Size | Display |
|---|---|---|
| `ios/screenshots/iphone-6.9-portrait/` (5) | 1320 × 2868 | iPhone 6.9" |
| `ios/screenshots/ipad-13-portrait/` (3) | 2064 × 2752 | iPad 13" |
| `ios/screenshots/ipad-13-landscape/` (4) | 2752 × 2064 | iPad 13" |

iPad shots are required because the app targets iPhone + iPad
(`TARGETED_DEVICE_FAMILY = "1,2"`).
