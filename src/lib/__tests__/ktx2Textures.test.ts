import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASIS_TRANSCODER_PATH, earthTexturePaths, isKtx2 } from '@/lib/ktx2Textures';
import { milkyWayTexturePath } from '@/lib/milkyWay';

describe('ktx2Textures', () => {
  it('recognises .ktx2 urls regardless of case', () => {
    expect(isKtx2('/a/b.ktx2')).toBe(true);
    expect(isKtx2('/a/b.KTX2')).toBe(true);
    expect(isKtx2('/a/b.jpg')).toBe(false);
  });

  it('gives HD the 4k earth as KTX2, in map/spec/bump/lights order', () => {
    const paths = earthTexturePaths(true);
    expect(paths.every(isKtx2)).toBe(true);
    expect(paths.map((p) => p.split('/').pop())).toEqual([
      '00_earthmap4k.ktx2',
      '02_earthspec4k.ktx2',
      '01_earthbump4k.ktx2',
      '03_earthlights4k.ktx2',
    ]);
  });

  it('keeps everyone else on the 1k JPEGs', () => {
    const paths = earthTexturePaths(false);
    expect(paths.some(isKtx2)).toBe(false);
    expect(paths.every((p) => p.includes('/low-res/') && p.endsWith('1k.jpg'))).toBe(true);
  });

  it('gives HD the full 8k Milky Way as KTX2 and everyone else the JPEG', () => {
    expect(milkyWayTexturePath(true)).toBe('/hd/stars/MilkyWay-extreme.ktx2');
    expect(milkyWayTexturePath(false)).toBe('/textures/stars/MilkyWay-HD.jpg');
  });

  it('keeps the HD files in hd/, not public/, where everyone could download them', () => {
    for (const url of [...earthTexturePaths(true), milkyWayTexturePath(true)]) {
      expect(url.startsWith('/hd/')).toBe(true);
      expect(existsSync(path.join(process.cwd(), url))).toBe(true);
      expect(existsSync(path.join(process.cwd(), 'public', url))).toBe(false);
    }
    for (const url of [...earthTexturePaths(false), milkyWayTexturePath(false)]) {
      expect(existsSync(path.join(process.cwd(), 'public', url))).toBe(true);
    }
  });

  it('serves the basis transcoder from the app itself, not a CDN', () => {
    expect(BASIS_TRANSCODER_PATH).toBe('/basis/');
  });
});
