// Runs in an isolated world with Node access, bridging a tiny, explicit API
// into the game's `window`. contextIsolation is on and nodeIntegration off
// (electron/main.js), so this is the only channel between the two.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wom', {
  // True inside the Electron/Steam shell; undefined on the web and in the
  // mobile (Capacitor) build. Client code can branch on `window.wom?.isSteam`.
  isSteam: true,

  // Resolves to { enabled, steamId, playerName, appId }. `enabled` is false
  // when the Steam client is not running or WOM_STEAM=0 -- callers must treat
  // Steam identity as optional.
  getSteamInfo: () => ipcRenderer.invoke('wom:steam-info'),
});
