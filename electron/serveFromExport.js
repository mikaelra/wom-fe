// Maps a request path onto a file in Next's static export (`out/`). Kept in
// its own module (no electron import) so it's unit-testable -- see
// serveFromExport.test.js. main.js wraps this in a protocol.handle().
'use strict';

const path = require('node:path');
const fs = require('node:fs');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
  '.ktx2': 'image/ktx2',
  '.txt': 'text/plain',
};

function contentType(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/**
 * Resolve a URL path against the static export in `outDir`. Next's export
 * (no `trailingSlash`) writes `index.html` at the root and `<route>.html`
 * for every other page, plus nested files for dynamic routes:
 *
 *   /              -> outDir/index.html
 *   /_next/x.js    -> outDir/_next/x.js       (has an extension, served as-is)
 *   /login         -> outDir/login.html
 *   /rules/p1      -> outDir/rules/p1.html
 *   <no such file> -> outDir/index.html       (let the client router decide)
 *
 * The final fallback matters: a hard reload on a client-only URL (a
 * `/city?id=` deep link, say) must still boot the app rather than 404.
 * Query string and hash are ignored. Path traversal outside `outDir`
 * collapses to the fallback.
 */
function resolveFile(urlPath, outDir) {
  const root = path.resolve(outDir);
  const fallback = path.join(root, 'index.html');

  let clean;
  try {
    clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return fallback; // malformed percent-encoding
  }

  const rel = clean.replace(/^\/+/, '');
  if (rel === '') return fallback;

  const direct = path.join(root, rel);
  const candidates = path.extname(rel)
    ? [direct]
    : [`${direct}.html`, path.join(direct, 'index.html')];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (
      (resolved === root || resolved.startsWith(root + path.sep)) &&
      fs.existsSync(resolved) &&
      fs.statSync(resolved).isFile()
    ) {
      return resolved;
    }
  }

  return fallback;
}

module.exports = { resolveFile, contentType };
