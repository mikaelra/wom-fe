'use client';

import { useState } from 'react';
import Link from 'next/link';
import { forgotUsername } from '@/lib/api';

export default function ForgotUsernamePage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email.');
      return;
    }
    setError('');
    setSending(true);
    try {
      await forgotUsername(trimmedEmail);
      // Always show the same success state, whether or not a match was
      // found -- the backend responds identically either way.
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Server error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-6">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-gray-900">
        <h2 className="text-2xl font-bold text-center mb-6">Forgot Username</h2>

        {submitted ? (
          <p className="text-gray-700 text-center mb-4">
            If that email has any accounts, we&apos;ve sent the list to <strong>{email.trim()}</strong>.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4 text-center">
              Enter your email and we&apos;ll send you every username linked to it.
            </p>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full mb-4 p-2 border-2 border-black rounded text-gray-800"
            />
            {error && <p className="text-red-500 mb-4 text-center">{error}</p>}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={sending}
              className="w-full px-4 py-2 border-2 border-black rounded font-bold bg-gray-200 text-black cursor-pointer disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send my usernames'}
            </button>
          </>
        )}

        <div className="mt-4 flex justify-between">
          <Link href="/" className="text-blue-600 underline">
            ← Back to Home
          </Link>
          <Link href="/login" className="text-blue-600 underline">
            Back to log in
          </Link>
        </div>
      </div>
    </div>
  );
}
