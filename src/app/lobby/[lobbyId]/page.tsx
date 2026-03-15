'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import LobbyOverlay from '@/components/lobby/LobbyOverlay';
import { BASE_FOV } from '@/lib/sceneConstants';

const LobbyScene = dynamic(() => import('@/components/lobby/LobbyScene'), { ssr: false });

export default function LobbyPage() {
  const params = useParams();
  const lobbyId = params?.lobbyId as string | undefined;
  const [lobbyState, setLobbyState] = useState<import('@/types/game').LobbyState | null>(null);
  const [playerName, setPlayerName] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPlayerName(localStorage.getItem('playerName') || '');
    }
  }, []);

  if (!lobbyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-700">Invalid lobby.</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      <Canvas
        camera={{ position: [33, 26, 33], fov: BASE_FOV }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <LobbyScene state={lobbyState} playerName={playerName} lobbyId={lobbyId} />
      </Canvas>
      <LobbyOverlay lobbyId={lobbyId} onStateChange={setLobbyState} />
    </div>
  );
}
