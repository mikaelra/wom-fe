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

  // Resolves to a hex Web API auth ticket for the backend's Steam login
  // (src/lib/steamAccount.ts), or null when Steam is off.
  getSteamTicket: () => ipcRenderer.invoke('wom:steam-ticket'),

  // Calls `listener({ orderId, authorized })` when the player answers a
  // Steam Wallet purchase dialog (src/lib/steamShop.ts). Returns an
  // unsubscribe function.
  onSteamPurchaseAnswer: (listener) => {
    const wrapped = (_event, answer) => listener(answer);
    ipcRenderer.on('wom:steam-microtxn', wrapped);
    return () => ipcRenderer.removeListener('wom:steam-microtxn', wrapped);
  },

  // Closes the game (the exit prompt on the globe, src/components/ExitGamePrompt.tsx).
  quit: () => ipcRenderer.send('wom:quit'),
});
