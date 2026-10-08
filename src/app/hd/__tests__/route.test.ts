import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config', () => ({ BACKEND_URL: 'http://backend' }));

import { GET } from '@/app/hd/[...file]/route.web';

const backend = vi.fn();

function get(parts: string[], token?: string) {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return GET(new Request('http://x/hd/' + parts.join('/'), { headers }), {
    params: Promise.resolve({ file: parts }),
  });
}

beforeEach(() => {
  backend.mockReset();
  vi.stubGlobal('fetch', backend);
});
afterEach(() => vi.unstubAllGlobals());

const ok = (hd: boolean) => Promise.resolve(new Response(JSON.stringify({ hd }), { status: 200 }));

describe('GET /hd/...', () => {
  it('serves the file to an account that has HD', async () => {
    backend.mockReturnValue(ok(true));
    const res = await get(['earth', '02_earthspec4k.ktx2'], 'paid');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/ktx2');
    expect(res.headers.get('Cache-Control')).toContain('private');
    expect(Number(res.headers.get('Content-Length'))).toBeGreaterThan(0);
    expect(backend).toHaveBeenCalledWith('http://backend/account/entitlements', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ token: 'paid' }),
    }));
  });

  it('asks the backend once a minute per session, not once per file', async () => {
    backend.mockReturnValue(ok(true));
    await get(['earth', '02_earthspec4k.ktx2'], 'cached');
    await get(['earth', '01_earthbump4k.ktx2'], 'cached');
    expect(backend).toHaveBeenCalledTimes(1);
  });

  it('needs a login', async () => {
    expect((await get(['earth', '02_earthspec4k.ktx2'])).status).toBe(401);
    expect(backend).not.toHaveBeenCalled();
  });

  it('refuses an account without HD', async () => {
    backend.mockReturnValue(ok(false));
    expect((await get(['earth', '02_earthspec4k.ktx2'], 'free')).status).toBe(403);
  });

  it('refuses when the backend says the session is no good', async () => {
    backend.mockReturnValue(Promise.resolve(new Response('{}', { status: 401 })));
    expect((await get(['earth', '02_earthspec4k.ktx2'], 'expired')).status).toBe(403);
  });

  it('refuses, without caching, when the backend is unreachable', async () => {
    backend.mockReturnValueOnce(Promise.reject(new Error('down'))).mockReturnValue(ok(true));
    expect((await get(['earth', '02_earthspec4k.ktx2'], 'flaky')).status).toBe(403);
    expect((await get(['earth', '02_earthspec4k.ktx2'], 'flaky')).status).toBe(200);
  });

  it('serves nothing outside hd/, and nothing that is not there', async () => {
    backend.mockReturnValue(ok(true));
    expect((await get(['..', 'package.json'], 'paid')).status).toBe(404);
    expect((await get(['earth', 'missing.ktx2'], 'paid')).status).toBe(404);
  });
});
