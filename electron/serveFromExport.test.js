import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveFile, contentType } from './serveFromExport.js';

// A fixture that mirrors the shape `next build` (output: export) produces.
let out;

beforeAll(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'wom-out-'));
  fs.mkdirSync(path.join(out, '_next', 'static', 'chunks'), { recursive: true });
  fs.mkdirSync(path.join(out, 'rules'), { recursive: true });
  fs.mkdirSync(path.join(out, 'models'), { recursive: true });
  for (const f of [
    'index.html',
    'login.html',
    'city.html',
    'settings.html',
    '404.html',
    'rules.html',
    'rules/p1.html',
    '_next/static/chunks/main.js',
    'models/well.glb',
  ]) {
    fs.writeFileSync(path.join(out, f), 'x');
  }
});

afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

const rel = (abs) => path.relative(out, abs).split(path.sep).join('/');

describe('resolveFile', () => {
  it('serves index.html at the root', () => {
    expect(rel(resolveFile('/', out))).toBe('index.html');
    expect(rel(resolveFile('', out))).toBe('index.html');
  });

  it('maps an extensionless route to its .html file', () => {
    expect(rel(resolveFile('/login', out))).toBe('login.html');
    expect(rel(resolveFile('/settings', out))).toBe('settings.html');
    expect(rel(resolveFile('/rules/p1', out))).toBe('rules/p1.html');
  });

  it('serves a real asset as-is', () => {
    expect(rel(resolveFile('/_next/static/chunks/main.js', out))).toBe(
      '_next/static/chunks/main.js',
    );
    expect(rel(resolveFile('/models/well.glb', out))).toBe('models/well.glb');
  });

  it('ignores query string and hash', () => {
    expect(rel(resolveFile('/city?id=abc123', out))).toBe('city.html');
    expect(rel(resolveFile('/city#top', out))).toBe('city.html');
  });

  it('falls back to index.html for an unknown client-only route', () => {
    expect(rel(resolveFile('/lobby/xyz/live', out))).toBe('index.html');
    expect(rel(resolveFile('/does-not-exist.js', out))).toBe('index.html');
  });

  it('does not escape the export directory', () => {
    expect(rel(resolveFile('/../../../etc/passwd', out))).toBe('index.html');
    expect(rel(resolveFile('/..%2f..%2fpackage.json', out))).toBe('index.html');
  });

  it('survives malformed percent-encoding', () => {
    expect(rel(resolveFile('/%E0%A4%A', out))).toBe('index.html');
  });
});

describe('contentType', () => {
  it('knows the web + 3D asset types the game loads', () => {
    expect(contentType('/a/b.html')).toBe('text/html');
    expect(contentType('x.js')).toBe('text/javascript');
    expect(contentType('scene.glb')).toBe('model/gltf-binary');
    expect(contentType('draco_decoder.wasm')).toBe('application/wasm');
    expect(contentType('sky.hdr')).toBe('image/vnd.radiance');
  });

  it('defaults unknown extensions to octet-stream', () => {
    expect(contentType('mystery.xyz')).toBe('application/octet-stream');
  });
});
