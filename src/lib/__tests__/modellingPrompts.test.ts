import { describe, expect, it } from 'vitest';
import {
  MAX_PROMPT_CHARS,
  mergeTranscript,
  parseTranscript,
  pendingReloadAt,
  toJsonl,
  validatePromptText,
  type TranscriptEntry,
} from '@/lib/modellingPrompts';

const you = (text: string, at: number): TranscriptEntry => ({ role: 'you', text, at });
const claude = (text: string, at: number, reload?: boolean): TranscriptEntry =>
  reload === undefined ? { role: 'claude', text, at } : { role: 'claude', text, at, reload };

describe('validatePromptText', () => {
  it('accepts and trims a normal prompt', () => {
    expect(validatePromptText('  shallower dome  ')).toEqual({ ok: true, text: 'shallower dome' });
  });

  it('rejects empty and whitespace-only prompts', () => {
    expect(validatePromptText('')).toEqual({ ok: false, error: 'Prompt is empty.' });
    expect(validatePromptText('   \n ')).toEqual({ ok: false, error: 'Prompt is empty.' });
  });

  it('rejects non-strings, which is what a malformed POST body sends', () => {
    for (const bad of [undefined, null, 42, {}, ['a']]) {
      expect(validatePromptText(bad).ok).toBe(false);
    }
  });

  it('accepts exactly the cap and rejects one past it', () => {
    expect(validatePromptText('x'.repeat(MAX_PROMPT_CHARS)).ok).toBe(true);
    expect(validatePromptText('x'.repeat(MAX_PROMPT_CHARS + 1)).ok).toBe(false);
  });

  it('measures the cap after trimming, not before', () => {
    expect(validatePromptText(`  ${'x'.repeat(MAX_PROMPT_CHARS)}  `).ok).toBe(true);
  });
});

describe('parseTranscript', () => {
  it('reads back what toJsonl wrote', () => {
    const entry = you('thinner columns', 1700000000000);
    expect(parseTranscript(toJsonl(entry))).toEqual([entry]);
  });

  it('is empty for an empty or blank file', () => {
    expect(parseTranscript('')).toEqual([]);
    expect(parseTranscript('\n\n  \n')).toEqual([]);
  });

  it('skips a torn final line rather than losing the file', () => {
    // Reading while the other process is mid-append is expected, not
    // exceptional -- one bad line must never blank the transcript.
    const good = toJsonl(you('a', 1));
    expect(parseTranscript(`${good}{"role":"you","text":"b"`)).toEqual([you('a', 1)]);
  });

  it('skips well-formed JSON that is not an entry', () => {
    expect(parseTranscript('{"role":"nobody","text":"x","at":1}\n')).toEqual([]);
    expect(parseTranscript('{"role":"you","at":1}\n')).toEqual([]);
    expect(parseTranscript('{"role":"you","text":"x","at":"soon"}\n')).toEqual([]);
    expect(parseTranscript('null\n[]\n"a string"\n')).toEqual([]);
  });

  it('rejects a non-finite timestamp, which would sort unpredictably', () => {
    expect(parseTranscript('{"role":"you","text":"x","at":null}\n')).toEqual([]);
  });

  it('keeps the reload flag', () => {
    expect(parseTranscript(toJsonl(claude('done', 5, true)))[0].reload).toBe(true);
  });
});

describe('mergeTranscript', () => {
  it('interleaves the two files oldest first', () => {
    const merged = mergeTranscript([you('a', 1), you('c', 3)], [claude('b', 2), claude('d', 4)]);
    expect(merged.map((e) => e.text)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('puts the prompt before a reply written in the same millisecond', () => {
    // A reply sharing a timestamp with a prompt is answering it.
    const merged = mergeTranscript([you('ask', 7)], [claude('answer', 7)]);
    expect(merged.map((e) => e.role)).toEqual(['you', 'claude']);
  });

  it('keeps the NEWEST entries when over the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => you(`p${i}`, i));
    const merged = mergeTranscript(many, [], 3);
    expect(merged.map((e) => e.text)).toEqual(['p7', 'p8', 'p9']);
  });

  it('handles either side being empty', () => {
    expect(mergeTranscript([], [])).toEqual([]);
    expect(mergeTranscript([you('a', 1)], [])).toEqual([you('a', 1)]);
    expect(mergeTranscript([], [claude('b', 1)])).toEqual([claude('b', 1)]);
  });
});

describe('pendingReloadAt', () => {
  it('finds a reload reply the page has not acted on', () => {
    expect(pendingReloadAt([claude('done', 9, true)], 0)).toBe(9);
  });

  it('ignores one already acted on -- otherwise the page reloads forever', () => {
    // The flag is still in the file after the reload; `since` is what stops
    // the loop.
    expect(pendingReloadAt([claude('done', 9, true)], 9)).toBeNull();
  });

  it('returns the newest when several are pending', () => {
    expect(pendingReloadAt([claude('a', 4, true), claude('b', 12, true)], 3)).toBe(12);
  });

  it('ignores replies without the flag, and prompts entirely', () => {
    expect(pendingReloadAt([claude('no flag', 9)], 0)).toBeNull();
    expect(pendingReloadAt([{ ...you('mine', 9), reload: true }], 0)).toBeNull();
  });

  it('is null for an empty transcript', () => {
    expect(pendingReloadAt([], 0)).toBeNull();
  });
});
