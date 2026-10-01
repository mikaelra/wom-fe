import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTimewarpRun } from '@/lib/useTimewarpRun';
import { FULL_MOON_MERCHANT_COLOR } from '@/lib/merchant';
import * as socketModule from '@/lib/socket';

vi.mock('@/lib/socket', () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    subscribe: (event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => listeners.get(event)?.delete(handler);
    },
    __fire: (event: string, payload: unknown) => {
      listeners.get(event)?.forEach((h) => h(payload));
    },
    __reset: () => listeners.clear(),
  };
});

const socket = socketModule as unknown as {
  __fire: (event: string, payload: unknown) => void;
  __reset: () => void;
};

const MARS_JUPITER = { kind: 'conjunction', key: 'Mars-Jupiter', bodies: ['Mars', 'Jupiter'], sign: 'Leo', at: 'x' };
const FULL_MOON = { kind: 'full_moon', key: '', bodies: ['Moon'], sign: 'Aries', at: 'x' };

const onArrival = vi.fn();
const refreshMerchantOffer = vi.fn();
const renderRun = () => renderHook(() => useTimewarpRun({ onArrival, refreshMerchantOffer }));

beforeEach(() => {
  socket.__reset();
  onArrival.mockClear();
  refreshMerchantOffer.mockClear();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useTimewarpRun', () => {
  it('plays nothing on a plain visit', () => {
    const { result } = renderRun();
    expect(result.current.run).toBeNull();
    expect(result.current.preview).toBe(false);
    expect(onArrival).not.toHaveBeenCalled();
  });

  it('previews ?timewarp from now, holding where it ends', () => {
    window.history.replaceState(null, '', '/city?id=athens&timewarp=Mars-Jupiter&to=2026-11-16T06%3A21%3A58Z');
    const { result } = renderRun();
    expect(result.current.preview).toBe(true);
    expect(result.current.run).toMatchObject({ from: 'now', hold: true });
    expect(result.current.run!.spec.colors).toEqual(['#ff0000', '#008296']);
    expect(result.current.run!.spec.to.toISOString()).toBe('2026-11-16T06:21:58.000Z');
    expect(onArrival).not.toHaveBeenCalled();
  });

  it('plays an arrival with &play=1 once from the sky, and lets the page clean the URL', () => {
    window.history.replaceState(null, '', '/?timewarp=full_moon&to=2028-10-03T12%3A00%3A00Z&play=1');
    const { result } = renderRun();
    expect(result.current.preview).toBe(false);
    expect(result.current.run).toMatchObject({ from: 'sky', hold: false });
    expect(onArrival).toHaveBeenCalledTimes(1);

    // The server's broadcast of that same timewarp does not replay it.
    const runId = result.current.runId;
    act(() => socket.__fire('timewarp', { revert_to_date: '2028-10-03T12:00:00+00:00', events: [FULL_MOON] }));
    expect(result.current.runId).toBe(runId);
    expect(refreshMerchantOffer).not.toHaveBeenCalled();
  });

  it('plays anyone\'s timewarp pushed by the server, and asks for the new merchants', () => {
    const { result } = renderRun();
    act(() => socket.__fire('timewarp', { revert_to_date: '2026-11-16T06:21:58+00:00', events: [MARS_JUPITER] }));
    expect(result.current.run).toMatchObject({ from: 'sky', hold: false });
    expect(result.current.run!.spec.colors).toEqual(['#ff0000', '#008296']);
    expect(result.current.runId).toBe(1);
    expect(refreshMerchantOffer).toHaveBeenCalledTimes(1);

    // The same one again is not a new timewarp.
    act(() => socket.__fire('timewarp', { revert_to_date: '2026-11-16T06:21:58+00:00', events: [MARS_JUPITER] }));
    expect(result.current.runId).toBe(1);
  });

  it('plays the hour running out, once per end, and drops the preview', () => {
    window.history.replaceState(null, '', '/?timewarp');
    const { result } = renderRun();
    expect(result.current.preview).toBe(true);

    const end = { ended_at: '2028-10-03T13:00:00+00:00', events: [FULL_MOON] };
    act(() => socket.__fire('timewarp_end', end));
    expect(result.current.preview).toBe(false);
    expect(result.current.run).toMatchObject({ from: 'sky', hold: false, ending: true });
    expect(result.current.run!.spec.colors).toEqual([FULL_MOON_MERCHANT_COLOR]);
    expect(refreshMerchantOffer).toHaveBeenCalledTimes(1);

    act(() => socket.__fire('timewarp_end', end));
    expect(result.current.runId).toBe(1);
  });

  it('replays a preview in the colours asked for, and its end from the moment warped to', () => {
    window.history.replaceState(null, '', '/?timewarp&to=2028-10-03T12%3A00%3A00Z');
    const { result } = renderRun();

    act(() => result.current.playPreview('Mars-Jupiter', '2026-11-16T06:21:58Z'));
    expect(result.current.runId).toBe(1);
    expect(result.current.run).toMatchObject({ from: 'now', hold: true });
    expect(result.current.run!.spec.colors).toEqual(['#ff0000', '#008296']);

    // No moment given: the URL's.
    act(() => result.current.playPreview('full_moon'));
    expect(result.current.run!.spec.to.toISOString()).toBe('2028-10-03T12:00:00.000Z');

    act(() => result.current.playPreviewEnd('full_moon'));
    expect(result.current.runId).toBe(3);
    expect(result.current.run).toMatchObject({ hold: false, ending: true });
    expect((result.current.run!.from as Date).toISOString()).toBe('2028-10-03T12:00:00.000Z');
  });
});
