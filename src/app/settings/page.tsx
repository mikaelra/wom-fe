'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAlwaysVerifyEmailFlag, requestToggleVerifyEmail } from '@/lib/api';
import { useGuideEnabled } from '@/lib/useGuideEnabled';

const ALWAYS_VERIFY_EXPLANATION =
  "When this is on, every time you log in to World of Mythos from any device " +
  "we will send a one-time verification code to your registered email. You " +
  "will need to enter that code before your session is activated, even if " +
  "you have already used this browser before.";

export default function SettingsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');

  const { enabled: guideEnabled, setEnabled: setGuideEnabled } = useGuideEnabled();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // The value currently stored on the server.
  const [serverValue, setServerValue] = useState(false);
  // The value the user has clicked toward (pending email confirmation).
  const [checked, setChecked] = useState(false);

  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const name = localStorage.getItem('playerName') || '';
    const email = localStorage.getItem('playerEmail') || '';
    setPlayerName(name);
    setPlayerEmail(email);

    if (!name || !email) {
      setLoading(false);
      setLoadError('You must be logged in to view settings.');
      return;
    }

    getAlwaysVerifyEmailFlag(name, email)
      .then((data) => {
        setServerValue(!!data.always_verify_email);
        setChecked(!!data.always_verify_email);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load settings.');
      })
      .finally(() => setLoading(false));
  }, []);

  if (!mounted) return null;

  const sendToggleEmail = async (next: boolean) => {
    if (!playerName || !playerEmail) {
      setSendError('You must be logged in to change settings.');
      return;
    }
    setSending(true);
    setSendError('');
    try {
      await requestToggleVerifyEmail(playerName, playerEmail, next);
      setAwaitingEmail(true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send email.');
      setChecked(serverValue);
      setAwaitingEmail(false);
    } finally {
      setSending(false);
    }
  };

  const handleBoxClick = () => {
    if (sending || loading || awaitingEmail) return;
    const next = !serverValue;
    setChecked(next);
    sendToggleEmail(next);
  };

  const handleResend = () => {
    if (sending) return;
    sendToggleEmail(checked);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-wide">Settings</h1>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-white/20 transition-colors cursor-pointer"
          >
            ← Back to Home
          </button>
        </div>

        {loading ? (
          <p className="text-white/70">Loading…</p>
        ) : loadError ? (
          <div className="bg-black/40 border border-white/10 rounded-xl p-5">
            <p className="text-red-400 mb-3">{loadError}</p>
            <Link
              href="/login"
              className="bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold no-underline hover:bg-white/20 transition-colors"
            >
              Go to log in
            </Link>
          </div>
        ) : (
          <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked}
                onChange={handleBoxClick}
                disabled={sending || awaitingEmail}
                className="w-5 h-5 accent-amber-500 cursor-pointer"
              />
              <span className="text-base font-semibold">
                Toggle always e-mail verificiation.
              </span>
            </label>

            <p className="text-sm text-white/70 mt-3 leading-relaxed">
              {ALWAYS_VERIFY_EXPLANATION}
            </p>

            {awaitingEmail && (
              <div className="mt-5">
                <p className="text-orange-400 font-semibold mb-3">
                  Click the link sent to your email to confirm this verification
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={sending}
                    className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-white font-semibold text-sm transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {sending ? 'Sending…' : 'Resend email'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={sending}
                    className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 border border-white/10 text-white font-semibold text-sm transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Refresh page
                  </button>
                </div>
                {sendError && (
                  <p className="text-red-400 text-sm mt-3">{sendError}</p>
                )}
              </div>
            )}

            {!awaitingEmail && sendError && (
              <p className="text-red-400 text-sm mt-5">{sendError}</p>
            )}
          </div>
        )}

        <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 mt-6">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={guideEnabled}
              onChange={() => setGuideEnabled(!guideEnabled)}
              className="w-5 h-5 accent-amber-500 cursor-pointer"
            />
            <span className="text-base font-semibold">
              Show the in-game welcome tour
            </span>
          </label>
          <p className="text-sm text-white/70 mt-3 leading-relaxed">
            A short guided tour appears when a game starts, with tips pointing at the
            health, action and resource buttons and The Well. You can also turn it off from
            inside the tour.
          </p>
        </div>
      </div>
    </div>
  );
}
