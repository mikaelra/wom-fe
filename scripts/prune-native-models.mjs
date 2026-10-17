#!/usr/bin/env node
/**
 * Leaves unused 3D models out of the iOS app. `next build` copies all of
 * public/ into out/, so every old version and -hd original in
 * public/models/ would otherwise ship in the app (~300 MB of it). This runs
 * after `npm run build:native` and before `cap sync ios`, and deletes from
 * out/models/ each .glb the built code never names -- public/ itself, the
 * web site and the Steam build are untouched.
 *
 * A model is kept if the built JS/HTML contains its file name, or its stem
 * as a quoted string: frogSkins.ts loads `/models/frogs/${skinName}.glb`,
 * so a skin is named only by its stem ("frog_rainbow_v2").
 *
 *   node scripts/prune-native-models.mjs            # prune out/models/
 *   node scripts/prune-native-models.mjs --dry-run  # just list them
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out');
const dryRun = process.argv.includes('--dry-run');

if (!existsSync(out)) {
  console.error('prune-native-models: no out/ -- run after `npm run build:native`');
  process.exit(1);
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

const CODE_EXTS = new Set(['.js', '.html', '.txt', '.json']);
const code = walk(out)
  .filter((p) => CODE_EXTS.has(extname(p)))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');

function isUsed(file) {
  const name = basename(file);
  const stem = basename(file, '.glb');
  return code.includes(name) || ['"', "'", '`'].some((q) => code.includes(q + stem + q));
}

let bytes = 0;
let count = 0;
for (const file of walk(join(out, 'models')).filter((p) => p.endsWith('.glb'))) {
  if (isUsed(file)) continue;
  bytes += statSync(file).size;
  count += 1;
  console.log(`  ${dryRun ? 'would drop' : 'dropped'} ${relative(out, file)}`);
  if (!dryRun) rmSync(file);
}
console.log(`prune-native-models: ${count} unused models, ${(bytes / 1048576).toFixed(0)} MB${dryRun ? ' (dry run)' : ''}`);
