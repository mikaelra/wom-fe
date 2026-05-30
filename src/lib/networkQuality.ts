// Network-quality detection for gating heavy asset downloads.
// Returns 'slow' on poor connections, 'fast' otherwise.
// Cross-browser: uses navigator.connection where supported (Chrome/Edge/Android),
// otherwise estimates throughput from Resource Timing entries (Safari/iOS/Firefox).
// SSR-safe: returns 'fast' on the server.

export type NetworkTier = 'slow' | 'fast';

interface NetworkInformation {
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  downlink?: number;
  saveData?: boolean;
}

const SLOW_MBPS = 1.5;

let cached: NetworkTier | null = null;

export function getNetworkTier(): NetworkTier {
  if (cached) return cached;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'fast';

  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;

  if (conn) {
    const slow =
      conn.saveData === true ||
      (conn.effectiveType !== undefined && conn.effectiveType !== '4g') ||
      (typeof conn.downlink === 'number' && conn.downlink < SLOW_MBPS);
    cached = slow ? 'slow' : 'fast';
    return cached;
  }

  // Fallback: derive throughput from resources this page has already loaded.
  // Per-resource max is a better proxy for link capacity than total bytes / total
  // time, because resources load in parallel.
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  let maxMbps = 0;
  for (const e of entries) {
    if (e.transferSize < 20_000 || e.duration < 10) continue; // skip cached/tiny
    const mbps = (e.transferSize * 8) / 1000 / e.duration;
    if (mbps > maxMbps) maxMbps = mbps;
  }

  if (maxMbps > 0) {
    cached = maxMbps < SLOW_MBPS ? 'slow' : 'fast';
    return cached;
  }

  // No usable signal yet — don't cache, so a later call can retry once resources land.
  return 'fast';
}

export function isSlowNetwork(): boolean {
  return getNetworkTier() === 'slow';
}
