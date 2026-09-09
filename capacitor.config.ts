import type { CapacitorConfig } from '@capacitor/cli';

// The iOS (and later Android) shell wraps the exact same static export the
// Steam/Electron build uses -- `npm run build:native` -> `out/` -- in a native
// webview pointed at the production backend. No game code lives in the shell.
// See docs/MOBILE_AND_STEAM_PLAN.md §5.4 / §7 and electron/README.md for the
// desktop counterpart.
const config: CapacitorConfig = {
  // Permanent: this string cannot change after the first store publish, and it
  // must match electron-builder.yml's `appId` and the reservation in
  // docs/MOBILE_AND_STEAM_PLAN.md §14.2. It is also what wom-be/cors.py's
  // NATIVE_SHELL_ORIGINS assumes the mobile origin derives from.
  appId: 'net.worldofmythos.game',
  appName: 'World of Mythos',

  // The build:native output. `npx cap sync ios` copies this into the native
  // project (ios/App/App/public/, gitignored -- regenerated every build).
  webDir: 'out',

  // Matches the Electron window and the app's own dark ground so there is no
  // white flash between launch image and first paint.
  backgroundColor: '#070b15',

  server: {
    // Default scheme. iOS serves the bundled assets from `capacitor://localhost`
    // -- already in wom-be/cors.py NATIVE_SHELL_ORIGINS, so REST + Socket.IO
    // work without a backend change. No `url` here: assets are bundled, not
    // loaded from a remote origin (Apple guideline 4.2 rejects bare wrappers).
    iosScheme: 'capacitor',
    androidScheme: 'https',
  },

  ios: {
    // Draw under the status bar / home indicator; the app's own HUD handles
    // safe-area insets (docs/MOBILE_AND_STEAM_PLAN.md §7.3 -- still TODO in app
    // code, tracked there).
    contentInset: 'always',
    // The game talks to a fixed backend origin over CORS; it is not an
    // app-bound-domains deployment.
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
