import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/http';
import { requestsInFlight, resetLoadingTracker } from '@/lib/loadingTracker';

const jsonResponse = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(data) }) as unknown as Response;

beforeEach(() => {
  resetLoadingTracker();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request() and the loading indicator', () => {
  it('is in flight from the call until the response is parsed', async () => {
    let resolve: (r: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const pending = request('/x', z.object({ ok: z.boolean() }));
    expect(requestsInFlight()).toBe(1);
    resolve(jsonResponse({ ok: true }));
    await expect(pending).resolves.toEqual({ ok: true });
    expect(requestsInFlight()).toBe(0);
  });

  it('ends on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 500)));
    await expect(request('/x', z.object({}))).rejects.toThrow('nope');
    expect(requestsInFlight()).toBe(0);
  });

  it('ends when the network fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(request('/x', z.object({}))).rejects.toThrow('Failed to fetch');
    expect(requestsInFlight()).toBe(0);
  });
});
