'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { affirmAge, resolveAccountSession } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';

// Asked once per account, on any platform: the Terms (src/app/terms) say a
// player must be 18 or older, or have a parent's or guardian's consent, to
// make a purchase. The answer is stored on the account (wom-be
// POST /account/age), so it isn't asked again on another device. It only
// concerns purchases, so it never stops anyone playing: "Not now" closes it
// until the next visit. Mounted once, in the root layout.

// The token already looked at in this visit -- checked again only after a
// login (a new token), not on every page change.
let checkedToken: string | null = null;

export function resetAgePromptForTests() {
  checkedToken = null;
}

export default function AgePrompt() {
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = getStoredAccountToken();
    if (!t || t === checkedToken) return;
    checkedToken = t;
    resolveAccountSession(t)
      .then((s) => {
        // Older backends don't send age_affirmed: don't ask then.
        if (s.age_affirmed === false) setToken(t);
      })
      .catch(() => undefined);
  }, [pathname]);

  if (!token) return null;

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await affirmAge(token);
      setToken(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-gray-900 border border-amber-500/40 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 w-5 h-5 accent-amber-500 cursor-pointer"
          />
          <span className="text-sm leading-relaxed">
            I am 18 or older, or have the consent of a parent or guardian, to make a purchase.
          </span>
        </label>
        <p className="text-xs text-white/50 mt-3">
          See the{' '}
          <Link href="/terms" className="underline">
            Terms
          </Link>
          .
        </p>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={confirm}
            disabled={!agreed || busy}
            className="flex-1 px-4 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={() => setToken(null)}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 font-bold hover:bg-gray-600 transition-colors cursor-pointer"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
