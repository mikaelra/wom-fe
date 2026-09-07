export {};

/**
 * The Electron/Steam shell (electron/preload.js) injects `window.wom` via a
 * contextBridge. It is absent on the web and in the Capacitor mobile build,
 * so every access must be guarded: `window.wom?.isSteam`.
 *
 * See docs/MOBILE_AND_STEAM_PLAN.md §10.
 */
declare global {
  interface Window {
    wom?: {
      /** Always true when present -- a cheap "are we in the Steam client" check. */
      readonly isSteam: true;
      /**
       * Steam identity for the signed-in user. `enabled` is false when the
       * Steam client isn't running or was disabled (WOM_STEAM=0); treat the
       * identity fields as optional regardless.
       */
      getSteamInfo(): Promise<{
        enabled: boolean;
        steamId: string | null;
        playerName: string | null;
        appId: number;
      }>;
    };
  }
}
