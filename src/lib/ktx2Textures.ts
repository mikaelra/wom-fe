// GPU-compressed (KTX2) copies of the big HD textures.
//
// The iOS app's WebView is killed by jetsam at ~2 GB (JetsamEvent
// 2026-10-04: com.apple.WebKit.WebContent at 1970 MB, reason=highwater, the
// same second a boss fight loaded -- wom-be docs/IOS_KICKS_INVESTIGATION.md).
// A JPEG/PNG decodes to raw RGBA: the 8000x4000 Milky Way alone is ~122 MB
// before mipmaps. The same pixels as UASTC KTX2 transcode on the device to
// ASTC 4x4 (iPhone) or BC7 (Steam desktop) and stay compressed on the GPU --
// full resolution at roughly a quarter of the memory. The paid apps keep the
// full-resolution art; only its encoding changes.
//
// Who gets them is lib/hdTextures.ts: the paid apps, and web accounts that
// have paid. Everyone else gets the small JPEGs. Regenerate with
// scripts/encode-ktx2.sh.

/** Where KTX2Loader fetches basis_transcoder.{js,wasm} -- copied from three. */
export const BASIS_TRANSCODER_PATH = '/basis/';

export function isKtx2(url: string): boolean {
  return url.toLowerCase().endsWith('.ktx2');
}

/** Earth surface maps, in the order the globe consumes them: map, spec, bump, lights. */
export function earthTexturePaths(hd: boolean): [string, string, string, string] {
  if (hd) {
    return [
      '/hd/earth/00_earthmap4k.ktx2',
      '/hd/earth/02_earthspec4k.ktx2',
      '/hd/earth/01_earthbump4k.ktx2',
      '/hd/earth/03_earthlights4k.ktx2',
    ];
  }
  return [
    '/textures/earth/low-res/00_earthmap1k.jpg',
    '/textures/earth/low-res/02_earthspec1k.jpg',
    '/textures/earth/low-res/01_earthbump1k.jpg',
    '/textures/earth/low-res/03_earthlights1k.jpg',
  ];
}
