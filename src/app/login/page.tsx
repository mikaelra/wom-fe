'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthFlow } from '@/lib/useAuthFlow';

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-6">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-gray-900">
        <h2 className="text-2xl font-bold text-center mb-6">
          {authFlow.codeMode ? 'Enter verification code' : 'Log In'}
        </h2>

        {!authFlow.codeMode ? (
          <>
            <input
              type="text"
              placeholder="Enter your name"
              value={authFlow.name}
              onChange={(e) => authFlow.setName(e.target.value)}
              className="w-full mb-4 p-2 border-2 border-black rounded text-gray-800"
            />
            <input
              type="email"
              placeholder="Enter your email"
              value={authFlow.email}
              onChange={(e) => authFlow.setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLoginClick()}
              className="w-full mb-6 p-2 border-2 border-black rounded text-gray-800"
            />
            {authFlow.emailError && <p className="text-red-500 mb-4 text-center">{authFlow.emailError}</p>}
            <button
              type="button"
              onClick={handleLoginClick}
              disabled={authFlow.loading}
              className="w-full px-4 py-2 border-2 border-black rounded font-bold bg-gray-200 text-black cursor-pointer disabled:opacity-50"
            >
              {authFlow.loading ? 'Logging in...' : 'Log In'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700 mb-4">
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
              className="w-full mb-4 p-2 border-2 border-black rounded text-gray-800 tracking-[0.3em] font-mono text-center"
            />
            {authFlow.codeError && (
              <p className="text-red-500 mb-4 text-center">{authFlow.codeError}</p>
            )}
            <button
              type="button"
              onClick={authFlow.handleVerifyCode}
              disabled={authFlow.loading}
              className="w-full px-4 py-2 border-2 border-black rounded font-bold bg-gray-200 text-black cursor-pointer disabled:opacity-50"
            >
              {authFlow.loading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={authFlow.backToEmailStep}
              disabled={authFlow.loading}
              className="w-full mt-2 px-4 py-2 border-2 border-black rounded font-bold bg-white text-black cursor-pointer disabled:opacity-50"
            >
              Back
            </button>
          </>
        )}

        <div className="mt-4 flex justify-between">
          <Link href="/" className="text-blue-600 underline">
            ← Back to Home
          </Link>
          <Link href="/signup" className="text-blue-600 underline">
            Create user
          </Link>
        </div>
      </div>
    </div>
  );
}
