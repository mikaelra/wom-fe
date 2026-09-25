// Thin wrapper around steamworks.js so main.js never has to care whether
// Steam is actually present. On a dev machine with no Steam client running,
// or with WOM_STEAM=0, every call here is a safe no-op and the game still
// boots -- docs/MOBILE_AND_STEAM_PLAN.md §10.4 ("a clear server-status
// screen rather than a hang").
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

// Placeholder app id. 480 is Valve's public test app ("Spacewar") -- it lets
// the Steam overlay, friends and achievements plumbing initialise before we
// have a real app id, which does not exist until Steam Direct is paid and
// Valve assigns one (§10.2). Override with WOM_STEAM_APPID once that lands.
const APP_ID = Number(process.env.WOM_STEAM_APPID || 480);

const STEAM_DISABLED = process.env.WOM_STEAM === '0';

let steamworks = null;
let client = null;

// In a packaged build Steam injects the app id and a stray steam_appid.txt
// actively breaks launch detection, so only do this for an unpackaged dev
// run. steamworks.js reads the file from process.cwd(); `electron .` runs
// with cwd at the repo root.
function ensureDevAppIdFile() {
  if (app.isPackaged || STEAM_DISABLED) return;
  const file = path.join(process.cwd(), 'steam_appid.txt');
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, `${APP_ID}\n`);
  } catch (err) {
    console.warn('[steam] could not write dev steam_appid.txt:', err.message);
  }
}

function load() {
  if (steamworks || STEAM_DISABLED) return steamworks;
  try {
    ensureDevAppIdFile();
    steamworks = require('steamworks.js');
  } catch (err) {
    console.warn('[steam] steamworks.js failed to load:', err.message);
    steamworks = null;
  }
  return steamworks;
}

/**
 * Relaunch through Steam if the build was started directly (double-clicked
 * the exe instead of hitting Play in the library). Returns true when the
 * caller should quit immediately. No-op in dev: steam_appid.txt next to the
 * binary tells the SDK "already running under this app id".
 */
function restartAppIfNecessary() {
  const sw = load();
  if (!sw) return false;
  try {
    return sw.restartAppIfNecessary(APP_ID);
  } catch (err) {
    console.warn('[steam] restartAppIfNecessary failed:', err.message);
    return false;
  }
}

/** Initialise the Steam client. Safe to call once, after app is ready. */
function init() {
  const sw = load();
  if (!sw || client) return client;
  try {
    client = sw.init(APP_ID);
    // Route the Steam overlay's input/rendering through Electron's compositor
    // -- without this the overlay (Shift+Tab) does not draw over the game.
    sw.electronEnableSteamOverlay();
    const name = client.localplayer.getName();
    console.log(`[steam] initialised as "${name}" (app ${APP_ID})`);
  } catch (err) {
    console.warn('[steam] init failed, continuing without Steam:', err.message);
    client = null;
  }
  return client;
}

function isEnabled() {
  return client != null;
}

/** Steam ID of the signed-in user, as a string, or null when Steam is off. */
function getSteamId() {
  if (!client) return null;
  try {
    return client.localplayer.getSteamId().steamId64.toString();
  } catch {
    return null;
  }
}

/** Display name of the signed-in user, or null. */
function getPlayerName() {
  if (!client) return null;
  try {
    return client.localplayer.getName();
  } catch {
    return null;
  }
}

function shutdown() {
  // steamworks.js has no explicit shutdown; the process exit handles it.
  client = null;
}

module.exports = {
  APP_ID,
  restartAppIfNecessary,
  init,
  isEnabled,
  getSteamId,
  getPlayerName,
  shutdown,
};
