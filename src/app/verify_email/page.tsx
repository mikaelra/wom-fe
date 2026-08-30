'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { confirmEmailVerification } from '@/lib/api';
import { useToast } from '@/components/Toast';

type Status = 'loading' | 'error';

function VerifyEmailContent() {
  const router = useRouter();
  const { showSuccess } = useToast();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (!token) {
      setStatus('error');
      setMessage('Missing confirmation token.');
      return;
    }

    confirmEmailVerification(token)
      .then((data) => {
        // None of these purposes has any other status the user is
        // watching on this standalone page -- send them on with the
        // confirmation as a toast instead of stranding them here behind a
        // click. A claimed Wheel goes to /inventory (where it can be
        // spun); everything else goes home.
        if (data.purpose === 'claim_wheel') {
          showSuccess('Wheel verified! Spin it in your inventory.');
          router.replace('/inventory');
          return;
        }
        showSuccess(
          data.purpose === 'claim_relic'
            ? `Relic claimed: ${data.relic_name ?? 'relic'}`
            : 'Account verified'
        );
        router.replace('/');
      })
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Failed to confirm.');
      });
  }, [token, router, showSuccess]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-xl mt-16">
        <h1 className="text-2xl font-bold tracking-wide mb-6">Email verification</h1>

        <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          {status === 'loading' && <p className="text-white/70">Confirming…</p>}

          {status === 'error' && (
            <>
              <p className="text-red-400 font-semibold mb-3">{message}</p>
              <Link
                href="/"
                className="inline-block bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-lg font-semibold no-underline hover:bg-white/20 transition-colors"
                aria-label="Back to Home"
              >
                🌍
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
