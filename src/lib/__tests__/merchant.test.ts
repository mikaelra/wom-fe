import { describe, expect, it } from 'vitest';
import { merchantMarkerLatLng } from '@/lib/merchant';

describe('merchantMarkerLatLng', () => {
  it('is deterministic for the same period', () => {
    const a = merchantMarkerLatLng('2026-09-26T16:49:32Z');
    const b = merchantMarkerLatLng('2026-09-26T16:49:32Z');
    expect(a).toEqual(b);
  });

  it('moves for a different period', () => {
    const a = merchantMarkerLatLng('2026-09-26T16:49:32Z');
    const b = merchantMarkerLatLng('2026-08-28T02:18:11Z');
    expect(a).not.toEqual(b);
  });

  it('stays within the usable lat/lng band, away from the poles', () => {
    const seeds = [
      '2026-09-26T16:49:32Z', '2026-08-28T02:18:11Z', '', 'x', '2040-01-01T00:00:00Z',
    ];
    for (const seed of seeds) {
      const { lat, lng } = merchantMarkerLatLng(seed);
      expect(lat).toBeGreaterThanOrEqual(-60);
      expect(lat).toBeLessThanOrEqual(60);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
  });
});
