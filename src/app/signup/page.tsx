'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { claimName } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  const handleSignup = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) {
      setError('Please fill in both name and email.');
      return;
    }
    setSending(true);
    try {
      const data = await claimName(trimmedName, trimmedEmail);
      if (typeof window !== 'undefined') {
        localStorage.setItem('playerName', trimmedName);
        localStorage.setItem('playerEmail', trimmedEmail);
      }
      setError('');
      if (data.pending_verification) {
        setAwaitingVerification(true);
      } else {
        router.push('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Server error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-950 to-gray-900 p-6">
      <div className="bg-gray-900 border border-white/10 p-8 rounded-xl shadow-2xl w-full max-w-md text-white">
        <h2 className="text-2xl font-bold text-center mb-6">Create User</h2>

        {awaitingVerification ? (
          <>
            <p className="text-green-400 font-semibold text-center mb-3">
              Almost there — check your inbox.
            </p>
            <p className="text-white/70 text-center mb-6">
              Click the link we sent to <strong>{email.trim()}</strong> to verify it and
              finish claiming <strong>{name.trim()}</strong>.
            </p>
            <button
              type="button"
              onClick={handleSignup}
              disabled={sending}
              className="w-full px-4 py-2 rounded-lg font-bold bg-amber-700 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Resend email'}
            </button>
            {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mb-4 p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-amber-500"
            />
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mb-6 p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-amber-500"
            />
            {error && <p className="text-red-400 mb-4 text-center">{error}</p>}
            <button
              type="button"
              onClick={handleSignup}
              disabled={sending}
              className="w-full px-4 py-2 rounded-lg font-bold bg-amber-700 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Create User'}
            </button>
          </>
        )}

        <p className="mt-4 text-center">
          <Link href="/" className="text-xl no-underline" aria-label="Back to Home">
            🏠
          </Link>
        </p>
      </div>
    </div>
  );
}
