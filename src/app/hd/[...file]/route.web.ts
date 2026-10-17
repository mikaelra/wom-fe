// Serves the HD textures (hd/, outside public/) to web accounts that have
// HD -- lib/hdTextures.ts. Web server only: `.web.ts` is routed only when
// the build is not native (next.config.ts pageExtensions); the native builds
// carry hd/ in their own bundle instead.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { BACKEND_URL } from '@/config';
import { hdFilePath } from '@/lib/hdFiles';

// One backend check per session per minute: a scene asks for several files
// at once, and every texture request would otherwise be another round trip.
const CHECK_TTL_MS = 60_000;
const checks = new Map<string, { hd: boolean; at: number }>();

async function hasHd(token: string): Promise<boolean> {
  const cached = checks.get(token);
  if (cached && Date.now() - cached.at < CHECK_TTL_MS) return cached.hd;
  let hd = false;
  try {
    const res = await fetch(`${BACKEND_URL}/account/entitlements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
    hd = res.ok && (await res.json()).hd === true;
  } catch {
    return false; // backend unreachable: no answer to cache
  }
  if (checks.size > 10_000) checks.clear();
  checks.set(token, { hd, at: Date.now() });
  return hd;
}

export async function GET(request: Request, { params }: { params: Promise<{ file: string[] }> }) {
  const file = hdFilePath(process.cwd(), (await params).file);
  if (!file) return new Response('Not found', { status: 404 });

  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return new Response('Log in to use HD textures.', { status: 401 });
  if (!(await hasHd(token))) return new Response('HD textures are not unlocked.', { status: 403 });

  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      'Content-Type': 'image/ktx2',
      'Content-Length': String(size),
      // This browser only: the next player on a shared computer is checked again.
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
