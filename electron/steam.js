// Thin wrapper around steamworks.js so main.js never has to care whether
// Steam is actually present. On a dev machine with no Steam client running,
// or with WOM_STEAM=0, every call here is a safe no-op and the game still
// boots -- docs/MOBILE_AND_STEAM_PLAN.md §10.4 ("a clear server-status
// screen rather than a hang").
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

// World of Mythos's Steam app id. Achievements, Steam Wallet purchases and
// the login ticket the backend checks (wom-be routes/steam_auth.py) all
// belong to it. WOM_STEAM_APPID=480 (Valve's "Spacewar" test app) still
// works for poking at the overlay without the real app.
const APP_ID = Number(process.env.WOM_STEAM_APPID || 4913070);

// Must match wom-be's config.STEAM_TICKET_IDENTITY: the backend checks the
// ticket was issued for it.
const TICKET_IDENTITY = 'wom-backend';

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

/**
 * A Web API auth ticket for the signed-in user, hex-encoded, for the
 * backend to check with Steam (ISteamUserAuth/AuthenticateUserTicket).
 * Null when Steam is off or the ticket couldn't be issued.
 */
async function getAuthTicket() {
  if (!client) return null;
  try {
    const ticket = await client.auth.getAuthTicketForWebApi(TICKET_IDENTITY);
    return ticket.getBytes().toString('hex');
  } catch (err) {
    console.warn('[steam] auth ticket failed:', err.message);
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
  getAuthTicket,
  shutdown,
};
