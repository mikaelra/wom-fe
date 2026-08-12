#!/usr/bin/env node
/**
 * Reports which files in public/ are reachable from any path constructed in
 * src/, and which are not. Written for docs/MOBILE_AND_STEAM_PLAN.md §6 --
 * `next build` copies all of public/ into the export regardless of what any
 * code imports, so "is it referenced" and "is it shipped" are different
 * questions, and only this script answers the first one.
 *
 *   node scripts/audit-assets.mjs            # summary + the biggest offenders
 *   node scripts/audit-assets.mjs --unused   # just the dead paths, one per line
 *
 * This is static analysis of string literals, so it is conservative in the
 * direction that matters: a file built from a runtime-computed path (see
 * frogSkins.ts's `/models/frogs/${skinName}.glb`) is matched on its stem, but
 * a sufficiently dynamic path could still evade it. Treat "unused" as a
 * question to verify against a real playthrough, not a delete list.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const ASSET_EXTS = new Set([
  '.glb', '.gltf', '.bin', '.png', '.jpg', '.jpeg', '.webp', '.svg',
  '.hdr', '.ktx2', '.mp3', '.wav', '.ogg',
]);

// The Draco decoder is loaded by path prefix ('/draco/') rather than by
// filename, so its individual wasm/js files never appear as literals.
const SKIP_DIRS = new Set(['draco']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const source = walk('src')
  .filter((f) => ['.ts', '.tsx'].includes(extname(f)))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const used = [];
const unused = [];

for (const path of walk('public')) {
  if (!ASSET_EXTS.has(extname(path).toLowerCase())) continue;
  const name = basename(path);
  const stem = name.slice(0, name.length - extname(name).length);
  // Either the full filename appears verbatim, or the stem appears delimited
  // -- the latter catches `/models/frogs/${skinName}.glb` style construction.
  const referenced =
    source.includes(name) ||
    new RegExp(`["'\`/]${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`.]`).test(source);
  (referenced ? used : unused).push({ size: statSync(path).size, path });
}

const mb = (n) => (n / 1e6).toFixed(1).padStart(7) + ' MB';
const total = (list) => list.reduce((sum, f) => sum + f.size, 0);

if (process.argv.includes('--unused')) {
  for (const f of unused.sort((a, b) => b.size - a.size)) console.log(f.path);
  process.exit(0);
}

for (const [label, list] of [['UNREFERENCED', unused], ['REFERENCED', used]]) {
  list.sort((a, b) => b.size - a.size);
  console.log(`\n=== ${label}: ${list.length} files, ${mb(total(list)).trim()} ===`);
  for (const f of list.slice(0, 20)) console.log(`  ${mb(f.size)}  ${f.path}`);
  if (list.length > 20) console.log(`  ... +${list.length - 20} more`);
}
