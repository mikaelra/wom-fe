import { describe, expect, it } from 'vitest';
import { BASIS_TRANSCODER_PATH, earthTexturePaths, isKtx2 } from '@/lib/ktx2Textures';
import { milkyWayTexturePath } from '@/lib/milkyWay';

describe('ktx2Textures', () => {
  it('recognises .ktx2 urls regardless of case', () => {
    expect(isKtx2('/a/b.ktx2')).toBe(true);
    expect(isKtx2('/a/b.KTX2')).toBe(true);
    expect(isKtx2('/a/b.jpg')).toBe(false);
  });

  it('gives native builds the 4k earth as KTX2, in map/spec/bump/lights order', () => {
    const paths = earthTexturePaths(true);
    expect(paths.every(isKtx2)).toBe(true);
    expect(paths.map((p) => p.split('/').pop())).toEqual([
      '00_earthmap4k.ktx2',
      '02_earthspec4k.ktx2',
      '01_earthbump4k.ktx2',
      '03_earthlights4k.ktx2',
    ]);
  });

  it('keeps the web build on the 1k JPEGs', () => {
    const paths = earthTexturePaths(false);
    expect(paths.some(isKtx2)).toBe(false);
    expect(paths.every((p) => p.includes('/low-res/') && p.endsWith('1k.jpg'))).toBe(true);
  });

  it('gives native builds the full 8k Milky Way as KTX2 and the web the JPEG', () => {
    expect(milkyWayTexturePath(true)).toBe('/textures/stars/MilkyWay-extreme.ktx2');
    expect(milkyWayTexturePath(false)).toBe('/textures/stars/MilkyWay-HD.jpg');
  });

  it('serves the basis transcoder from the app itself, not a CDN', () => {
    expect(BASIS_TRANSCODER_PATH).toBe('/basis/');
  });
});
