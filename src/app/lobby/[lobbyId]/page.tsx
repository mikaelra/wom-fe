'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import LobbyOverlay from '@/components/lobby/LobbyOverlay';
import { BASE_FOV } from '@/lib/sceneConstants';
import { getState, joinLobby } from '@/lib/api';
import type { LobbyState } from '@/types/game';

const LobbyScene = dynamic(() => import('@/components/lobby/LobbyScene'), { ssr: false });

export default function LobbyPage() {
  const params = useParams();
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPlayerName(localStorage.getItem('playerName') || '');
      setPlayerNameInit(true);
    }
  }, []);

  // Poll lobby state for background preview when not logged in
  useEffect(() => {
    if (!lobbyId || !playerNameInit || playerName) return;
    const fetchPreview = () =>
      getState(lobbyId).then(setPreviewState).catch(() => {});
    fetchPreview();
    const id = setInterval(fetchPreview, 3000);
    return () => clearInterval(id);
  }, [lobbyId, playerNameInit, playerName]);

  // Reset shared action at the start of each new round
  useEffect(() => {
    setSharedAction('');
    setSharedAttackTarget('');
  }, [lobbyState?.round]);

  const handleJoin = async () => {
    const name = joinName.trim();
    if (!name || !lobbyId) return;
    setJoinLoading(true);
    setJoinError('');
    try {
      await joinLobby(lobbyId, name, '');
      localStorage.setItem('playerName', name);
      setPlayerName(name);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Failed to join lobby');
    } finally {
      setJoinLoading(false);
    }
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
  const sceneState = playerName ? lobbyState : previewState;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      <Canvas
        camera={{ position: [33, 26, 33], fov: BASE_FOV }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <LobbyScene
          state={sceneState}
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
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50 backdrop-blur-[2px]">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4">
            {gameAlreadyStarted ? (
              <>
                <p className="text-gray-700 text-center mb-4">This game is already in progress.</p>
                <Link href="/" className="block text-center text-blue-500 hover:underline text-sm">
                  ← Back to Home
                </Link>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold mb-1">Join Lobby</h1>
                <p className="text-gray-400 text-xs mb-4">Code: {lobbyId}</p>

                {previewState && previewState.players.filter((p) => !p.spectator).length > 0 && (
                  <div className="mb-4 bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">
                      Waiting
                    </p>
                    <ul className="space-y-1">
                      {previewState.players
                        .filter((p) => !p.spectator)
                        .map((p) => (
                          <li key={p.name} className="text-gray-700 text-sm font-medium">
                            {p.name}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                <input
                  type="text"
                  autoFocus
                  maxLength={30}
                  placeholder="Enter your name"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {joinError && <p className="text-red-500 text-sm mb-3">{joinError}</p>}
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={!joinName.trim() || joinLoading}
                  className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                >
                  {joinLoading ? 'Joining…' : 'Join Lobby'}
                </button>
                <Link href="/" className="block text-center text-blue-400 hover:underline text-sm">
                  ← Back to Home
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
