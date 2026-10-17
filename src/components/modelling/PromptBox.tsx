'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_PROMPT_CHARS,
  pendingReloadAt,
  type TranscriptEntry,
} from '@/lib/modellingPrompts';

/**
 * The prompt box over the model on /modelling. TEMPORARY, with the page.
 *
 * Type a sculpting note ("shallower dome", "thinner columns") and it lands
 * in .modelling/prompts.jsonl, which whoever is editing the models is
 * tailing. Their reply comes back into the same box, and the edit itself
 * arrives on its own through Fast Refresh -- so a whole iteration happens
 * without leaving the browser, which is the point.
 *
 * Polled rather than socketed: the game's Socket.IO server is the backend,
 * this transcript lives in two files next to the dev server, and a 1.5s
 * poll of a file read is not worth a second transport to avoid.
 */

const POLL_MS = 1500;
const ENDPOINT = '/api/modelling-prompt';
/** Survives the hard reload a `reload` reply triggers -- without it the
 *  page would read the same flag after reloading and reload again. */
const RELOAD_KEY = 'modelling:lastReloadAt';

function readLastReload(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) || 0;
  } catch {
    // Private mode / storage disabled. Worst case: one extra reload.
    return 0;
  }
}

export default function PromptBox() {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { entries?: TranscriptEntry[] };
      const next = data.entries ?? [];
      setEntries(next);

      // A reply may ask for a hard reload, for the edits Fast Refresh
      // cannot apply in place.
      const due = pendingReloadAt(next, readLastReload());
      if (due !== null) {
        try {
          sessionStorage.setItem(RELOAD_KEY, String(due));
        } catch {
          // If we cannot record it, reload anyway -- better a repeat than
          // a change the page never picks up.
        }
        window.location.reload();
      }
    } catch {
      // Dev server mid-restart (a next.config edit does that). The next
      // tick picks it back up; a transient fetch failure is not worth
      // showing to the person typing.
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  // Follow the tail as replies land.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, open]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? `Could not send (${res.status}).`);
        return;
      }
      setText('');
      await poll();
    } catch {
      setError('Could not reach the dev server.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="absolute bottom-0 right-0 p-4 w-full max-w-md flex flex-col gap-2 pointer-events-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="self-end px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/20 bg-black/60 text-white/80 cursor-pointer hover:bg-black/80 transition-colors pointer-events-auto backdrop-blur-sm"
      >
        {open ? 'Hide prompt box' : `Prompt box${entries.length ? ` (${entries.length})` : ''}`}
      </button>

      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/15 bg-black/70 p-3 backdrop-blur-sm pointer-events-auto">
          <div
            ref={logRef}
            className="max-h-64 overflow-y-auto flex flex-col gap-2 text-xs leading-relaxed"
          >
            {entries.length === 0 && (
              <p className="text-white/40">
                Say what to change about the model. It reaches whoever is editing
                these files; their edit arrives here on its own.
              </p>
            )}
            {entries.map((e) => (
              <div
                key={`${e.at}-${e.role}`}
                className={e.role === 'you' ? 'self-end max-w-[85%]' : 'self-start max-w-[95%]'}
              >
                <p
                  className={
                    e.role === 'you'
                      ? 'rounded-lg px-2.5 py-1.5 bg-white/15 text-white/90 whitespace-pre-wrap break-words'
                      : 'rounded-lg px-2.5 py-1.5 bg-emerald-500/15 text-emerald-100/90 whitespace-pre-wrap break-words'
                  }
                >
                  {e.text}
                </p>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-red-300">{error}</p>}

          <div className="flex gap-2 items-end">
            <textarea
              value={text}
              onChange={(ev) => setText(ev.target.value.slice(0, MAX_PROMPT_CHARS))}
              onKeyDown={(ev) => {
                // Enter sends, shift+Enter breaks the line -- the box is for
                // one-line art direction far more often than a paragraph.
                if (ev.key === 'Enter' && !ev.shiftKey) {
                  ev.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="e.g. shallower dome, thinner columns"
              aria-label="Prompt"
              className="flex-1 resize-none rounded-lg bg-black/60 border border-white/20 px-2.5 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/45"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !text.trim()}
              className="px-3 py-2 rounded-lg text-sm font-semibold border border-white/25 bg-black/60 text-white/85 cursor-pointer hover:bg-black/80 transition-colors disabled:opacity-40 disabled:cursor-default"
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
