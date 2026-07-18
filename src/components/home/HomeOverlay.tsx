'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createLobby,
  joinLobby,
  getBossfightLobby,
  getPlayerRelics,
  logOut,
} from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';
import { useAuthFlow } from '@/lib/useAuthFlow';
import type { Relic } from '@/types/game';
import type { City } from '@/lib/cities';
import { useToast } from '@/components/Toast';

const buttonBase =
  'px-4 py-2 rounded-lg border-2 border-black font-bold cursor-pointer transition-colors';

interface HomeOverlayProps {
  /** If set, the overlay is shown as a City Hub for this city. */
  city?: City | null;
  /** Called when the player wants to return to the world map. */
  onBackToMap?: () => void;
}

type PendingAction =
  | { type: 'create' }
  | { type: 'join'; joinCode: string };

export default function HomeOverlay({ city, onBackToMap }: HomeOverlayProps) {
  const router = useRouter();
  const { showError } = useToast();
  const [joinCode, setJoinCode] = useState('');
  const [showRelics, setShowRelics] = useState(false);
  const [relics, setRelics] = useState<Relic[]>([]);
  const [relicsLoading, setRelicsLoading] = useState(false);

  const [loggedInName, setLoggedInName] = useState('');
  const [mounted, setMounted] = useState(false);
  const isLoggedIn = mounted && !!loggedInName;

  // Which action (create vs join) triggered the claimed-name login modal.
  // A ref, not state: handleCreate/handleJoin set this synchronously in the
  // same click handler that then calls authFlow.handleSubmitName(), whose
  // onAuthenticated closure needs to read the current value immediately --
  // a state update wouldn't be visible until the next render.
  const pendingActionRef = useRef<PendingAction | null>(null);

  const authFlow = useAuthFlow({
    submitErrorFallback: 'Failed to check name.',
    onAuthenticated: async (trimmedName, trimmedEmail) => {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      // handleSubmitName's unclaimed-name path always passes '' for email
      // (it never asked for one) -- original behavior for that path was to
      // fall back to whatever email is already on file for this browser,
      // same as handleCreate/handleJoin's own storedEmail read below.
      const email = trimmedEmail ||
        (typeof window !== 'undefined' ? localStorage.getItem('playerEmail') || '' : '');
      if (typeof window !== 'undefined') {
        localStorage.setItem('playerName', trimmedName);
        if (email) localStorage.setItem('playerEmail', email);
      }
      if (!action) return;
      if (action.type === 'create') {
        await performCreate(trimmedName, email);
      } else {
        await performJoin(trimmedName, action.joinCode, email);
      }
    },
  });

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('playerName') || '';
      authFlow.setName(stored);
      setLoggedInName(stored);
    }
    // Only ever runs once on mount -- authFlow.setName is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { secondsUntil: secondsUntilNextRaid } = useBossfightCountdown(mounted);

  const performCreate = async (trimmedName: string, email: string) => {
    const data = await createLobby(trimmedName, email);
    if (typeof window !== 'undefined') localStorage.setItem('playerName', trimmedName);
    router.push(`/lobby/${data.lobby_id}`);
  };

  const performJoin = async (trimmedName: string, code: string, email: string) => {
    await joinLobby(code, trimmedName, email);
    if (typeof window !== 'undefined') localStorage.setItem('playerName', trimmedName);
    router.push(`/lobby/${code}`);
  };

  const handleCreate = async () => {
    const trimmedName = authFlow.name.trim();
    if (!trimmedName) return;
    if (isLoggedIn) {
      const storedEmail = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') || '' : '';
      try {
        await performCreate(trimmedName, storedEmail);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Create lobby failed');
      }
      return;
    }
    pendingActionRef.current = { type: 'create' };
    authFlow.handleSubmitName();
  };

  const handleJoin = async () => {
    const trimmedName = authFlow.name.trim();
    const trimmedCode = joinCode.trim();
    if (!trimmedName || !trimmedCode) return;
    if (isLoggedIn) {
      const storedEmail = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') || '' : '';
      try {
        await performJoin(trimmedName, trimmedCode, storedEmail);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Join failed');
      }
      return;
    }
    pendingActionRef.current = { type: 'join', joinCode: trimmedCode };
    authFlow.handleSubmitName();
  };

  const handleChooseNewName = () => {
    pendingActionRef.current = null;
    authFlow.reset();
  };

  const handleEnterRaid = async () => {
    const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!playerName) {
      showError('You must be logged in to enter the raid.');
      return;
    }
    try {
      const data = await getBossfightLobby(playerName);
      router.push(`/lobby/${data.lobby_id}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to enter raid.');
    }
  };

  const fetchRelics = async () => {
    const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!playerName) return;
    setRelics([]);
    setRelicsLoading(true);
    setShowRelics(true);
    try {
      const data = await getPlayerRelics(playerName);
      setRelics(data.relics ?? []);
    } catch {
      setRelics([]);
    } finally {
      setRelicsLoading(false);
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('playerName');
      localStorage.removeItem('playerEmail');
    }
    // Fire-and-forget: logOut() clears the local credential synchronously
    // and treats the server-side revoke as best-effort, so there's nothing
    // to await or handle here.
    logOut(getStoredAccountToken());
    // State update only — a location.reload() here would tear down and
    // re-initialise the entire WebGL scene just to swap the auth buttons.
    setLoggedInName('');
    authFlow.reset();
  };

  if (!mounted) return null;

  return (
    <>
      {/* Top-left: back button + auth + relics */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-20">
        {/* Back to map button */}
        {city && onBackToMap && (
          <button
            type="button"
            onClick={onBackToMap}
            className="flex items-center gap-2 bg-black/60 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:bg-black/80 transition-colors"
          >
            <span className="text-lg leading-none">&larr;</span> Back to Map
          </button>
        )}

        {!isLoggedIn && (
          <>
            <Link
              href="/login"
              className={`${buttonBase} bg-gray-200 text-black no-underline inline-block text-center`}
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className={`${buttonBase} bg-gray-200 text-black no-underline inline-block text-center`}
            >
              Create User
            </Link>
          </>
        )}
        {isLoggedIn && (
          <>
            <div
              className={`${buttonBase} bg-gray-200 text-black cursor-default text-center`}
            >
              Logged in as: {loggedInName}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className={`${buttonBase} bg-gray-200 text-black`}
            >
              Logout
            </button>
            <button
              type="button"
              onClick={fetchRelics}
              className={`${buttonBase} bg-gray-200 text-black`}
            >
              Your relics
            </button>
          </>
        )}
      </div>

      {/* Relics modal */}
      {showRelics && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowRelics(false)}
        >
          <div
            className="bg-white text-black p-6 rounded-xl shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold mb-4">Your relics</h3>
            <ul className="list-disc pl-6 mb-4">
              {relicsLoading ? (
                <p className="text-black/60">Loading...</p>
              ) : relics.length > 0 ? (
                relics.map((relic) => (
                  <li key={String(relic.id)}>
                    <strong>{relic.name} x{relic.count}</strong>
                  </li>
                ))
              ) : (
                <p>You have no relics yet.</p>
              )}
            </ul>
            <button
              type="button"
              onClick={() => setShowRelics(false)}
              className={`${buttonBase} bg-gray-200 text-black`}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Claimed-name email login modal */}
      {authFlow.emailMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            if (!authFlow.loading) handleChooseNewName();
          }}
        >
          <div
            className="bg-white text-black p-6 rounded-xl shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 font-semibold">
              This name is claimed. Type your email if you have claimed this username.
            </p>
            <input
              type="email"
              placeholder="email"
              value={authFlow.email}
              onChange={(e) => authFlow.setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !authFlow.codeMode) authFlow.handleLogin(); }}
              autoFocus={!authFlow.codeMode}
              readOnly={authFlow.codeMode}
              className={`w-full p-2 border-2 border-black rounded text-gray-800 mb-1 ${authFlow.codeMode ? 'opacity-60 bg-gray-100' : ''}`}
            />
            <p className="text-xs text-gray-600 mb-3">email</p>
            {authFlow.emailError && !authFlow.codeMode && (
              <p className="text-red-600 mb-3 font-semibold">{authFlow.emailError}</p>
            )}

            {authFlow.codeMode && (
              <>
                <p className="text-sm text-gray-700 mb-2">
                  We sent a 6-digit code to <strong>{authFlow.email}</strong>.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={authFlow.code}
                  onChange={(e) =>
                    authFlow.setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  onKeyDown={(e) => e.key === 'Enter' && authFlow.handleVerifyCode()}
                  autoFocus
                  className="w-full p-2 border-2 border-black rounded text-gray-800 mb-1 tracking-[0.3em] font-mono text-center"
                />
                <p className="text-xs text-gray-600 mb-3">6-digit code</p>
                {authFlow.codeError && (
                  <p className="text-red-600 mb-3 font-semibold">{authFlow.codeError}</p>
                )}
              </>
            )}

            <div className="flex gap-3">
              {authFlow.codeMode ? (
                <>
                  <button
                    type="button"
                    onClick={authFlow.handleVerifyCode}
                    disabled={authFlow.loading}
                    className={`${buttonBase} flex-1 bg-gray-200 text-black disabled:opacity-50`}
                  >
                    {authFlow.loading ? 'Verifying...' : 'Verify'}
                  </button>
                  <button
                    type="button"
                    onClick={authFlow.backToEmailStep}
                    disabled={authFlow.loading}
                    className={`${buttonBase} flex-1 bg-gray-200 text-black disabled:opacity-50`}
                  >
                    Back
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={authFlow.handleLogin}
                    disabled={authFlow.loading}
                    className={`${buttonBase} flex-1 bg-gray-200 text-black disabled:opacity-50`}
                  >
                    {authFlow.loading ? 'Logging in...' : 'Log in'}
                  </button>
                  <button
                    type="button"
                    onClick={handleChooseNewName}
                    disabled={authFlow.loading}
                    className={`${buttonBase} flex-1 bg-gray-200 text-black disabled:opacity-50`}
                  >
                    Choose new name
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Center: main home content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
        <div className="pointer-events-auto flex flex-col items-center gap-4 text-white text-center">
          {/* City name banner when in a city hub */}
          {city && (
            <div className="mb-2">
              <h2
                className="text-3xl font-extrabold tracking-wide drop-shadow-lg"
                style={{ color: city.color }}
              >
                {city.name}
              </h2>
              <p className="text-sm text-white/60 mt-1">{city.tag} &mdash; {city.country}</p>
            </div>
          )}

          {secondsUntilNextRaid !== null && secondsUntilNextRaid > 0 && (
            <p className="font-bold text-lg drop-shadow-md">
              Next boss-fight in: {Math.floor(secondsUntilNextRaid / 60)}m {secondsUntilNextRaid % 60}s
            </p>
          )}

          {!isLoggedIn && (
            <>
              <input
                type="text"
                placeholder="Enter your name"
                value={authFlow.name}
                onChange={(e) => authFlow.setName(e.target.value)}
                className="w-64 p-2 rounded-l-md bg-gray-200 text-gray-800 border-2 border-black focus:outline-none"
              />
              {authFlow.error && !authFlow.emailMode && (
                <p className="text-red-400 text-sm font-semibold drop-shadow-md">{authFlow.error}</p>
              )}
            </>
          )}

          <div className="flex items-center gap-2 flex-wrap justify-center">
            <input
              type="text"
              placeholder="Lobby code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-40 p-2 rounded-md bg-gray-200 text-gray-800 border-2 border-black focus:outline-none"
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={joinCode.trim().length < 3}
              className={`${buttonBase} bg-gray-200 text-black disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Join
            </button>
          </div>

          <button
            type="button"
            onClick={handleCreate}
            className={`${buttonBase} bg-gray-200 text-black`}
          >
            Create Lobby
          </button>

          <button
            type="button"
            onClick={handleEnterRaid}
            className="text-2xl bg-transparent border-none cursor-pointer underline mt-2"
            style={{ color: 'gold' }}
          >
            Enter Boss-fight
          </button>

          <div className="flex flex-col gap-2 mt-4">
            <Link href="/rules" className="text-xl underline" style={{ color: 'yellow' }}>
              Rules
            </Link>
            <Link href="/rules/p1" className="text-xl underline" style={{ color: 'lightgreen' }}>
              Rules For Nerds
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
