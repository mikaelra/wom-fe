import { useEffect } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import type * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { BASIS_TRANSCODER_PATH, isKtx2 } from '@/lib/ktx2Textures';
import { hdRequestHeaders, isHdTexturePath } from '@/lib/hdTextures';

/**
 * KTX2 textures, transcoded for this GPU (ASTC on iPhone, BC7 on desktop).
 *
 * Unlike useTexture, these are released when the scene unmounts: dropped
 * from useLoader's cache (which would otherwise hold the compressed mip data
 * for the life of the app) and their GPU copies disposed. They are the big
 * ones -- the 8k Milky Way and the 4k Earth -- and the home globe's must not
 * still be resident when a boss fight loads its own sky.
 */
export function useKtx2Textures(urls: string[]): THREE.Texture[] {
  const gl = useThree((s) => s.gl);
  const textures = useLoader(KTX2Loader, urls, (loader) => {
    loader.setTranscoderPath(BASIS_TRANSCODER_PATH);
    loader.detectSupport(gl);
    // On the web the HD files are served only to an account that has HD.
    if (urls.some(isHdTexturePath)) loader.setRequestHeader(hdRequestHeaders());
  }) as THREE.Texture[];

  const key = urls.join('|');
  useEffect(() => () => {
    useLoader.clear(KTX2Loader, urls);
    textures.forEach((t) => t.dispose());
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return textures;
}

/**
 * useTexture for JPEG/PNG urls, useKtx2Textures for .ktx2 ones. Callers pass
 * one kind per call -- the HD paths are all KTX2 and the others all JPEG
 * (lib/ktx2Textures.ts), chosen once when the scene mounts
 * (lib/hdTextures.ts), so the hook called here never changes between renders.
 */
export function useGameTextures(urls: string[]): THREE.Texture[] {
  const ktx2 = urls.every(isKtx2);
  if (!ktx2 && urls.some(isKtx2)) {
    throw new Error(`useGameTextures: mixed KTX2 and image urls: ${urls.join(', ')}`);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- see docstring
  return ktx2 ? useKtx2Textures(urls) : (useTexture(urls) as THREE.Texture[]);
}
