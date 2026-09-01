import { describe, expect, it } from 'vitest';

import { discoveryGapMs, formatDiscoveryGap } from '@/lib/artifactLedger';

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe('formatDiscoveryGap', () => {
  it('shows every unit once the gap runs into days', () => {
    expect(formatDiscoveryGap(3 * D + 4 * H + 12 * M + 45 * S)).toBe('3d04h12m45s');
  });

  it('drops leading zero units', () => {
    // The whole point of being adaptive: a twelve-minute gap must not read
    // "00d00h12m45s".
    expect(formatDiscoveryGap(12 * M + 45 * S)).toBe('12m45s');
    expect(formatDiscoveryGap(4 * H + 12 * M + 45 * S)).toBe('4h12m45s');
    expect(formatDiscoveryGap(45 * S)).toBe('45s');
  });

  it('keeps interior zero units', () => {
    // Dropping the 00h here would read as five days and three minutes.
    expect(formatDiscoveryGap(5 * D + 3 * M + 2 * S)).toBe('5d00h03m02s');
    expect(formatDiscoveryGap(2 * H + 7 * S)).toBe('2h00m07s');
  });

  it('always shows seconds, so a tiny gap is not empty', () => {
    expect(formatDiscoveryGap(0)).toBe('0s');
    expect(formatDiscoveryGap(400)).toBe('0s');
  });

  it('does not pad days, which can run past two digits', () => {
    expect(formatDiscoveryGap(365 * D)).toBe('365d00h00m00s');
  });

  it('treats a negative gap as zero rather than rendering "-3s"', () => {
    // Clock skew, or rows arriving out of order.
    expect(formatDiscoveryGap(-3 * S)).toBe('0s');
  });

  it('truncates rather than rounds, so a gap never reads as longer than it is', () => {
    expect(formatDiscoveryGap(59 * S + 999)).toBe('59s');
  });
});

describe('discoveryGapMs', () => {
  it('measures forward between two timestamps', () => {
    expect(
      discoveryGapMs('2026-09-01T00:00:00Z', '2026-09-01T00:01:30Z'),
    ).toBe(90 * S);
  });

  it('returns null when either timestamp is missing', () => {
    // A row with no date shows no gap rather than a wrong one.
    expect(discoveryGapMs(null, '2026-09-01T00:00:00Z')).toBeNull();
    expect(discoveryGapMs('2026-09-01T00:00:00Z', null)).toBeNull();
    expect(discoveryGapMs(undefined, undefined)).toBeNull();
  });

  it('returns null for an unparseable timestamp', () => {
    expect(discoveryGapMs('not a date', '2026-09-01T00:00:00Z')).toBeNull();
  });
});
