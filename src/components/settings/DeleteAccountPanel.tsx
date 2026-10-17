'use client';

import { useEffect, useState } from 'react';
import { deleteAccount, resolveAccountSession } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';

// Settings -> Delete account. App Store rule: an app that lets players make
// an account must let them delete it from inside the app. Works for every
// kind of account (email or Steam), so it keys off the session token, not
// the email the rest of the settings page needs.
//
// What the backend does (wom-be routes/account.py, docs/ACCOUNT_DELETION.md):
// inventory, sessions and email records go, the name in match history is
// replaced, purchase records stay.

type Phase = 'closed' | 'confirming' | 'deleting' | 'deleted';

export default function DeleteAccountPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<Phase>('closed');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = getStoredAccountToken();
    if (!t) return;
    setToken(t);
    resolveAccountSession(t)
      .then((s) => setName(s.name))
      .catch(() => setToken(null));
  }, []);

  if (phase === 'deleted') {
    return (
      <div className="bg-black/40 border border-white/10 rounded-xl p-6 mt-6">
        <p className="font-semibold">Your account has been deleted.</p>
      </div>
    );
  }
  if (!token || !name) return null;

  const handleDelete = async () => {
    setPhase('deleting');
    setError('');
    try {
      await deleteAccount(token, typed);
      localStorage.removeItem('playerName');
      localStorage.removeItem('playerEmail');
      setPhase('deleted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your account.');
      setPhase('confirming');
    }
  };

  return (
    <div className="bg-black/40 border border-red-900/50 rounded-xl p-6 mt-6">
      <h2 className="text-base font-semibold">Delete account</h2>
      {phase === 'closed' ? (
        <button
          type="button"
          onClick={() => setPhase('confirming')}
          className="mt-3 px-4 py-2 rounded-lg bg-red-900/60 hover:bg-red-800/70 border border-red-700/60 text-white font-semibold text-sm transition-colors cursor-pointer"
        >
          Delete account
        </button>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-white/70 leading-relaxed">
            This permanently deletes {name}: your inventory, relics, skins and
            login. Your name is removed from match history. Purchase records
            are kept for accounting. This cannot be undone.
          </p>
          <label className="block text-sm mt-4" htmlFor="delete-confirm-name">
            Type <span className="font-semibold">{name}</span> to confirm
          </label>
          <input
            id="delete-confirm-name"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="mt-2 w-full px-3 py-2 rounded-lg bg-black/50 border border-white/20 text-white"
          />
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={handleDelete}
              disabled={typed !== name || phase === 'deleting'}
              className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              {phase === 'deleting' ? 'Deleting…' : 'Delete forever'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('closed');
                setTyped('');
                setError('');
              }}
              disabled={phase === 'deleting'}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
