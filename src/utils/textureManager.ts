import * as THREE from 'three';

export type TextureQuality = 'low' | 'hd' | 'extreme';
export type TextureKey = 'earthMap' | 'specularMap' | 'bumpMap' | 'lightsMap' | 'cloudsMap' | 'cloudsTrans';

// Only the textures that genuinely differ per quality — keeps VRAM usage minimal.
// Switching quality only loads the changed maps, never duplicates the full pack.
const QUALITY_PATCHES: Record<Exclude<TextureQuality, 'low'>, Partial<Record<TextureKey, string>>> = {
  hd: {
    specularMap: '/textures/earth/high-res/02_earthspec4k.jpg',
    cloudsTrans: '/textures/earth/high-res/05_earthcloudmaptrans.jpg',
  },
  extreme: {
    specularMap: '/textures/earth/extreme-res/02_earthspec10k.jpg',
    cloudsTrans: '/textures/earth/extreme-res/05_earthcloudmaptrans.jpg',
  },
};

export type QualityPatch = Partial<Record<TextureKey, THREE.Texture>>;

const cache = new Map<Exclude<TextureQuality, 'low'>, QualityPatch>();
const inflight = new Map<Exclude<TextureQuality, 'low'>, Promise<QualityPatch>>();

function loadOne(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
}

async function fetchPatch(quality: Exclude<TextureQuality, 'low'>): Promise<QualityPatch> {
  const paths = QUALITY_PATCHES[quality];
  const entries = await Promise.all(
    Object.entries(paths).map(([key, url]) =>
      loadOne(url).then((tex) => [key, tex] as [TextureKey, THREE.Texture]),
    ),
  );
  return Object.fromEntries(entries);
}

export const textureManager = {
  /** Load (or return cached) the set of textures that differ from low-res for this quality. */
  async getPatch(quality: Exclude<TextureQuality, 'low'>): Promise<QualityPatch> {
    const hit = cache.get(quality);
    if (hit) return hit;

    // Deduplicate concurrent requests for the same quality
    const existing = inflight.get(quality);
    if (existing) return existing;

    const promise = fetchPatch(quality).then((patch) => {
      cache.set(quality, patch);
      inflight.delete(quality);
      return patch;
    });
    inflight.set(quality, promise);
    return promise;
  },

  /** Dispose GPU memory for a quality's patch and remove it from the cache. */
  dispose(quality: Exclude<TextureQuality, 'low'>) {
    const patch = cache.get(quality);
    if (!patch) return;
    Object.values(patch).forEach((tex) => tex.dispose());
    cache.delete(quality);
  },
};

// ── Cookie helpers ─────────────────────────────────────────────────────────

const COOKIE_KEY = 'earth_texture_quality';
const ONE_YEAR   = 60 * 60 * 24 * 365;

export function getQualityCookie(): TextureQuality {
  if (typeof document === 'undefined') return 'low';
  const m = document.cookie.match(/(?:^|;\s*)earth_texture_quality=([^;]+)/);
  const v = m?.[1];
  return v === 'hd' || v === 'extreme' ? v : 'low';
}

export function setQualityCookie(quality: TextureQuality) {
  document.cookie = `${COOKIE_KEY}=${quality}; max-age=${ONE_YEAR}; path=/; SameSite=Lax`;
}
