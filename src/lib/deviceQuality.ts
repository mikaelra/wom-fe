// Lightweight device-quality detection for adapting 3D rendering on low-end mobiles.
// Returns 'low' for old phones / underpowered devices, 'high' otherwise.
// SSR-safe: returns 'high' on the server (no window/navigator).

export type QualityTier = 'low' | 'high';

let cached: QualityTier | null = null;

export function getQualityTier(): QualityTier {
  if (cached) return cached;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'high';

  const dpr = window.devicePixelRatio || 1;
  // navigator.deviceMemory is in GB; not available in Safari (returns undefined → assume 4)
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;

  // Heuristic: high-DPR phone with little memory → low tier.
  // Catches old iPhones (DPR 2-3, ~2GB) and budget Androids.
  const isLow = mem <= 4 && dpr >= 2;

  cached = isLow ? 'low' : 'high';
  return cached;
}

export function isLowQuality(): boolean {
  return getQualityTier() === 'low';
}
