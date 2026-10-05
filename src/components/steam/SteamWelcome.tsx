'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSteamAccount, startSteamLink, steamSignIn } from '@/lib/steamAccount';
import { NAME_MAX_LENGTH } from '@/lib/useAuthFlow';

/**
 * The Steam build's sign-in (src/lib/steamAccount.ts): at startup the player
 * is logged in with their Steam account. When the Steam account has no
 * World of Mythos account yet, this asks once: "Play now" (pick a name, a new
 * account) or "I already have an account" (log in; the login page links the
 * Steam account to it). Renders nothing outside the Steam client. Mounted
 * once, in the root layout.
 */
export default function SteamWelcome() {
  const router = useRouter();
  const [steamName, setSteamName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [choosingName, setChoosingName] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    steamSignIn()
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'signed-in') {
          // Everything that read "not logged in" on mount picks the login up.
          window.location.reload();
        } else if (result.status === 'new') {
          setSteamName(result.steamName);
          setName((result.steamName ?? '').slice(0, NAME_MAX_LENGTH));
          setOpen(true);
        }
      })
      .catch(() => undefined); // backend unreachable: play on as a guest
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;

  const playNow = async () => {
    setBusy(true);
    setError('');
    try {
      await createSteamAccount(name.trim());
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the account.');
      setBusy(false);
    }
  };

  const haveAccount = () => {
    startSteamLink();
    setOpen(false);
    router.push('/login');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-gray-900 border border-amber-500/40 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 text-center">
        <h2 className="text-xl font-bold mb-4">World of Mythos</h2>
        {!choosingName ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setChoosingName(true)}
              className="px-4 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors cursor-pointer"
            >
              Play now
            </button>
            <button
              type="button"
              onClick={haveAccount}
              className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 font-bold hover:bg-white/20 transition-colors cursor-pointer"
            >
              I already have an account
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              type="text"
              maxLength={NAME_MAX_LENGTH}
              placeholder={steamName ?? 'Enter your name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && playNow()}
              aria-label="Name"
              autoFocus
              className="w-full p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-amber-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="button"
              onClick={playNow}
              disabled={busy || !name.trim()}
              className="px-4 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Play now'}
            </button>
            <button
              type="button"
              onClick={() => setChoosingName(false)}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 font-bold hover:bg-gray-600 transition-colors cursor-pointer"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
