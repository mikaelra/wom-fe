import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREVIEW_TO, SCRUB_END_MS, SPIN_UP_MS, TIMEWARP_DURATION_MS,
  parseTimewarp, scrubDate, timewarpFrame, timewarpParamFor,
} from '@/lib/timewarpFx';
import { FULL_MOON_MERCHANT_COLOR } from '@/lib/merchant';

describe('parseTimewarp', () => {
  it('is nothing without ?timewarp', () => {
    expect(parseTimewarp(null, null)).toBeNull();
  });

  it('is the full moon\'s purple for a bare ?timewarp or full_moon', () => {
    expect(parseTimewarp('', null)!.colors).toEqual([FULL_MOON_MERCHANT_COLOR]);
    expect(parseTimewarp('full_moon', null)!.colors).toEqual([FULL_MOON_MERCHANT_COLOR]);
  });

  it('is a conjunction\'s two planets\' own colours, not a blend', () => {
    // Mars red and Jupiter teal, as the globe draws them.
    expect(parseTimewarp('Mars-Jupiter', null)!.colors).toEqual(['#ff0000', '#008296']);
  });

  it('keeps every part\'s colours for a moment with both, each once', () => {
    expect(parseTimewarp('full_moon,Mercury-Jupiter,Mars-Jupiter', null)!.colors)
      .toEqual([FULL_MOON_MERCHANT_COLOR, '#db9504', '#008296', '#ff0000']);
  });

  it('ignores what it cannot read and falls back to the full moon', () => {
    expect(parseTimewarp('Pluto-Mars,Mars-Mars,x', null)!.colors).toEqual([FULL_MOON_MERCHANT_COLOR]);
  });

  it('warps to `to`, or to the 2028 overlap for a preview that does not say', () => {
    expect(parseTimewarp('', '2026-11-16T06:00:00Z')!.to).toEqual(new Date('2026-11-16T06:00:00Z'));
    expect(parseTimewarp('', null)!.to).toEqual(new Date(DEFAULT_PREVIEW_TO));
    expect(parseTimewarp('', 'garbage')!.to).toEqual(new Date(DEFAULT_PREVIEW_TO));
  });
});

describe('timewarpParamFor', () => {
  it('names the full moon and each conjunction', () => {
    expect(timewarpParamFor([
      { kind: 'conjunction', key: 'Mercury-Jupiter' },
      { kind: 'full_moon', key: '' },
    ])).toBe('full_moon,Mercury-Jupiter');
  });

  it('is the full moon for nothing at all', () => {
    expect(timewarpParamFor([])).toBe('full_moon');
  });

  it('round-trips through parseTimewarp', () => {
    const value = timewarpParamFor([{ kind: 'conjunction', key: 'Venus-Saturn' }]);
    expect(parseTimewarp(value, null)!.colors).toEqual(['#ab9d00', '#a16300']);
  });
});

describe('timewarpFrame', () => {
  it('starts still and dark', () => {
    expect(timewarpFrame(0)).toEqual({ spin: 0, scrub: 0, glow: 0, done: false });
  });

  it('spins up before running through time', () => {
    const f = timewarpFrame(SPIN_UP_MS);
    expect(f.spin).toBe(1);
    expect(f.scrub).toBe(0);
    expect(f.glow).toBe(1);
  });

  it('runs through time at full spin', () => {
    const mid = timewarpFrame((SPIN_UP_MS + SCRUB_END_MS) / 2);
    expect(mid.spin).toBe(1);
    expect(mid.scrub).toBeCloseTo(0.5, 9);
  });

  it('has arrived by the end of the run and settles after it', () => {
    expect(timewarpFrame(SCRUB_END_MS).scrub).toBe(1);
    const settling = timewarpFrame((SCRUB_END_MS + TIMEWARP_DURATION_MS) / 2);
    expect(settling.spin).toBeGreaterThan(0);
    expect(settling.spin).toBeLessThan(1);
  });

  it('is done, still and dark at the end', () => {
    expect(timewarpFrame(TIMEWARP_DURATION_MS)).toEqual({ spin: 0, scrub: 1, glow: 0, done: true });
  });
});

describe('scrubDate', () => {
  it('runs linearly from one instant to the other', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-03T00:00:00Z');
    expect(scrubDate(from, to, 0)).toEqual(from);
    expect(scrubDate(from, to, 0.5)).toEqual(new Date('2026-01-02T00:00:00Z'));
    expect(scrubDate(from, to, 1)).toEqual(to);
  });
});
