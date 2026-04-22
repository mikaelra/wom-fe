'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { confirmToggleVerifyEmail } from '@/lib/api';

type Status = 'loading' | 'success' | 'error';

function EmailVerifiedContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const [alwaysVerify, setAlwaysVerify] = useState<boolean | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (!token) {
      setStatus('error');
      setMessage('Missing confirmation token.');
      return;
    }

    confirmToggleVerifyEmail(token)
      .then((data) => {
        setStatus('success');
        setAlwaysVerify(!!data.always_verify_email);
      })
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Failed to confirm.');
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-xl mt-16">
        <h1 className="text-2xl font-bold tracking-wide mb-6">Email confirmation</h1>

        <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          {status === 'loading' && <p className="text-white/70">Confirming…</p>}

          {status === 'success' && (
            <>
              <p className="text-green-400 font-semibold mb-3">
                Verification confirmed.
              </p>
              <p className="text-white/80 mb-4">
                Always email verification is now{' '}
                <span className="font-semibold">
                  {alwaysVerify ? 'ON' : 'OFF'}
                </span>
                .
              </p>
              <Link
                href="/settings"
                className="inline-block bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold no-underline hover:bg-white/20 transition-colors"
              >
                Back to settings
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <p className="text-red-400 font-semibold mb-3">{message}</p>
              <Link
                href="/settings"
                className="inline-block bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold no-underline hover:bg-white/20 transition-colors"
              >
                Back to settings
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmailVerifiedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <EmailVerifiedContent />
    </Suspense>
  );
}
