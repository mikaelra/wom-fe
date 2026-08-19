'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthFlow, NAME_MAX_LENGTH } from '@/lib/useAuthFlow';

export default function LoginPage() {
  const router = useRouter();

  const authFlow = useAuthFlow({
    onAuthenticated: (name, email) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('playerName', name);
        localStorage.setItem('playerEmail', email);
      }
      router.push('/');
    },
  });

  // This page has no checkName step (it's a plain login, not join-or-create),
  // so authFlow.handleLogin's own empty-email check runs unguarded, but its
  // empty-name check doesn't exist -- Shape A/B only ever call handleLogin
  // after their own handleSubmitName step already enforced a non-empty name.
  const handleLoginClick = () => {
    if (!authFlow.name.trim()) return;
    authFlow.handleLogin();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-950 to-gray-900 p-6">
      <div className="bg-gray-900 border border-white/10 p-8 rounded-xl shadow-2xl w-full max-w-md text-white">
        <h2 className="text-2xl font-bold text-center mb-6">
          {authFlow.codeMode ? 'Enter verification code' : 'Log In'}
        </h2>

        {!authFlow.codeMode ? (
          <>
            <input
              type="text"
              maxLength={NAME_MAX_LENGTH}
              placeholder="Enter your name"
              value={authFlow.name}
              onChange={(e) => authFlow.setName(e.target.value)}
              className="w-full mb-4 p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-amber-500"
            />
            <input
              type="email"
              placeholder="Enter your email"
              value={authFlow.email}
              onChange={(e) => authFlow.setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLoginClick()}
              className="w-full mb-6 p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-amber-500"
            />
            {authFlow.emailError && <p className="text-red-400 mb-4 text-center">{authFlow.emailError}</p>}
            <button
              type="button"
              onClick={handleLoginClick}
              disabled={authFlow.loading}
              className="w-full px-4 py-2 rounded-lg font-bold bg-amber-700 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {authFlow.loading ? 'Logging in...' : 'Log In'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-white/70 mb-4">
              We sent a 6-digit code to <strong>{authFlow.email}</strong>. Enter it below
              to finish signing in.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={authFlow.code}
              onChange={(e) => authFlow.setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && authFlow.handleVerifyCode()}
              autoFocus
              className="w-full mb-4 p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 tracking-[0.3em] font-mono text-center focus:outline-none focus:border-amber-500"
            />
            {authFlow.codeError && (
              <p className="text-red-400 mb-4 text-center">{authFlow.codeError}</p>
            )}
            <button
              type="button"
              onClick={authFlow.handleVerifyCode}
              disabled={authFlow.loading}
              className="w-full px-4 py-2 rounded-lg font-bold bg-amber-700 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {authFlow.loading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={authFlow.backToEmailStep}
              disabled={authFlow.loading}
              className="w-full mt-2 px-4 py-2 rounded-lg font-bold bg-gray-700 hover:bg-gray-600 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              Back
            </button>
          </>
        )}

        <div className="mt-4 flex justify-between">
          <Link href="/" className="text-blue-400 hover:text-blue-300 underline text-xl" aria-label="Back to Home">
            🏠
          </Link>
          <Link href="/signup" className="text-blue-400 hover:text-blue-300 underline">
            Create user
          </Link>
        </div>
        <p className="mt-2 text-center">
          <Link href="/forgot_username" className="text-blue-400 hover:text-blue-300 underline text-sm">
            Forgot username?
          </Link>
        </p>
      </div>
    </div>
  );
}
