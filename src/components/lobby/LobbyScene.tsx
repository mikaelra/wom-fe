'use client';

import { useThree, useFrame } from '@react-three/fiber';
import { Html, Environment, useGLTF } from '@react-three/drei';
import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import Mountain from '@/components/mountain';
import Table from '@/components/Table';
import PlayerV1 from '@/components/Playerv1';
import { getSocket } from '@/lib/api';
import {
  TABLE_POSITION,
  SCENE_CENTER,
  PLAYER_POSITIONS,
  getCameraTargetPosition,
  getResponsiveFov,
} from '@/lib/sceneConstants';
import { usePanOffset } from '@/lib/usePanOffset';
import type { LobbyState } from '@/types/game';


const LOBBY_LOOKAT = new THREE.Vector3(...SCENE_CENTER);

// Camera with fly-in and drag-to-pan (30° limit, snaps back on release)
function CameraFlyIn() {
  const { camera, size } = useThree();
  const currentPosition = useRef(new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z));
  const panOffset = usePanOffset();

  useFrame(() => {
    const [x, y, z] = getCameraTargetPosition(size.width, size.height);
    const baseTarget = new THREE.Vector3(x, y, z);
    currentPosition.current.lerp(baseTarget, 0.025);

    // Apply pan offset by orbiting around the look-at point
    const arm = currentPosition.current.clone().sub(LOBBY_LOOKAT);
    arm.applyAxisAngle(new THREE.Vector3(0, 1, 0), panOffset.current.yaw);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), arm).normalize();
    arm.applyAxisAngle(right, panOffset.current.pitch);

    camera.position.copy(LOBBY_LOOKAT).add(arm);
    camera.lookAt(LOBBY_LOOKAT);

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = getResponsiveFov(size.width, size.height);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

const CHAT_BUBBLE_DURATION_MS = 4000;

function PlayerWithName({
  name,
  position,
  rotation,
  isAnimating,
  isDead,
  isWinner,
  showAttackButton,
  onAttack,
  isAttackSelected,
  actionCue,
  chatBubble,
  isBoss,
}: {
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  isAnimating: boolean;
  isDead?: boolean;
  isWinner?: boolean;
  showAttackButton?: boolean;
  onAttack?: () => void;
  isAttackSelected?: boolean;
  actionCue?: string;
  chatBubble?: string;
  isBoss?: boolean;
}) {
  const modelUrl = name === 'TURTLE' ? '/models/turtlev01.glb' : isBoss ? '/models/hadesv01.glb' : '/models/frogv01.glb';
  return (
    <group position={position} rotation={rotation}>
      <PlayerV1
        url={modelUrl}
        scale={isBoss ? 1.8 : 0.6}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        isAnimating={isAnimating}
      />
      {chatBubble && (
        <Html position={[0, 1.3, 0]} center distanceFactor={3}>
          <div style={{
            pointerEvents: 'none',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            maxWidth: '180px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            padding: '5px 8px',
            background: 'rgba(255,255,255,0.92)',
            color: '#111',
            fontSize: '12px',
            fontWeight: '500',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            textAlign: 'center',
            position: 'relative',
          }}>
            {chatBubble}
            <div style={{
              position: 'absolute',
              bottom: '-7px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '7px solid rgba(255,255,255,0.92)',
            }} />
          </div>
        </Html>
      )}
      {showAttackButton && (
        <Html position={[0, 0.9, 0]} center distanceFactor={3}>
          <button
            onClick={onAttack}
            className={actionCue}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              padding: '16px 32px',
              fontSize: '28px',
              fontWeight: 'bold',
              color: isAttackSelected ? '#ffffff' : '#fca5a5',
              background: isAttackSelected ? 'rgba(220,38,38,0.95)' : 'rgba(127,29,29,0.85)',
              border: isAttackSelected ? '2px solid #fca5a5' : '2px solid #b91c1c',
              borderRadius: '8px',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
              boxShadow: isAttackSelected
                ? '0 0 8px rgba(239,68,68,0.6), 0 4px 6px -4px rgba(0,0,0,0.2)'
                : '0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -4px rgba(0,0,0,0.2)',
            }}
          >
            ⚔ ATTACK
          </button>
        </Html>
      )}
      <Html
        position={[0, 0.5, 0]}
        center
        distanceFactor={3}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          fontSize: '14px',
          fontWeight: 'bold',
          color: isDead ? '#888' : isWinner ? 'gold' : 'white',
          textShadow: '0 0 4px rgba(0,0,0,0.8)',
          padding: '2px 6px',
          background: 'rgba(0,0,0,0.6)',
          borderRadius: '4px',
        }}
      >
        {name}
        {isWinner && ' 👑'}
        {isDead && ' ☠️'}
      </Html>
    </group>
  );
}


const LOST_SOUL_POSITIONS: [number, number, number][] = [
  [-0.7, 4.2, -0.7],
  [0.7, 4.2, -0.7],
  [-0.7, 4.2, 0.7],
  [0.7, 4.2, 0.7],
];

function LostSoulModel({
  name,
  position,
  showAttackButton,
  onAttack,
  isAttackSelected,
  actionCue,
}: {
  name: string;
  position: [number, number, number];
  showAttackButton?: boolean;
  onAttack?: () => void;
  isAttackSelected?: boolean;
  actionCue?: string;
}) {
  const { scene } = useGLTF('/models/ghost.glb');
  const sceneClone = useMemo(() => scene.clone(), [scene]);
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.8 + position[0]) * 0.1;
    }
  });

  return (
    <group ref={ref} position={position}>
      <primitive object={sceneClone} scale={0.4} />
      <Html
        position={[0, 0.6, 0]}
        center
        distanceFactor={3}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          fontSize: '13px',
          fontWeight: 'bold',
          color: '#a78bfa',
          textShadow: '0 0 6px rgba(100,0,200,0.8)',
          padding: '2px 6px',
          background: 'rgba(0,0,0,0.6)',
          borderRadius: '4px',
        }}
      >
        {name}
      </Html>
      {showAttackButton && (
        <Html position={[0, 0.75, 0]} center distanceFactor={3}>
          <button
            onClick={onAttack}
            className={actionCue}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              padding: '16px 32px',
              fontSize: '28px',
              fontWeight: 'bold',
              color: isAttackSelected ? '#ffffff' : '#fca5a5',
              background: isAttackSelected ? 'rgba(220,38,38,0.95)' : 'rgba(127,29,29,0.85)',
              border: isAttackSelected ? '2px solid #fca5a5' : '2px solid #b91c1c',
              borderRadius: '8px',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
              boxShadow: isAttackSelected
                ? '0 0 8px rgba(239,68,68,0.6), 0 4px 6px -4px rgba(0,0,0,0.2)'
                : '0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -4px rgba(0,0,0,0.2)',
            }}
          >
            ⚔ ATTACK
          </button>
        </Html>
      )}
    </group>
  );
}

useGLTF.preload('/models/ghost.glb');
useGLTF.preload('/models/frogv01.glb');
useGLTF.preload('/models/turtlev01.glb');

type LobbySceneProps = {
  state: LobbyState | null;
  playerName: string;
  lobbyId: string;
  currentAction?: string;
  attackTarget?: string;
  onAttackSelect?: (target: string) => void;
};

export default function LobbyScene({ state, playerName, lobbyId, currentAction, attackTarget, onAttackSelect }: LobbySceneProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!state?.round_end_time) { setSecondsLeft(null); return; }
    const endTime = new Date(state.round_end_time).getTime() / 1000;
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor(endTime - Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.round_end_time]);

  const allPlayers = state?.players ?? [];
  const lostSouls = allPlayers.filter((p) => p.lost_soul);
  // Sort so current player is slot 0 (near camera) and boss is slot 1 (far side of table)
  const players = allPlayers
    .filter((p) => !p.lost_soul)
    .sort((a, b) => {
      const score = (p: typeof a) => (p.name === playerName ? 0 : p.boss ? 1 : 2);
      return score(a) - score(b);
    })
    .slice(0, PLAYER_POSITIONS.length);
  const winner = state?.winner ?? state?.raidwinner ?? null;

  const myPlayer = state?.players.find((p) => p.name === playerName);
  const gameOver = state?.gameover ?? false;
  const isDenied = playerName === state?.deny_target;
  const isAlive = (myPlayer?.hp ?? 0) > 0;
  const gameStarted = (state?.round ?? 0) > 0;
  const showAttackButtons = gameStarted && !gameOver && !isDenied && isAlive && !myPlayer?.spectator;

  const isGoldWarn = secondsLeft !== null && secondsLeft <= 10 && secondsLeft > 5;
  const isRedWarn  = secondsLeft !== null && secondsLeft <= 5;
  const actionCue  = !currentAction && showAttackButtons
    ? (isRedWarn ? 'warn-blink-red' : isGoldWarn ? 'warn-blink-gold' : '')
    : '';

  // Build a map of sender → latest message text if it's within CHAT_BUBBLE_DURATION_MS
  const chatBubbles = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, string>();
    for (const msg of state?.chat ?? []) {
      const age = now - new Date(msg.timestamp).getTime();
      if (age < CHAT_BUBBLE_DURATION_MS) {
        map.set(msg.sender, msg.message);
      }
    }
    return map;
  }, [state?.chat]);

  const handleAttack = (targetName: string) => {
    getSocket().emit('submit_choice', { lobby_id: lobbyId, player: playerName, action: 'attack', target: targetName, resource: '' });
    onAttackSelect?.(targetName);
  };

  return (
    <>
      <CameraFlyIn />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow />
      <color attach="background" args={['#87ceeb']} />

      <Mountain scale={150} position={[40, -282, 62]} />
      <Table position={TABLE_POSITION} scale={1.2} />

      {players.map((player, i) => {
        const slot = PLAYER_POSITIONS[i];
        if (!slot) return null;
        const { position, rotation } = slot;
        const isDead = (player.hp ?? 0) <= 0;
        const isWinner = winner === player.name;
        const isOpponent = player.name !== playerName;
        const isBoss = !!player.boss;
        const playerRotation: [number, number, number] = [rotation[0], rotation[1] + Math.PI / 2, rotation[2]];
        return (
          <PlayerWithName
            key={player.name}
            name={player.name}
            position={position}
            rotation={playerRotation}
            isAnimating={true}
            isDead={isDead}
            isWinner={!!isWinner}
            isBoss={isBoss}
            showAttackButton={showAttackButtons && isOpponent && !isDead && !isBoss}
            onAttack={() => handleAttack(player.name)}
            isAttackSelected={currentAction === 'attack' && attackTarget === player.name}
            actionCue={actionCue}
            chatBubble={chatBubbles.get(player.name)}
          />
        );
      })}

      {lostSouls.map((soul, i) => {
        const pos = LOST_SOUL_POSITIONS[i % LOST_SOUL_POSITIONS.length];
        const isDead = (soul.hp ?? 0) <= 0;
        return (
          <LostSoulModel
            key={soul.name}
            name={soul.name}
            position={pos}
            showAttackButton={showAttackButtons && !isDead}
            onAttack={() => handleAttack(soul.name)}
            isAttackSelected={currentAction === 'attack' && attackTarget === soul.name}
            actionCue={actionCue}
          />
        );
      })}

      <Environment preset="sunset" />
    </>
  );
}
