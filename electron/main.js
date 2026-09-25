// Electron main process for the Steam build -- docs/MOBILE_AND_STEAM_PLAN.md
// §10. This wraps the exact same static export the mobile shell uses
// (`npm run build:native` -> `out/`) in a Chromium window, pointed at the
// production backend. No game code lives here; this file only opens a window,
// serves `out/` over a custom scheme, and wires Steam.
'use strict';

const { app, BrowserWindow, shell, protocol, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const steam = require('./steam');
const { resolveFile, contentType } = require('./serveFromExport');

// The renderer loads from app://wom/ rather than file:// -- Next's static
// export uses absolute /_next/... URLs and a client-side router, both of
// which need a real origin with directory-root semantics. A file:// page
// has neither. `standard` gives it URL parsing + a stable origin, and the
// backend's CORS_ALLOWED_ORIGINS must list this exact origin string:
//   app://wom
const APP_SCHEME = 'app';
const APP_HOST = 'wom';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const OUT_DIR = path.join(__dirname, '..', 'out');

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const file = resolveFile(pathname, OUT_DIR);
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, { headers: { 'content-type': contentType(file) } });
    } catch (err) {
      console.error('[app://] failed to serve', pathname, '->', file, err.message);
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#070b15',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // External links (docs, support, Steam community) open in the user's
  // browser, never inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_ORIGIN)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(`${APP_ORIGIN}/`);

  if (process.env.WOM_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

// If the build was launched straight from its folder rather than through
// Steam, this relaunches it via Steam and asks us to quit. No-op in dev
// (steam.js drops a steam_appid.txt in cwd) and when Steam is disabled.
if (steam.restartAppIfNecessary()) {
  app.quit();
} else {
  // Single instance: a second launch focuses the existing window instead of
  // opening a rival one (and rival Steam/Socket.IO sessions).
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      const [win] = BrowserWindow.getAllWindows();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    });

    // The renderer asks for Steam identity through this channel (see
    // electron/preload.js -> window.wom). Kept read-only for now; achievements
    // and rich presence get their own channels when they land.
    ipcMain.handle('wom:steam-info', () => ({
      enabled: steam.isEnabled(),
      steamId: steam.getSteamId(),
      playerName: steam.getPlayerName(),
      appId: steam.APP_ID,
    }));

    // Before app-ready: init() appends the GPU command-line switches the
    // Steam overlay needs (in-process-gpu, disable-direct-composition), which
    // are ignored once the GPU process has started.
    steam.init();

    app.whenReady().then(() => {
      registerAppProtocol();
      createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    });

    app.on('window-all-closed', () => {
      steam.shutdown();
      if (process.platform !== 'darwin') app.quit();
    });
  }
}
