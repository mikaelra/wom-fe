#!/usr/bin/env node
/**
 * Copies hd/ into the native build's static export (out/hd/), after
 * `next build`. The paid apps always carry the HD textures; on the web they
 * stay out of public/ and are served only to accounts that have HD
 * (src/lib/hdTextures.ts). Same /hd/... paths either way.
 */
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out');
if (!existsSync(out)) {
  console.error('copy-hd-assets: no out/ -- run after `next build` with BUILD_TARGET=native');
  process.exit(1);
}
cpSync(join(root, 'hd'), join(out, 'hd'), { recursive: true });
console.log('copy-hd-assets: hd/ -> out/hd/');
