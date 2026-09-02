/**
 * The /modelling prompt box: the little transcript that carries sculpting
 * notes from the browser to whoever is editing the models.
 *
 * TEMPORARY, like the rest of /modelling. The point is to be able to type
 * "make the dome shallower" over the model and have the change appear
 * under Fast Refresh without leaving the browser, rather than switching to
 * a terminal to say it.
 *
 * Two append-only JSONL files rather than one, and that is not arbitrary:
 * the dev server writes as root inside the container while the person
 * editing the files is the host user, so neither can append to the other's
 * file. Each writes its own and this module merges them for display.
 */

export type TranscriptRole = 'you' | 'claude';

export interface TranscriptEntry {
  role: TranscriptRole;
  text: string;
  /** Epoch ms. The only ordering key -- the two files are written by two
   *  different processes and neither sees the other's line numbers. */
  at: number;
  /** Set on a reply to make the page hard-reload once it is shown. Fast
   *  Refresh handles ordinary edits; this is the escape hatch for the ones
   *  it cannot apply (a changed module-level constant, a new file). */
  reload?: boolean;
}

/** Long enough for a paragraph of art direction, short enough that the
 *  file cannot be filled by one paste. */
export const MAX_PROMPT_CHARS = 2000;

/** How many entries the page shows and the reader keeps. */
export const MAX_TRANSCRIPT_ENTRIES = 200;

export type PromptValidation =
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Trim, reject empty, cap length. */
export function validatePromptText(raw: unknown): PromptValidation {
  if (typeof raw !== 'string') return { ok: false, error: 'Prompt must be text.' };
  const text = raw.trim();
  if (!text) return { ok: false, error: 'Prompt is empty.' };
  if (text.length > MAX_PROMPT_CHARS) {
    return { ok: false, error: `Prompt is too long (max ${MAX_PROMPT_CHARS} characters).` };
  }
  return { ok: true, text };
}

function isTranscriptEntry(value: unknown): value is TranscriptEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    (e.role === 'you' || e.role === 'claude') &&
    typeof e.text === 'string' &&
    typeof e.at === 'number' &&
    Number.isFinite(e.at)
  );
}

/**
 * Parse an append-only JSONL file, skipping anything unreadable.
 *
 * Tolerant on purpose: this file is appended to by two processes and read
 * while it is being written, so a torn final line is expected rather than
 * exceptional. One bad line must never blank the transcript.
 */
export function parseTranscript(contents: string): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isTranscriptEntry(parsed)) out.push(parsed);
    } catch {
      // Torn or half-written line -- skip it, keep the rest.
    }
  }
  return out;
}

/**
 * Interleave the two files into one transcript, oldest first.
 *
 * Ties break with the prompt ahead of the reply: a reply written in the
 * same millisecond as a prompt is answering it, never preceding it.
 */
export function mergeTranscript(
  prompts: readonly TranscriptEntry[],
  replies: readonly TranscriptEntry[],
  limit = MAX_TRANSCRIPT_ENTRIES,
): TranscriptEntry[] {
  const all = [...prompts, ...replies];
  all.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    if (a.role === b.role) return 0;
    return a.role === 'you' ? -1 : 1;
  });
  return all.slice(-limit);
}

/** One JSONL line, newline included. */
export function toJsonl(entry: TranscriptEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

/**
 * Should the page hard-reload after rendering this transcript?
 *
 * True only for a `reload` reply the page has not already acted on, which
 * is what `since` carries -- without it the page would reload forever, the
 * flag still being in the file it re-reads after the reload.
 */
export function pendingReloadAt(
  entries: readonly TranscriptEntry[],
  since: number,
): number | null {
  let latest: number | null = null;
  for (const e of entries) {
    if (e.role === 'claude' && e.reload && e.at > since) {
      latest = latest === null ? e.at : Math.max(latest, e.at);
    }
  }
  return latest;
}
