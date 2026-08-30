'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import LobbyOverlay from '@/components/lobby/LobbyOverlay';
import { BASE_FOV } from '@/lib/sceneConstants';
import { joinLobby } from '@/lib/api';
import { getSocket, subscribe } from '@/lib/socket';
import { getStoredToken } from '@/lib/http';
import { useAuthFlow, NAME_MAX_LENGTH } from '@/lib/useAuthFlow';
import type { LobbyState } from '@/types/game';
import { CITY_PATH } from '@/lib/cities';

const LobbyScene = dynamic(() => import('@/components/lobby/LobbyScene'), { ssr: false });

// useSearchParams() opts this subtree out of static rendering unless it's
// wrapped in Suspense (docs/MOBILE_AND_STEAM_PLAN.md §5.3) -- the whole page
// is 'use client' regardless, so the fallback is never actually visible in
// practice, just required by Next to build at all.
export default function LobbyPage() {
  return (
    <Suspense fallback={null}>
      <LobbyPageContent />
    </Suspense>
  );
}

function LobbyPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const lobbyId = searchParams.get('id') ?? undefined;
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [playerNameInit, setPlayerNameInit] = useState(false);
  const [sharedAction, setSharedAction] = useState('');
  const [sharedAttackTarget, setSharedAttackTarget] = useState('');
  const [sharedResource, setSharedResource] = useState('');
  // Lifted here since LobbyScene (the camera) and LobbyOverlay (the toggle
  // button) are separate render trees -- see CameraFlyIn's ambient orbit.
  const [spinEnabled, setSpinEnabled] = useState(true);
  // Same split -- the Reset Camera button (LobbyOverlay) needs to know
  // whether the player has actually touched the camera (CameraFlyIn/
  // usePanOffset) and to be able to command it back to the start-of-match
  // view. resetCameraSignal is a counter (not a boolean) so clicking Reset
  // again after dragging some more still fires the tween.
  const [cameraMoved, setCameraMoved] = useState(false);
  const [resetCameraSignal, setResetCameraSignal] = useState(0);
  // Poisoned Dagger (instakill) visual cue, lifted the same way -- LobbyScene
  // computes the "model has landed" reveal timing (it owns the well-reward
  // batch scheduling), LobbyOverlay/SceneOverlay's ATK card just follows it.
  const [instakillActive, setInstakillActive] = useState(false);

  const hasAutoJoined = useRef(false);
  const [hasJoined, setHasJoined] = useState(false);

  // Join form state (used when not logged in)
  const [previewState, setPreviewState] = useState<LobbyState | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPlayerName(localStorage.getItem('playerName') || '');
      setPlayerNameInit(true);
    }
  }, []);

  // Reset the auto-join guard and join state whenever the lobby changes (e.g. replay redirect).
  useEffect(() => {
    hasAutoJoined.current = false;
    setHasJoined(false);
  }, [lobbyId]);

  // When the user is already logged in and arrives via an invite link, join the
  // lobby automatically without showing the join form.
  useEffect(() => {
    if (!lobbyId || !playerNameInit || !playerName || hasAutoJoined.current) return;
    hasAutoJoined.current = true;
    const email = localStorage.getItem('playerEmail') ?? '';
    joinLobby(lobbyId, playerName, email)
      .then(() => setHasJoined(true))
      .catch(() => setHasJoined(true));
  }, [lobbyId, playerNameInit, playerName]);

  // Subscribe to socket state updates once the user has typed a name.
  // join_room now authenticates via the join-issued session token (backend
  // Phase 1a) rather than the typed name, so this preview only works when a
  // token from an earlier join in this tab is already stored (e.g. a
  // refresh) -- a brand-new visitor who hasn't joined yet has no token, and
  // the player-list preview simply doesn't populate for them. That's the
  // intended effect of closing off anonymous room peeking, not a bug.
  const authFlow = useAuthFlow({
    submitErrorFallback: 'Failed to join lobby',
    onAuthenticated: async (name, emailForJoin) => {
      hasAutoJoined.current = true; // prevent the auto-join effect from re-firing after setPlayerName
      await joinLobby(lobbyId!, name, emailForJoin);
      localStorage.setItem('playerName', name);
      if (emailForJoin) localStorage.setItem('playerEmail', emailForJoin);
      setHasJoined(true);
      setPlayerName(name);
    },
  });
  const typedName = authFlow.name.trim();
  useEffect(() => {
    if (!lobbyId || !playerNameInit || playerName || !typedName) return;
    const token = getStoredToken(lobbyId);
    if (!token) return;
    const unsubscribe = subscribe('state_update', (data) => setPreviewState(data));
    getSocket().emit('join_room', { lobby_id: lobbyId, token });
    return unsubscribe;
  }, [lobbyId, playerNameInit, playerName, typedName]);

  // Reset shared action at the start of each new round
  useEffect(() => {
    setSharedAction('');
    setSharedAttackTarget('');
  }, [lobbyState?.round]);
  // sharedResource is deliberately NOT reset here, unlike sharedAction above:
  // this effect and LobbyScene's round-resolution effect (which needs to read
  // the *resolved* round's choice via chosenResourceRef) both react to the
  // same lobbyState.round change, but LobbyScene's is gated behind an async
  // per-round events fetch (useGameEvents) -- by the time that resolves, this
  // effect (synchronous, same commit as the round change) has already fired
  // and re-rendered LobbyScene with the cleared value, clobbering the ref
  // before the async effect ever gets to read it. LobbyScene clears
  // chosenResourceRef itself, right after consuming it, instead.

  // Stable identity — flows into memo()ed scene components via LobbyScene.
  const handleAttackSelect = useCallback((target: string) => {
    setSharedAction('attack');
    setSharedAttackTarget(target);
  }, []);

  const handleCameraUserAdjust = useCallback(() => setCameraMoved(true), []);
  const handleResetCamera = useCallback(() => {
    setResetCameraSignal((n) => n + 1);
    setCameraMoved(false);
  }, []);

  if (!lobbyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-700">Invalid lobby.</p>
      </div>
    );
  }

  const gameAlreadyStarted = (previewState?.round ?? 0) > 0;
  const showJoinOverlay = playerNameInit && !playerName;
  const playerList = previewState?.players.map((p) => p.name).join(', ') ?? '';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden' }}>
      <Canvas
        camera={{ position: [33, 26, 33], fov: BASE_FOV }}
        // Cap resolution at 2x — rendering at DPR 3 on phones triples the pixel
        // count for no visible gain and is the main fill-rate cost of the scene.
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <LobbyScene
          state={playerName ? lobbyState : previewState}
          playerName={playerName}
          lobbyId={lobbyId}
          currentAction={sharedAction}
          attackTarget={sharedAttackTarget}
          onAttackSelect={handleAttackSelect}
          onActionChange={setSharedAction}
          chosenResource={sharedResource}
          spinEnabled={spinEnabled}
          resetCameraSignal={resetCameraSignal}
          onCameraUserAdjust={handleCameraUserAdjust}
          onInstakillActiveChange={setInstakillActive}
        />
      </Canvas>

      {playerName && hasJoined && (
        <LobbyOverlay
          lobbyId={lobbyId}
          onStateChange={setLobbyState}
          externalAction={sharedAction}
          onActionChange={setSharedAction}
          onResourceChange={setSharedResource}
          spinEnabled={spinEnabled}
          onToggleSpin={() => setSpinEnabled((v) => !v)}
          cameraMoved={cameraMoved}
          onResetCamera={handleResetCamera}
          instakillActive={instakillActive}
        />
      )}

      {showJoinOverlay && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4 text-gray-900">
            {gameAlreadyStarted ? (
              <>
                <p className="text-gray-700 text-center mb-4">This game is already in progress.</p>
                {/* Home, and beside it the city. Kept as one item so a justify-between parent cannot fling them apart. */}
                <span className="emoji-pair inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push('/')}
                    className="block w-full text-center text-blue-500 hover:underline text-lg bg-transparent border-none cursor-pointer"
                    aria-label="Back to Home"
                  >
                    🌍
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(CITY_PATH)}
                    className="block w-full text-center text-blue-500 hover:underline text-lg bg-transparent border-none cursor-pointer"
                    aria-label="Go to the city"
                  >
                    🏛️
                  </button>
                </span>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold mb-1">Join Lobby</h1>
                <p className="text-gray-400 text-xs mb-1">Code: {lobbyId}</p>
                {playerList && (
                  <p className="text-gray-500 text-sm mb-4">Player(s): {playerList}</p>
                )}

                {/* Name input — read-only once we move to email step */}
                <input
                  type="text"
                  maxLength={NAME_MAX_LENGTH}
                  placeholder="Name"
                  value={authFlow.name}
                  onChange={(e) => authFlow.setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !authFlow.emailMode) authFlow.handleSubmitName(); }}
                  autoFocus={!authFlow.emailMode}
                  readOnly={authFlow.emailMode}
                  className={`w-full border border-gray-300 rounded-lg px-4 py-2 mb-3 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${authFlow.emailMode ? 'opacity-60 !bg-gray-100' : ''}`}
                />
                {authFlow.error && !authFlow.emailMode && (
                  <p className="text-red-500 text-sm mb-3">{authFlow.error}</p>
                )}

                {/* Email step shown when name is claimed */}
                {authFlow.emailMode && (
                  <>
                    <p className="text-sm text-gray-600 mb-2">
                      This name is claimed. Enter your email to log in or pick a new name.
                    </p>
                    <input
                      type="email"
                      placeholder="Email"
                      value={authFlow.email}
                      onChange={(e) => authFlow.setEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !authFlow.codeMode) authFlow.handleLogin(); }}
                      autoFocus={!authFlow.codeMode}
                      readOnly={authFlow.codeMode}
                      className={`w-full border border-gray-300 rounded-lg px-4 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 ${authFlow.codeMode ? 'opacity-60 bg-gray-100' : ''}`}
                    />
                    {authFlow.emailError && !authFlow.codeMode && (
                      <p className="text-red-500 text-sm font-semibold mb-3">{authFlow.emailError}</p>
                    )}

                    {/* Code step shown when always_verify_email is on */}
                    {authFlow.codeMode && (
                      <>
                        <p className="text-sm text-gray-600 mb-2">
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
                          onKeyDown={(e) => { if (e.key === 'Enter') authFlow.handleVerifyCode(); }}
                          autoFocus
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-3 bg-white text-gray-900 placeholder-gray-400 tracking-[0.3em] font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {authFlow.codeError && (
                          <p className="text-red-500 text-sm font-semibold mb-3">{authFlow.codeError}</p>
                        )}
                      </>
                    )}

                    <div className="flex gap-2 mb-3">
                      {authFlow.codeMode ? (
                        <>
                          <button
                            type="button"
                            onClick={authFlow.handleVerifyCode}
                            disabled={!authFlow.code.trim() || authFlow.loading}
                            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {authFlow.loading ? 'Verifying…' : 'Verify'}
                          </button>
                          <button
                            type="button"
                            onClick={authFlow.backToEmailStep}
                            disabled={authFlow.loading}
                            className="flex-1 px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Back
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={authFlow.handleLogin}
                            disabled={!authFlow.email.trim() || authFlow.loading}
                            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {authFlow.loading ? 'Logging in…' : 'Log in'}
                          </button>
                          <button
                            type="button"
                            onClick={authFlow.reset}
                            disabled={authFlow.loading}
                            className="flex-1 px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            New name
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}

                {!authFlow.emailMode && (
                  <button
                    type="button"
                    onClick={authFlow.handleSubmitName}
                    disabled={!authFlow.name.trim() || authFlow.loading}
                    className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                  >
                    {authFlow.loading ? 'Checking…' : 'Join Lobby'}
                  </button>
                )}

                {/* Home, and beside it the city. Kept as one item so a justify-between parent cannot fling them apart. */}
                <span className="emoji-pair inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push('/')}
                    className="block w-full text-center text-blue-400 hover:underline text-lg bg-transparent border-none cursor-pointer"
                    aria-label="Back to Home"
                  >
                    🌍
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(CITY_PATH)}
                    className="block w-full text-center text-blue-400 hover:underline text-lg bg-transparent border-none cursor-pointer"
                    aria-label="Go to the city"
                  >
                    🏛️
                  </button>
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
