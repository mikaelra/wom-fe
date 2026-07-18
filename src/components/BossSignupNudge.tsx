'use client';

import { useState } from 'react';
import { claimPendingRelic } from '@/lib/api';

type Props = {
  lobbyId: string;
  playerName: string;
  onDismiss: () => void;
};

export default function BossSignupNudge({ lobbyId, playerName, onDismiss }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [claimedRelicName, setClaimedRelicName] = useState<string | null>(null);
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  const handleClaim = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await claimPendingRelic(lobbyId, playerName, trimmedEmail);
      if (typeof window !== 'undefined') {
        localStorage.setItem('playerEmail', trimmedEmail);
      }
      if (result.pending_verification) {
        setAwaitingVerification(true);
      } else {
        setClaimedRelicName(result.relic_name ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-amber-500/40 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4">
        {claimedRelicName ? (
          <div className="text-center">
            <p className="text-3xl mb-3">🏺</p>
            <p className="text-green-400 font-bold text-lg mb-1">Relic claimed!</p>
            <p className="text-amber-300 text-sm mb-1">{claimedRelicName}</p>
            <p className="text-gray-400 text-sm mb-5">
              Your name is now linked to your email. Find your relics in your profile on the home page.
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : awaitingVerification ? (
          <div className="text-center">
            <p className="text-3xl mb-3">📬</p>
            <p className="text-green-400 font-bold text-lg mb-1">Check your inbox</p>
            <p className="text-gray-400 text-sm mb-5">
              Click the link we sent to <strong>{email.trim()}</strong> to verify it and
              claim your relic.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClaim}
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? 'Sending…' : 'Resend email'}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-gray-700 text-gray-300 font-bold hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Close
              </button>
            </div>
            {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
          </div>
        ) : (
          <>
            <p className="text-3xl text-center mb-3">🏺</p>
            <h2 className="text-lg font-bold text-amber-400 mb-2 text-center">
              You won a relic from the boss fight.
            </h2>
            <p className="text-sm text-gray-300 mb-4 text-center">
              Connect an email to your name and claim the relic.
            </p>
            <input
              type="email"
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleClaim(); }}
              autoFocus
              className="w-full p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/60 mb-2"
            />
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={handleClaim}
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? 'Claiming…' : 'Create account and claim relic'}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-gray-700 text-gray-300 font-bold hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                No thanks
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
