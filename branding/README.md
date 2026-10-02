# Branding

The World of Mythos logo: a cube seen corner-on — three solid spokes, an
outer hexagon alternating solid and two-piece dotted edges, and a dot in
each face. Red (`#ff0000`); opaque icons sit on `#111111`.

**Every file here and the in-app copies below are generated — don't edit
them by hand.** Source: `wom-tools/animation-generation/wom_logo.py`
(the design, "v12a") and `logo_export.py` (this export). To regenerate
after a design change, from a wom-fe checkout:

```
python3 ../wom-tools/animation-generation/logo_export.py .
```

## Already wired in

| File | Used by |
|---|---|
| `public/wom.svg` | source art for the web icons |
| `src/app/icon.svg`, `src/app/icon.png` (512, transparent) | browser favicon (Next.js file-based icons) |
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
| `google-play/adaptive-foreground-432.png` + `adaptive-background-432.png` | Android adaptive launcher icon (`mipmap-anydpi-v26/ic_launcher.xml`) once the Android shell exists; the logo sits inside the 66/108 safe zone |
| `logo.svg`, `logo-1024.png` | master copies (vector / transparent PNG) for anything else |

Not covered here: Steam store capsules / library hero art (those are
artwork with the game title, made separately) and the iOS launch screen
(`Splash.imageset`, still the Capacitor placeholder).
