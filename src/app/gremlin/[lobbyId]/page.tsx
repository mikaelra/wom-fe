'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import GremlinOverlay from '@/components/gremlin/GremlinOverlay';

const GremlinScene = dynamic(() => import('@/components/gremlin/GremlinScene'), { ssr: false });

export default function GremlinPage() {
  const params = useParams();
  const lobbyId = params?.lobbyId as string | undefined;
  const [lobbyState, setLobbyState] = useState<import('@/types/game').LobbyState | null>(null);
  const [playerName, setPlayerName] = useState('');

  useEffect(() => {
    setPlayerName(localStorage.getItem('playerName') ?? '');
  }, []);

  if (!lobbyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <p className="text-green-400">Invalid lobby.</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#0a2a0a' }}>
      <Canvas
        camera={{ position: [0, 8, 12], fov: 55 }}
        shadows
        style={{ position: 'absolute', inset: 0 }}
      >
        <GremlinScene state={lobbyState} playerName={playerName} lobbyId={lobbyId} />
      </Canvas>
      <GremlinOverlay lobbyId={lobbyId} onStateChange={setLobbyState} />
    </div>
  );
}
