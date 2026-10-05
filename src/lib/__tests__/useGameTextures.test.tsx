import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const { gl, loaderCalls, clear, makeTex } = vi.hoisted(() => ({
  gl: { name: 'gl' },
  loaderCalls: [] as { urls: unknown; configured: string[] }[],
  clear: vi.fn(),
  makeTex: () => ({ dispose: vi.fn() }),
}));

vi.mock('@react-three/fiber', () => {
  const useLoader = (_proto: unknown, urls: string[], extend: (l: unknown) => void) => {
    const configured: string[] = [];
    extend({
      setTranscoderPath: (p: string) => configured.push(`path:${p}`),
      detectSupport: (r: { name: string }) => configured.push(`gl:${r.name}`),
    });
    loaderCalls.push({ urls, configured });
    return urls.map(makeTex);
  };
  useLoader.clear = clear;
  return { useLoader, useThree: (sel: (s: { gl: unknown }) => unknown) => sel({ gl }) };
});
vi.mock('@react-three/drei', () => ({
  useTexture: (urls: string[]) => urls.map(() => ({ kind: 'image' })),
}));
vi.mock('three/examples/jsm/loaders/KTX2Loader.js', () => ({ KTX2Loader: class {} }));

import { useGameTextures, useKtx2Textures } from '@/lib/useGameTextures';

beforeEach(() => {
  loaderCalls.length = 0;
  clear.mockClear();
});

describe('useKtx2Textures', () => {
  it('points the loader at the bundled transcoder and this renderer', () => {
    renderHook(() => useKtx2Textures(['/a.ktx2']));
    expect(loaderCalls[0].configured).toEqual(['path:/basis/', 'gl:gl']);
  });

  it('drops the cache entry and disposes the textures on unmount', () => {
    const { result, unmount } = renderHook(() => useKtx2Textures(['/a.ktx2', '/b.ktx2']));
    const textures = result.current as unknown as { dispose: ReturnType<typeof vi.fn> }[];
    expect(clear).not.toHaveBeenCalled();
    unmount();
    expect(clear).toHaveBeenCalledWith(expect.anything(), ['/a.ktx2', '/b.ktx2']);
    textures.forEach((t) => expect(t.dispose).toHaveBeenCalledOnce());
  });
});

describe('useGameTextures', () => {
  it('routes .ktx2 urls through the KTX2 loader', () => {
    renderHook(() => useGameTextures(['/sky.ktx2']));
    expect(loaderCalls).toHaveLength(1);
  });

  it('routes image urls through useTexture', () => {
    const { result } = renderHook(() => useGameTextures(['/sky.jpg', '/x.png']));
    expect(loaderCalls).toHaveLength(0);
    expect(result.current).toEqual([{ kind: 'image' }, { kind: 'image' }]);
  });

  it('refuses a mix of KTX2 and image urls', () => {
    expect(() => renderHook(() => useGameTextures(['/a.ktx2', '/b.jpg']))).toThrow(/mixed/);
  });
});
