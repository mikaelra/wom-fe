// Where a Steam web purchase's approval page opens (the Linux build, which
// runs without the Steam overlay -- electron/linux/world-of-mythos.sh). Kept
// in its own module (no electron import) so it's unit-testable -- see
// steamPage.test.js. main.js passes the result to shell.openExternal().
'use strict';

/**
 * The steam:// link that opens `url` in the Steam client, which is signed
 * in already, or null for anything that isn't an https page on
 * steampowered.com -- the renderer must not get to open arbitrary links
 * through this.
 */
function steamClientUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return null;
  }
  const host = parsed.hostname;
  if (parsed.protocol !== 'https:' || (host !== 'steampowered.com' && !host.endsWith('.steampowered.com'))) {
    return null;
  }
  return `steam://openurl/${parsed.href}`;
}

module.exports = { steamClientUrl };
