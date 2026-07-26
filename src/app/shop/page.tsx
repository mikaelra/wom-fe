'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { claimName, getShopProducts, postCheckout, resolveAccountSession, type ShopProduct } from '@/lib/api';
import { ApiError, getStoredAccountToken } from '@/lib/http';
import { useClaimVerificationPoll } from '@/lib/useClaimVerificationPoll';
import { skinLabel, skinUrl } from '@/lib/frogSkins';
import SpinningModelViewer from '@/components/SpinningModelViewer';

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(
      cents / 100
    );
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

// Trims trailing zeros (63.00 -> 63) while still showing real precision where
// it matters (6.67, 0.33) -- .toFixed(2) alone would show "63.00%" for a
// round number, which reads oddly next to "6.67%".
function formatOddsPercent(probability: number): string {
  return `${Number((probability * 100).toFixed(2))}%`;
}

type VerifyState = 'idle' | 'sending' | 'awaiting' | 'error';

export default function ShopPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [shopEnabled, setShopEnabled] = useState(false);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [productErrors, setProductErrors] = useState<Record<string, string>>({});
  const [duplicateConfirm, setDuplicateConfirm] = useState<Set<string>>(new Set());
  const [oddsInfoOpen, setOddsInfoOpen] = useState<Set<string>>(new Set());
  // Multi-packs are wheel-only (§3.3) -- matches routes/shop.py's
  // _MAX_WHEEL_QUANTITY; a direct skin purchase has no quantity concept.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const MAX_WHEEL_QUANTITY = 100;

  const adjustQuantity = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[productId] ?? 1;
      const next = Math.min(MAX_WHEEL_QUANTITY, Math.max(1, current + delta));
      return { ...prev, [productId]: next };
    });
  };

  const toggleOddsInfo = (productId: string) => {
    setOddsInfoOpen((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [verifyName, setVerifyName] = useState('');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyError, setVerifyError] = useState('');
  // The product Buy was originally clicked on -- shown in the verification
  // gate's copy so it's clear what re-clicking Buy afterward will do.
  const [pendingProduct, setPendingProduct] = useState<ShopProduct | null>(null);

  useEffect(() => {
    setMounted(true);
    setLoggedIn(!!getStoredAccountToken());
    getShopProducts()
      .then((data) => {
        setShopEnabled(data.shop_enabled);
        setProducts(data.products);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : 'Failed to load the shop.');
      })
      .finally(() => setLoading(false));
  }, []);

  useClaimVerificationPoll(verifyState === 'awaiting', verifyName, verifyEmail, () => {
    setVerifyState('idle');
    setPendingProduct(null);
  });

  const openVerificationGate = async (product: ShopProduct) => {
    const token = getStoredAccountToken();
    if (!token) {
      router.push('/login');
      return;
    }
    setPendingProduct(product);
    setVerifyState('sending');
    setVerifyError('');
    try {
      const session = await resolveAccountSession(token);
      if (!session.email) {
        setVerifyError('Your account has no email on file. Please log in again.');
        setVerifyState('error');
        return;
      }
      setVerifyName(session.name);
      setVerifyEmail(session.email);
      // claimName is idempotent for an existing, unverified (name, email) --
      // it (re)sends the verification link rather than erroring (see
      // routes/auth.py's claim_name).
      await claimName(session.name, session.email);
      setVerifyState('awaiting');
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : 'Failed to send verification email.');
      setVerifyState('error');
    }
  };

  const handleBuy = async (product: ShopProduct, confirmDuplicate = false) => {
    const token = getStoredAccountToken();
    if (!token) {
      router.push('/login');
      return;
    }
    setProductErrors((prev) => ({ ...prev, [product.id]: '' }));
    setBuying(product.id);
    try {
      const quantity = product.kind === 'wheel' ? (quantities[product.id] ?? 1) : undefined;
      const { checkout_url } = await postCheckout(token, product.id, confirmDuplicate, quantity);
      window.location.href = checkout_url;
      // No finally-reset of `buying` on this path -- the page is navigating
      // away, and leaving the button in its loading state avoids a flash
      // of "Buy" reappearing right before the redirect happens.
    } catch (e) {
      setBuying(null);
      if (e instanceof ApiError) {
        if (e.code === 'email_unverified') {
          openVerificationGate(product);
          return;
        }
        if (e.code === 'already_owned') {
          setDuplicateConfirm((prev) => new Set(prev).add(product.id));
          return;
        }
        if (e.code === 'region_blocked') {
          setProductErrors((prev) => ({
            ...prev,
            [product.id]: 'This item is not available for purchase in your region.',
          }));
          return;
        }
      }
      setProductErrors((prev) => ({
        ...prev,
        [product.id]: e instanceof Error ? e.message : 'Something went wrong.',
      }));
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-wide">Shop</h1>
          <Link
            href="/"
            className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-white/20 transition-colors no-underline"
          >
            ← Back to Home
          </Link>
        </div>

        {loading ? (
          <p className="text-white/70">Loading…</p>
        ) : loadError ? (
          <div className="bg-black/40 border border-white/10 rounded-xl p-5">
            <p className="text-red-400">{loadError}</p>
          </div>
        ) : !shopEnabled ? (
          <div className="bg-black/40 border border-white/10 rounded-xl p-5">
            <p className="text-white/70">The shop isn&apos;t open yet — check back soon.</p>
          </div>
        ) : (
          <>
            <label className="flex items-start gap-2 bg-black/40 border border-white/10 rounded-xl p-4 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm text-white/70">
                I am 18 or older (or have guardian consent) and agree to the{' '}
                <Link href="/terms" target="_blank" className="text-amber-300 underline hover:text-amber-200">
                  Terms
                </Link>{' '}
                and{' '}
                <Link href="/refunds" target="_blank" className="text-amber-300 underline hover:text-amber-200">
                  Refund Policy
                </Link>
                .
              </span>
            </label>

            <div className="flex flex-col gap-6">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">
                      {product.kind === 'skin' ? `${product.name} skin` : product.name}
                    </h2>
                    <span className="text-amber-300 font-bold text-lg">
                      {formatPrice(
                        product.price_cents * (product.kind === 'wheel' ? (quantities[product.id] ?? 1) : 1),
                        product.currency
                      )}
                    </span>
                  </div>

                  {product.kind === 'wheel' && product.odds && (
                    <div className="mb-4">
                      <div className="flex justify-center py-4" aria-hidden="true">
                        <span className="text-5xl">🎡</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <p className="text-xs text-white/50 flex-1">
                          Buy a special wheel and roll it to get a special skin
                        </p>
                        <button
                          type="button"
                          onClick={() => toggleOddsInfo(product.id)}
                          aria-label="Wheel odds info"
                          aria-expanded={oddsInfoOpen.has(product.id)}
                          className="shrink-0 w-4 h-4 rounded-full border border-white/30 text-white/60 text-[10px] leading-none flex items-center justify-center hover:bg-white/10 hover:text-white cursor-pointer"
                        >
                          i
                        </button>
                      </div>
                      {oddsInfoOpen.has(product.id) && (
                        <div className="mt-2 text-xs text-white/60 bg-white/5 border border-white/10 rounded-lg p-3">
                          <p className="mb-1">
                            You get a random skin when rolling the wheel. The odds for getting each skin is:
                          </p>
                          {product.odds.map((entry) => (
                            <p key={entry.skin} className="capitalize">
                              {skinLabel(entry.skin)} - {formatOddsPercent(entry.probability)}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {product.kind === 'skin' && product.skin && (
                    <div className="mb-4 w-32 h-32 mx-auto">
                      <SpinningModelViewer url={skinUrl(product.skin)} targetSize={1.8} spinSpeed={0.6} />
                    </div>
                  )}

                  {productErrors[product.id] && (
                    <p className="text-red-400 text-sm mb-2">{productErrors[product.id]}</p>
                  )}

                  {duplicateConfirm.has(product.id) ? (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-white/70 flex-1">
                        You already own this. Buy another copy anyway?
                      </p>
                      <button
                        type="button"
                        disabled={!agreed || buying === product.id}
                        onClick={() => handleBuy(product, true)}
                        className="px-4 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {buying === product.id ? 'Confirming…' : 'Buy anyway'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDuplicateConfirm((prev) => {
                            const next = new Set(prev);
                            next.delete(product.id);
                            return next;
                          })
                        }
                        className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : !loggedIn ? (
                    <Link
                      href="/login"
                      className="block w-full text-center px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white font-bold hover:bg-white/20 transition-colors no-underline"
                    >
                      Log in to buy
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3">
                      {product.kind === 'wheel' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => adjustQuantity(product.id, -1)}
                            disabled={(quantities[product.id] ?? 1) <= 1}
                            aria-label="Decrease quantity"
                            className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-semibold" aria-label="Quantity">
                            {quantities[product.id] ?? 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustQuantity(product.id, 1)}
                            disabled={(quantities[product.id] ?? 1) >= MAX_WHEEL_QUANTITY}
                            aria-label="Increase quantity"
                            className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={!agreed || buying === product.id}
                        onClick={() => handleBuy(product)}
                        className="flex-1 px-4 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {buying === product.id ? 'Starting checkout…' : 'Buy'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {pendingProduct && verifyState !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-amber-500/40 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 text-center">
            {verifyState === 'error' ? (
              <>
                <p className="text-red-400 font-semibold mb-4">{verifyError}</p>
                <button
                  type="button"
                  onClick={() => setPendingProduct(null)}
                  className="px-5 py-2 rounded-lg bg-gray-700 text-gray-300 font-bold hover:bg-gray-600 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </>
            ) : verifyState === 'sending' ? (
              <p className="text-white/70">Sending verification email…</p>
            ) : (
              <>
                <p className="text-3xl mb-3">📬</p>
                <p className="text-green-400 font-bold text-lg mb-1">Check your inbox</p>
                <p className="text-gray-400 text-sm mb-5">
                  Click the link we sent to <strong>{verifyEmail}</strong> to verify your email,
                  then buy {pendingProduct.name} again.
                </p>
                <button
                  type="button"
                  onClick={() => setPendingProduct(null)}
                  className="px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
