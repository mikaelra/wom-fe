'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import LobbyOverlay from '@/components/lobby/LobbyOverlay';
import { BASE_FOV } from '@/lib/sceneConstants';
import { getSocket, joinLobby, checkName, logInUser } from '@/lib/api';
import type { LobbyState } from '@/types/game';

const LobbyScene = dynamic(() => import('@/components/lobby/LobbyScene'), { ssr: false });

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const lobbyId = params?.lobbyId as string | undefined;
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [playerNameInit, setPlayerNameInit] = useState(false);
  const [sharedAction, setSharedAction] = useState('');
  const [sharedAttackTarget, setSharedAttackTarget] = useState('');

  // Join form state (used when not logged in)
  const [previewState, setPreviewState] = useState<LobbyState | null>(null);
  const [joinName, setJoinName] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  // Email verification step (when the typed name is claimed)
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPlayerName(localStorage.getItem('playerName') || '');
      setPlayerNameInit(true);
    }
  }, []);

  // Subscribe to socket state updates once the user has typed a name.
  // The server ignores join_room with an empty name, so we wait until
  // there is something to send.
  const typedName = joinName.trim();
  useEffect(() => {
    if (!lobbyId || !playerNameInit || playerName || !typedName) return;
    const sock = getSocket();
    const handleStateUpdate = (data: LobbyState) => setPreviewState(data);
    sock.on('state_update', handleStateUpdate);
    sock.emit('join_room', { lobby_id: lobbyId, name: typedName });
    return () => {
      sock.off('state_update', handleStateUpdate);
    };
  }, [lobbyId, playerNameInit, playerName, typedName]);

  // Reset shared action at the start of each new round
  useEffect(() => {
    setSharedAction('');
    setSharedAttackTarget('');
  }, [lobbyState?.round]);

  const doJoin = async (name: string, emailForJoin = '') => {
    await joinLobby(lobbyId!, name, emailForJoin);
    localStorage.setItem('playerName', name);
    if (emailForJoin) localStorage.setItem('playerEmail', emailForJoin);
    setPlayerName(name);
  };

  const handleJoin = async () => {
    const name = joinName.trim();
    if (!name || !lobbyId) return;
    setJoinLoading(true);
    setJoinError('');
    try {
      const { claimed } = await checkName(name);
      if (claimed) {
        setEmailMode(true);
        setEmail('');
        setEmailError('');
        return;
      }
      await doJoin(name);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Failed to join lobby');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleLogin = async () => {
    const name = joinName.trim();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setEmailError('Please enter your email.'); return; }
    setJoinLoading(true);
    setEmailError('');
    try {
      await logInUser(name, trimmedEmail);
      await doJoin(name, trimmedEmail);
    } catch (e) {
      if (e instanceof Error && e.message === 'Wrong email') {
        setEmailError('Wrong email');
      } else {
        setEmailError(e instanceof Error ? e.message : 'Log in failed.');
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const handleChooseNewName = () => {
    setEmailMode(false);
    setEmail('');
    setEmailError('');
    setJoinName('');
    setJoinError('');
  };

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
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      <Canvas
        camera={{ position: [33, 26, 33], fov: BASE_FOV }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <LobbyScene
          state={playerName ? lobbyState : previewState}
          playerName={playerName}
          lobbyId={lobbyId}
          currentAction={sharedAction}
          attackTarget={sharedAttackTarget}
          onAttackSelect={(target) => { setSharedAction('attack'); setSharedAttackTarget(target); }}
        />
      </Canvas>

      {playerName && (
        <LobbyOverlay
          lobbyId={lobbyId}
          onStateChange={setLobbyState}
          externalAction={sharedAction}
          onActionChange={setSharedAction}
        />
      )}

      {showJoinOverlay && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4">
            {gameAlreadyStarted ? (
              <>
                <p className="text-gray-700 text-center mb-4">This game is already in progress.</p>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="block w-full text-center text-blue-500 hover:underline text-sm bg-transparent border-none cursor-pointer"
                >
                  ← Back to Home
                </button>
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
                  maxLength={30}
                  placeholder="Name"
                  value={joinName}
                  onChange={(e) => { setJoinName(e.target.value); setEmailMode(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !emailMode) handleJoin(); }}
                  autoFocus={!emailMode}
                  readOnly={emailMode}
                  className={`w-full border border-gray-300 rounded-lg px-4 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 ${emailMode ? 'opacity-60 bg-gray-100' : ''}`}
                />
                {joinError && !emailMode && (
                  <p className="text-red-500 text-sm mb-3">{joinError}</p>
                )}

                {/* Email step shown when name is claimed */}
                {emailMode && (
                  <>
                    <p className="text-sm text-gray-600 mb-2">
                      This name is claimed. Enter your email to log in or pick a new name.
                    </p>
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                      autoFocus
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {emailError && (
                      <p className="text-red-500 text-sm font-semibold mb-3">{emailError}</p>
                    )}
                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={handleLogin}
                        disabled={!email.trim() || joinLoading}
                        className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {joinLoading ? 'Logging in…' : 'Log in'}
                      </button>
                      <button
                        type="button"
                        onClick={handleChooseNewName}
                        disabled={joinLoading}
                        className="flex-1 px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        New name
                      </button>
                    </div>
                  </>
                )}

                {!emailMode && (
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={!joinName.trim() || joinLoading}
                    className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                  >
                    {joinLoading ? 'Checking…' : 'Join Lobby'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="block w-full text-center text-blue-400 hover:underline text-sm bg-transparent border-none cursor-pointer"
                >
                  ← Back to Home
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
