'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createLobby, joinLobby, logOut } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { useAuthFlow, NAME_MAX_LENGTH } from '@/lib/useAuthFlow';
import { subscribe } from '@/lib/socket';
import RopedButton from '@/components/hud/RopedButton';
import RopedInput from '@/components/hud/RopedInput';
import RulesModal from '@/components/lobby/RulesModal';
import { useToast } from '@/components/Toast';

export default function WorldMapOverlay() {
  const router = useRouter();
  const { showError } = useToast();
  const [loggedInName, setLoggedInName] = useState('');
  const [mounted, setMounted] = useState(false);

  const [joinCode, setJoinCode] = useState('');
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'join' | 'create' | null>(null);
  const [showNamePopup, setShowNamePopup] = useState(false);
  const [pendingAction, setPendingAction] = useState<'join' | 'create' | null>(null);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Undefined (not 0) until the first broadcast arrives -- distinguishes
  // "nobody's told us yet" from "genuinely zero players online" so the
  // count doesn't flash a misleading 0 on first paint.
  const [onlineCount, setOnlineCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setLoggedInName(localStorage.getItem('playerName') || '');
    }
  }, []);

  useEffect(() => {
    return subscribe('online_count', ({ count }) => setOnlineCount(count));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    // re-initialise the entire WebGL scene just to swap the top-bar button.
    setLoggedInName('');
    setShowUserMenu(false);
  };

  const doJoin = async (name: string) => {
    const code = joinCode.trim();
    if (!code) return;
    const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') || '' : '';
    setLobbyLoading(true);
    setLoadingAction('join');
    try {
      await joinLobby(code, name, email);
      if (typeof window !== 'undefined') localStorage.setItem('playerName', name);
      router.push(`/lobby/${code}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Join failed');
      setLobbyLoading(false);
      setLoadingAction(null);
    }
  };

  const doCreate = async (name: string) => {
    const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') || '' : '';
    setLobbyLoading(true);
    setLoadingAction('create');
    try {
      const data = await createLobby(name, email);
      if (typeof window !== 'undefined') localStorage.setItem('playerName', name);
      router.push(`/lobby/${data.lobby_id}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Create lobby failed');
      setLobbyLoading(false);
      setLoadingAction(null);
    }
  };

  const authFlow = useAuthFlow({
    submitErrorFallback: 'Something went wrong.',
    onAuthenticated: async (trimmedName, trimmedEmail) => {
      // The unclaimed-name path (trimmedEmail === '') leaves localStorage to
      // doJoin/doCreate's own post-success write, same as before; only the
      // login/code path needs the pre-write here, since doJoin/doCreate read
      // playerEmail back out of localStorage themselves rather than taking
      // it as a parameter.
      if (trimmedEmail && typeof window !== 'undefined') {
        localStorage.setItem('playerName', trimmedName);
        localStorage.setItem('playerEmail', trimmedEmail);
      }
      setShowNamePopup(false);
      if (pendingAction === 'join') {
        await doJoin(trimmedName);
      } else {
        await doCreate(trimmedName);
      }
    },
  });

  if (!mounted) return null;

  const isLoggedIn = !!loggedInName;

  const openNamePopup = (action: 'join' | 'create') => {
    setPendingAction(action);
    authFlow.reset();
    setShowNamePopup(true);
  };

  const handleJoinLobby = () => {
    const name = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!name) {
      openNamePopup('join');
      return;
    }
    doJoin(name);
  };

  const handleCreateLobby = () => {
    const name = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!name) {
      openNamePopup('create');
      return;
    }
    doCreate(name);
  };

  return (
    <>
      {/* Top bar -- left and right groups are independently pinned to their
          own corner (not one flex row with justify-between) so that if one
          side wraps/shrinks on a narrow phone, it can never bump the other
          side out of position. justify-between only distributes items
          within a shared row; once wrapping split them onto separate rows,
          the lone item left on its own row collapsed to that row's start
          instead of staying pinned right. */}
      <div
        className="absolute top-0 left-0 z-20 px-3 pointer-events-none"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <div className="pointer-events-auto">
          <RopedButton
            // 163 -- same exact-fit width as the user-menu chip (see its own
            // comment): rope_button-ld-v2.png's natural size is 595x197
            // (~3.02:1), and 163 is the exact width at which it fills a
            // 54px-tall box edge-to-edge, so every RopedButton in this top
            // bar reads as the same consistent chip size.
            width={163}
            height={54}
            onClick={() => setShowRules(true)}
            ariaLabel="Rules"
          >
            Rules
          </RopedButton>
        </div>
      </div>
      <div
        // The bottom lobby-controls row (below) is centered, not edge-anchored
        // -- "Join Lobby"'s right edge sits at a fixed offset from center:
        // RopedInput(184) + RopedButton(168), no gap between them = 352px
        // total, so its right edge is 176px right of center, i.e. inset
        // (50% - 176px) from the viewport's right edge. On a narrow phone,
        // lining this chip's right edge up with that reads as one aligned
        // column; on a wide desktop viewport that offset would be huge
        // (Join Lobby stays near center while the screen keeps growing), so
        // from `sm` up this instead just hugs the real edge like the rest of
        // the top bar always did.
        className="absolute top-0 right-[calc(50%-176px)] sm:right-3 z-20 pointer-events-none"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        {/* Right: player info */}
        <div className="pointer-events-auto flex items-center gap-3">
          {!isLoggedIn && (
            <RopedButton
              width={153}
              height={54}
              onClick={() => router.push('/login')}
              ariaLabel="Log in"
            >
              Log in
            </RopedButton>
          )}
          {isLoggedIn && (
            <div className="relative" ref={userMenuRef}>
              <RopedButton
                // rope_button-ld-v2.png's natural size is 595x197 (~3.02:1).
                // object-contain fits by height whenever the box is wider
                // than that ratio, so any width above ~163 (595/197*54)
                // just letterboxes -- empty transparent margin on both
                // sides of the art, with the box's true edges landing well
                // outside the visibly drawn rope frame. 163 is the exact
                // width at which the art fills the box edge-to-edge, so
                // this chip's visible right edge lines up precisely with
                // Join Lobby's (see the `right` calc below) instead of
                // sitting inside a padded box that only *measures* aligned.
                width={163}
                height={54}
                onClick={() => setShowUserMenu((v) => !v)}
                ariaLabel="Open user menu"
                textClassName="flex items-center gap-2 text-white font-semibold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              >
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xs font-bold text-black">
                  {loggedInName[0]?.toUpperCase()}
                </span>
                <span>{loggedInName}</span>
                <span className="text-white/70 text-xs">{showUserMenu ? '▲' : '▼'}</span>
              </RopedButton>
              {showUserMenu && (
                <div className="absolute right-0 mt-1 w-40 bg-gray-900 border border-white/20 rounded-lg shadow-xl overflow-hidden">
                  <Link
                    href="/stats"
                    onClick={() => setShowUserMenu(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer no-underline"
                  >
                    Stats
                  </Link>
                  <Link
                    href="/inventory"
                    onClick={() => setShowUserMenu(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer no-underline"
                  >
                    Inventory
                  </Link>
                  <Link
                    href="/shop"
                    onClick={() => setShowUserMenu(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer no-underline"
                  >
                    Shop
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer no-underline"
                  >
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Center title */}
      <div className="absolute top-16 left-0 right-0 z-10 flex flex-col items-center gap-1 pointer-events-none">
        <h1 className="text-white/80 text-lg font-light tracking-[0.3em] uppercase drop-shadow-lg">
          World of Mythos
        </h1>

        {/* Ranked queueing itself now lives on the New York sword marker
            (see CityMarker's rankedInfo) -- this is just the player count. */}
        {onlineCount != null && onlineCount > 0 && (
          <span className="text-white/70 text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {onlineCount} playing right now
          </span>
        )}
      </div>

      {/* Bottom: lobby controls */}
      <div className="absolute bottom-8 left-0 right-0 z-20 flex flex-col items-center gap-2 pointer-events-none">
        <form
          className="pointer-events-auto flex flex-wrap justify-center items-center px-3"
          onSubmit={(e) => { e.preventDefault(); handleJoinLobby(); }}
        >
          <RopedInput width={184} height={54} innerPadding="8px 11px">
            <input
              type="text"
              placeholder="Enter lobby code..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              style={{ width: '95%' }}
              className="h-full bg-transparent text-white placeholder-white/70 focus:outline-none text-sm font-semibold text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            />
          </RopedInput>
          <span>
            <RopedButton
              width={168}
              height={54}
              onClick={handleJoinLobby}
              disabled={lobbyLoading && loadingAction !== 'join'}
              loading={lobbyLoading && loadingAction === 'join'}
              ariaLabel="Join lobby"
            >
              Join Lobby
            </RopedButton>
          </span>
        </form>
        <div className="pointer-events-auto flex justify-center">
          <RopedButton
            width={249}
            height={54}
            onClick={handleCreateLobby}
            disabled={lobbyLoading && loadingAction !== 'create'}
            loading={lobbyLoading && loadingAction === 'create'}
            ariaLabel="Create lobby"
          >
            Create Lobby
          </RopedButton>
        </div>
      </div>

      {/* Name popup — shown when not logged in */}
      {showNamePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => { if (!authFlow.loading) setShowNamePopup(false); }}
        >
          <div
            className="bg-gray-900 border border-white/20 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-1 text-white">Choose a name</h2>
            <p className="text-sm text-white/60 mb-4">
              Pick a battle name before you{' '}
              {pendingAction === 'join' ? 'join' : 'create'} a lobby.
            </p>
            <input
              type="text"
              maxLength={NAME_MAX_LENGTH}
              placeholder="Your battle name"
              value={authFlow.name}
              onChange={(e) => authFlow.setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (authFlow.codeMode) authFlow.handleVerifyCode();
                else if (authFlow.emailMode) authFlow.handleLogin();
                else authFlow.handleSubmitName();
              }}
              autoFocus={!authFlow.emailMode && !authFlow.codeMode}
              readOnly={authFlow.emailMode || authFlow.codeMode}
              className={`w-full p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-white/50 mb-3 ${authFlow.emailMode || authFlow.codeMode ? 'opacity-70' : ''}`}
            />
            {authFlow.error && !authFlow.emailMode && !authFlow.codeMode && (
              <p className="text-red-400 text-sm mb-3">{authFlow.error}</p>
            )}

            {authFlow.emailMode && (
              <>
                <p className="text-sm text-white/80 mb-2">
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
                  className={`w-full p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-white/50 mb-1 ${authFlow.codeMode ? 'opacity-60' : ''}`}
                />
                <p className="text-xs text-white/50 mb-3">email</p>
                {authFlow.emailError && !authFlow.codeMode && (
                  <p className="text-red-500 text-sm mb-3 font-semibold">{authFlow.emailError}</p>
                )}
              </>
            )}

            {authFlow.codeMode && (
              <>
                <p className="text-sm text-white/80 mb-2">
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
                  className="w-full p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-white/50 mb-1 tracking-[0.3em] font-mono text-center"
                />
                <p className="text-xs text-white/50 mb-3">6-digit code</p>
                {authFlow.codeError && (
                  <p className="text-red-500 text-sm mb-3 font-semibold">{authFlow.codeError}</p>
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
                    className="flex-1 py-2 rounded-lg bg-white/20 hover:bg-white/30 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {authFlow.loading ? 'Verifying...' : 'Verify'}
                  </button>
                  <button
                    type="button"
                    onClick={authFlow.backToEmailStep}
                    disabled={authFlow.loading}
                    className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Back
                  </button>
                </>
              ) : authFlow.emailMode ? (
                <>
                  <button
                    type="button"
                    onClick={authFlow.handleLogin}
                    disabled={authFlow.loading}
                    className="flex-1 py-2 rounded-lg bg-white/20 hover:bg-white/30 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {authFlow.loading ? 'Logging in...' : 'Log in'}
                  </button>
                  <button
                    type="button"
                    onClick={authFlow.reset}
                    disabled={authFlow.loading}
                    className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Choose new name
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={authFlow.handleSubmitName}
                    disabled={authFlow.loading}
                    className="flex-1 py-2 rounded-lg bg-white/20 hover:bg-white/30 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {authFlow.loading ? 'Checking...' : 'Continue'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNamePopup(false)}
                    disabled={authFlow.loading}
                    className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  );
}
