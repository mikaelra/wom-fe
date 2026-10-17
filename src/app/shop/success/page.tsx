'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getOrderStatus } from '@/lib/api';
import { SUPPORT_EMAIL } from '@/config';
import { getStoredAccountToken } from '@/lib/http';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

// Fulfillment can occasionally take well beyond 30s, so rather than
// stacking reassurance lines (which runs out of new things to say), the
// single line under the main message rotates through these every 10s
// for as long as polling continues.
const REASSURANCE_TEXTS = ['Almost there…', 'So close…', 'Any second now…'] as const;
const REASSURANCE_INTERVAL_MS = 10_000;

type Status = 'polling' | 'received' | 'timeout' | 'error';

// The redirect here grants nothing -- it's cosmetic and forgeable
// (docs/MONETIZATION_PLAN.md §6.3 step 2). Only the signature-verified
// webhook actually fulfills the order; this page just polls the order's
// own status until it flips to `fulfilled`, or admits after a minute
// that it's taking longer than usual (never that the payment failed --
// it didn't, the webhook is just slow).
//
// It used to diff /inventory instead, which had two bugs: an ai_credits
// purchase never moved a skin or wheel count so it *always* ran to the
// full timeout, and even for skins/wheels the baseline was captured on
// arrival -- if the webhook won the race (common) the grant was already
// in the baseline and no change was ever seen.
function ShopSuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order');
  const [status, setStatus] = useState<Status>('polling');
  const [error, setError] = useState('');
  const [product, setProduct] = useState<string | null>(null);
  const [reassuranceIndex, setReassuranceIndex] = useState<number | null>(null);

  useEffect(() => {
    if (status !== 'polling') return;
    const interval = setInterval(() => {
      setReassuranceIndex((prev) => (prev === null ? 0 : (prev + 1) % REASSURANCE_TEXTS.length));
    }, REASSURANCE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const token = getStoredAccountToken();
    if (!token) {
      setStatus('error');
      setError('You must be logged in to check on your purchase.');
      return;
    }
    if (!orderId) {
      // Landed here without an order ref (direct navigation) -- nothing to
      // poll; point at the inventory / support the same way a timeout does.
      setStatus('timeout');
      return;
    }

    let cancelled = false;
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const res = await getOrderStatus(token, orderId);
        if (!cancelled) setProduct(res.product);
        if (res.fulfilled) {
          if (!cancelled) setStatus('received');
          return;
        }
      } catch {
        // Transient network hiccup, or the order row not visible yet --
        // keep polling until the timeout.
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setStatus('timeout');
        return;
      }
      timeoutHandle = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutHandle);
    };
  }, [orderId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center justify-center text-center">
      <div className="w-full max-w-sm bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6">
        {status === 'polling' && (
          <>
            <p className="text-3xl mb-3">⏳</p>
            <p className="text-white/70">
              Confirming your payment
              <span aria-hidden="true">
                <span className="ellipsis-dot">.</span>
                <span className="ellipsis-dot">.</span>
                <span className="ellipsis-dot">.</span>
              </span>
              <span className="sr-only">…</span>
            </p>
            {reassuranceIndex !== null && (
              <p className="text-white/50 text-sm mt-2">{REASSURANCE_TEXTS[reassuranceIndex]}</p>
            )}
          </>
        )}
        {status === 'received' && (
          <>
            <p className="text-3xl mb-3">🎉</p>
            <p className="text-green-400 font-bold text-lg mb-1">Payment received!</p>
            {product === 'ai_credits' ? (
              <>
                <p className="text-white/70 text-sm mb-5">Your credits are on your account.</p>
                <Link
                  href="/my-ai"
                  className="inline-block px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors no-underline"
                >
                  Go to My AI
                </Link>
              </>
            ) : (
              <>
                <p className="text-white/70 text-sm mb-5">Your item is in your inventory.</p>
                <Link
                  href="/inventory"
                  className="inline-block px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors no-underline"
                >
                  Go to Inventory
                </Link>
              </>
            )}
          </>
        )}
        {status === 'timeout' && (
          <>
            <p className="text-3xl mb-3">📬</p>
            <p className="text-white/70 mb-2">
              Payment received. If it hasn&apos;t landed in a few minutes, contact{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-300 underline hover:text-amber-200">
                {SUPPORT_EMAIL}
              </a>
              {orderId ? ` with order #${orderId}` : ''}.
            </p>
            <Link
              href={product === 'ai_credits' ? '/my-ai' : '/inventory'}
              className="inline-block px-5 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-colors no-underline mt-2"
            >
              {product === 'ai_credits' ? 'Go to My AI' : 'Check Inventory'}
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-red-400 mb-4">{error}</p>
            <Link
              href="/login"
              className="inline-block px-5 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-colors no-underline"
            >
              Go to log in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function ShopSuccessPage() {
  return (
    <Suspense fallback={null}>
      <ShopSuccessContent />
    </Suspense>
  );
}
