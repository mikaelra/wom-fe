import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import {
  MAX_TRANSCRIPT_ENTRIES,
  mergeTranscript,
  parseTranscript,
  toJsonl,
  validatePromptText,
} from '@/lib/modellingPrompts';

/**
 * The /modelling prompt box's back end. DEV ONLY, and TEMPORARY.
 *
 * `.dev.ts`, not `.ts`, and that is the whole guard: Next only treats a
 * file as a route if its name matches `route.<one of pageExtensions>`, and
 * next.config.ts adds `dev.ts` to that list for the web build and leaves it
 * off for the native one. A POST handler is a hard error under
 * `output: "export"` (Capacitor/Electron builds -- docs/MOBILE_AND_STEAM_PLAN.md
 * §5.3), so the native build must not see this file at all. Renaming it to
 * plain `route.ts` will break `npm run build:native`.
 *
 * It also refuses to run outside `next dev`, below. Between the two, this
 * cannot reach a player: it is absent from the native bundle and inert in
 * the production server.
 *
 * Storage is two append-only JSONL files under .modelling/ (gitignored):
 * this handler writes prompts.jsonl, the person editing the models writes
 * replies.jsonl. Two files because the dev server runs as root inside the
 * container and the editor is the host user, so neither can append to the
 * other's file. GET merges them.
 */

// Written under the bind-mounted project dir because that is the only path
// the container and the host both see. A dot-directory so the dev server's
// own watcher ignores it -- a prompt must not trigger a recompile.
const DIR = path.join(process.cwd(), '.modelling');
const PROMPTS = path.join(DIR, 'prompts.jsonl');
const REPLIES = path.join(DIR, 'replies.jsonl');

const isDev = process.env.NODE_ENV !== 'production';

async function readEntries(file: string) {
  try {
    return parseTranscript(await fs.readFile(file, 'utf8'));
  } catch {
    // Not written yet. An empty transcript, not an error.
    return [];
  }
}

export async function GET() {
  if (!isDev) return NextResponse.json({ error: 'Not available.' }, { status: 404 });
  const [prompts, replies] = await Promise.all([readEntries(PROMPTS), readEntries(REPLIES)]);
  return NextResponse.json(
    { entries: mergeTranscript(prompts, replies, MAX_TRANSCRIPT_ENTRIES) },
    // The page polls this; a cached answer would freeze the transcript.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  if (!isDev) return NextResponse.json({ error: 'Not available.' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const validated = validatePromptText((body as { text?: unknown } | null)?.text);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const entry = { role: 'you' as const, text: validated.text, at: Date.now() };
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(PROMPTS, toJsonl(entry), 'utf8');
  // Widened explicitly rather than through mkdir/appendFile's `mode`,
  // which the process umask silently narrows -- observed landing 755/644
  // when 777/666 was asked for. This matters: the dev server is root
  // inside the container and the person editing the models is the host
  // user, so a 755 directory here means their replies.jsonl can never be
  // created and the box only ever talks one way. chmod after the fact is
  // the only form umask does not touch.
  await Promise.all([
    fs.chmod(DIR, 0o777).catch(() => {}),
    fs.chmod(PROMPTS, 0o666).catch(() => {}),
  ]);

  return NextResponse.json({ ok: true, entry }, { status: 201 });
}
