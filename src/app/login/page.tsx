'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logInUser, verifyLoginCode } from '@/lib/api';

export default function LoginPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  const router = useRouter();

  const finishLogin = (trimmedName: string, trimmedEmail: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('playerName', trimmedName);
      localStorage.setItem('playerEmail', trimmedEmail);
    }
    router.push('/');
  };

  const handleLogin = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) {
      setError('Please fill in both name and email.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await logInUser(trimmedName, trimmedEmail);
      if (result.requires_code) {
        setNeedsCode(true);
        setCode('');
        setCodeError('');
        return;
      }
      finishLogin(trimmedName, trimmedEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setCodeError('Please enter the code from your email.');
      return;
    }
    setCodeError('');
    setLoading(true);
    try {
      await verifyLoginCode(name.trim(), trimmedCode);
      finishLogin(name.trim(), email.trim());
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-6">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-gray-900">
        <h2 className="text-2xl font-bold text-center mb-6">
          {needsCode ? 'Enter verification code' : 'Log In'}
        </h2>

        {!needsCode ? (
          <>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mb-4 p-2 border-2 border-black rounded text-gray-800"
            />
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full mb-6 p-2 border-2 border-black rounded text-gray-800"
            />
            {error && <p className="text-red-500 mb-4 text-center">{error}</p>}
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full px-4 py-2 border-2 border-black rounded font-bold bg-gray-200 text-black cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700 mb-4">
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below
              to finish signing in.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              autoFocus
              className="w-full mb-4 p-2 border-2 border-black rounded text-gray-800 tracking-[0.3em] font-mono text-center"
            />
            {codeError && (
              <p className="text-red-500 mb-4 text-center">{codeError}</p>
            )}
            <button
              type="button"
              onClick={handleVerify}
              disabled={loading}
              className="w-full px-4 py-2 border-2 border-black rounded font-bold bg-gray-200 text-black cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => {
                setNeedsCode(false);
                setCode('');
                setCodeError('');
              }}
              disabled={loading}
              className="w-full mt-2 px-4 py-2 border-2 border-black rounded font-bold bg-white text-black cursor-pointer disabled:opacity-50"
            >
              Back
            </button>
          </>
        )}

        <p className="mt-4 text-center">
          <Link href="/" className="text-blue-600 underline">
            ← Back to Home
          </Link>
        </p>
      </div>
    </div>
  );
}
