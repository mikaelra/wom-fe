'use client';

import { useThree, useFrame } from '@react-three/fiber';
import { Html, Environment, useGLTF } from '@react-three/drei';
import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import Mountain from '@/components/mountain';
import Table from '@/components/Table';
import PlayerV1 from '@/components/Playerv1';
import { getSocket } from '@/lib/api';
import { assignSkins, ALL_FROG_SKINS, skinUrl } from '@/lib/frogSkins';
import {
  TABLE_POSITION,
  SCENE_CENTER,
  MAX_PLAYERS,
  getPlayerPositions,
  getCameraTargetPosition,
  getResponsiveFov,
} from '@/lib/sceneConstants';
import { usePanOffset } from '@/lib/usePanOffset';
import type { LobbyState, Player } from '@/types/game';


const LOBBY_LOOKAT = new THREE.Vector3(...SCENE_CENTER);

// Camera with fly-in and drag-to-pan (full 360° yaw, large pitch range, no snap-back)
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

function WinnerCrown({ worldPosition }: { worldPosition: [number, number, number] | null }) {
  const { scene } = useGLTF('/models/crowns/crown_ld_v1.glb');
  const crownScene = useMemo(() => scene.clone(), [scene]);
  const ref = useRef<THREE.Group>(null);

  useFrame((clockState) => {
    if (ref.current && worldPosition) {
      ref.current.position.y = worldPosition[1] + 1.05 + Math.sin(clockState.clock.elapsedTime * 2.2) * 0.06;
      ref.current.rotation.y = clockState.clock.elapsedTime * 0.45;
    }
  });

  if (!worldPosition) return null;

  return (
    <group
      ref={ref}
      position={[worldPosition[0], worldPosition[1] + 1.05, worldPosition[2]]}
    >
      <primitive object={crownScene} scale={0.35} />
    </group>
  );
}

function WellCrown({ worldPosition }: { worldPosition: [number, number, number] | null }) {
  const { scene } = useGLTF('/models/well_crown_v1.glb');
  const crownScene = useMemo(() => scene.clone(), [scene]);
  const ref = useRef<THREE.Group>(null);

  useFrame((clockState) => {
    if (ref.current && worldPosition) {
      ref.current.position.y = worldPosition[1] + 0.65 + Math.sin(clockState.clock.elapsedTime * 2.2) * 0.07;
      ref.current.rotation.y = clockState.clock.elapsedTime * 0.45;
    }
  });

  if (!worldPosition) return null;

  return (
    <group ref={ref} position={[worldPosition[0], worldPosition[1] + 0.65, worldPosition[2]]}>
      <primitive object={crownScene} scale={0.2} />
    </group>
  );
}


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
  frogSkinUrl,
  // own-player action UI
  showOwnActions,
  currentAction,
  currentResource,
  myPlayerData,
  onDefend,
  onResource,
  resourceCue,
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
  frogSkinUrl?: string;
  showOwnActions?: boolean;
  currentAction?: string;
  currentResource?: string;
  myPlayerData?: Player;
  onDefend?: () => void;
  onResource?: (res: string) => void;
  resourceCue?: string;
}) {
  const modelUrl = name === 'TURTLE' ? '/models/turtlev01.glb' : isBoss ? '/models/hades_v2.glb' : (frogSkinUrl ?? skinUrl('frog_green_v1'));
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
      {/* DEFEND button — own player only */}
      {showOwnActions && (
        <Html position={[0, 0.9, 0]} center distanceFactor={3}>
          <button
            onClick={onDefend}
            className={actionCue}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              padding: '14px 28px',
              fontSize: '26px',
              fontWeight: 'bold',
              color: currentAction === 'defend' ? '#ffffff' : '#93c5fd',
              background: currentAction === 'defend' ? 'rgba(37,99,235,0.95)' : 'rgba(30,27,75,0.85)',
              border: currentAction === 'defend' ? '2px solid #93c5fd' : '2px solid #1d4ed8',
              borderRadius: '8px',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
              boxShadow: currentAction === 'defend'
                ? '0 0 8px rgba(59,130,246,0.6), 0 4px 6px -4px rgba(0,0,0,0.2)'
                : '0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -4px rgba(0,0,0,0.2)',
            }}
          >
            🛡 DEFEND
          </button>
        </Html>
      )}
      {/* HP / COINS / ATK resource cards — own player only */}
      {showOwnActions && myPlayerData && (
        <Html position={[0, 0.15, 0]} center distanceFactor={3}>
          <div style={{ display: 'flex', gap: '8px', pointerEvents: 'auto' }}>
            {/* HP */}
            <button
              onClick={() => onResource?.('gain_hp')}
              className={resourceCue}
              style={{
                cursor: 'pointer',
                padding: '8px 12px',
                minWidth: '62px',
                textAlign: 'center',
                borderRadius: '8px',
                backdropFilter: 'blur(4px)',
                border: currentResource === 'gain_hp' ? '2px solid #f87171' : '2px solid rgba(239,68,68,0.5)',
                background: currentResource === 'gain_hp' ? 'rgba(185,28,28,0.8)' : 'rgba(0,0,0,0.7)',
                boxShadow: currentResource === 'gain_hp' ? '0 0 8px rgba(239,68,68,0.5)' : undefined,
              }}
            >
              <p style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>HP</p>
              <p style={{ color: '#f87171', fontWeight: 'bold', fontSize: '20px', lineHeight: 1.2, margin: 0 }}>{myPlayerData.hp}</p>
              <p style={{ color: 'rgba(248,113,113,0.7)', fontSize: '10px', margin: 0 }}>❤ Get</p>
            </button>
            {/* COINS */}
            <button
              onClick={() => onResource?.('gain_coin')}
              className={resourceCue}
              style={{
                cursor: 'pointer',
                padding: '8px 12px',
                minWidth: '62px',
                textAlign: 'center',
                borderRadius: '8px',
                backdropFilter: 'blur(4px)',
                border: currentResource === 'gain_coin' ? '2px solid #facc15' : '2px solid rgba(234,179,8,0.5)',
                background: currentResource === 'gain_coin' ? 'rgba(161,98,7,0.8)' : 'rgba(0,0,0,0.7)',
                boxShadow: currentResource === 'gain_coin' ? '0 0 8px rgba(234,179,8,0.5)' : undefined,
              }}
            >
              <p style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Coins</p>
              <p style={{ color: '#facc15', fontWeight: 'bold', fontSize: '20px', lineHeight: 1.2, margin: 0 }}>{myPlayerData.coins}</p>
              <p style={{ color: 'rgba(250,204,21,0.7)', fontSize: '10px', margin: 0 }}>💰 Get</p>
            </button>
            {/* ATK */}
            {(() => {
              const cannotAfford = myPlayerData.coins < myPlayerData.attackDamage;
              return (
                <button
                  onClick={() => !cannotAfford && onResource?.('gain_attack')}
                  className={cannotAfford ? undefined : resourceCue}
                  style={{
                    cursor: cannotAfford ? 'not-allowed' : 'pointer',
                    opacity: cannotAfford ? 0.6 : 1,
                    padding: '8px 12px',
                    minWidth: '62px',
                    textAlign: 'center',
                    borderRadius: '8px',
                    backdropFilter: 'blur(4px)',
                    border: currentResource === 'gain_attack' ? '2px solid #60a5fa' : '2px solid rgba(59,130,246,0.5)',
                    background: currentResource === 'gain_attack' ? 'rgba(29,78,216,0.8)' : 'rgba(0,0,0,0.7)',
                    boxShadow: currentResource === 'gain_attack' ? '0 0 8px rgba(59,130,246,0.5)' : undefined,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <p style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>ATK</p>
                  <p style={{ color: '#60a5fa', fontWeight: 'bold', fontSize: '20px', lineHeight: 1.2, margin: 0 }}>{myPlayerData.attackDamage}</p>
                  <p style={{ color: 'rgba(96,165,250,0.7)', fontSize: '10px', margin: 0 }}>⚔ Buy</p>
                  {cannotAfford && (
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: '8px' }} preserveAspectRatio="none">
                      <line x1="0" y1="0" x2="100%" y2="100%" stroke="red" strokeWidth="2" />
                    </svg>
                  )}
                </button>
              );
            })()}
          </div>
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
  const { scene } = useGLTF('/models/lost_soul_v2.glb');
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

useGLTF.preload('/models/lost_soul_v2.glb');
useGLTF.preload('/models/hades_v2.glb');
useGLTF.preload('/models/turtlev01.glb');
useGLTF.preload('/models/crowns/crown_ld_v1.glb');
useGLTF.preload('/models/well_crown_v1.glb');
ALL_FROG_SKINS.forEach((s) => useGLTF.preload(skinUrl(s)));

type LobbySceneProps = {
  state: LobbyState | null;
  playerName: string;
  lobbyId: string;
  currentAction?: string;
  attackTarget?: string;
  onAttackSelect?: (target: string) => void;
  onActionChange?: (action: string) => void;
};

export default function LobbyScene({ state, playerName, lobbyId, currentAction, attackTarget, onAttackSelect, onActionChange }: LobbySceneProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [localResource, setLocalResource] = useState('');

  useEffect(() => {
    if (!state?.round_end_time) { setSecondsLeft(null); return; }
    const endTime = new Date(state.round_end_time).getTime() / 1000;
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor(endTime - Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.round_end_time]);

  // Reset resource selection each round
  useEffect(() => {
    setLocalResource('');
  }, [state?.round]);


  const allPlayers = state?.players ?? [];
  const lostSouls = allPlayers.filter((p) => p.lost_soul);

  // Compute skins for all frog players deterministically from their names so
  // every client agrees without any server round-trip.
  const skinMap = useMemo(() => {
    const frogPlayers = allPlayers.filter((p) => !p.boss && !p.gremlin && !p.lost_soul && p.name !== 'TURTLE');
    return assignSkins(frogPlayers, lobbyId);
  }, [allPlayers, lobbyId]);

  // Sort so current player is slot 0 (near camera) and boss is slot 1 (far side of table)
  const players = allPlayers
    .filter((p) => !p.lost_soul)
    .sort((a, b) => {
      const score = (p: typeof a) => (p.name === playerName ? 0 : p.boss ? 1 : 2);
      return score(a) - score(b);
    })
    .slice(0, MAX_PLAYERS);
  const winner = state?.winner ?? state?.raidwinner ?? null;

  // Recompute seat positions each render so spacing is always even for the current player count.
  const PLAYER_POSITIONS = getPlayerPositions(players.length);

  const myPlayer = state?.players.find((p) => p.name === playerName);
  const gameOver = state?.gameover ?? false;
  const isBossFight = !!state?.boss_fight;
  const isDenied = playerName === state?.deny_target;

  // Compute world-space position for the crown (above winner's head, private lobbies only)
  const crownPosition = useMemo((): [number, number, number] | null => {
    if (!gameOver || isBossFight || !winner) return null;
    const winnerIndex = players.findIndex((p) => p.name === winner);
    if (winnerIndex < 0) return null;
    const slot = PLAYER_POSITIONS[winnerIndex];
    if (!slot) return null;
    return slot.position;
  }, [gameOver, isBossFight, winner, players, PLAYER_POSITIONS]);
  // raidwinner = who last won The Well; crown shows during gameplay (not on game-over screen)
  const wellCrownHolder = (!gameOver && state?.raidwinner) ? state.raidwinner : null;

  // Well crown hovers above the current well winner for everyone to see
  const wellCrownPosition = useMemo((): [number, number, number] | null => {
    if (!wellCrownHolder) return null;
    const idx = players.findIndex((p) => p.name === wellCrownHolder);
    if (idx < 0) return null;
    return PLAYER_POSITIONS[idx]?.position ?? null;
  }, [wellCrownHolder, players, PLAYER_POSITIONS]);


  const isAlive = (myPlayer?.hp ?? 0) > 0;
  const gameStarted = (state?.round ?? 0) > 0;
  const showAttackButtons = gameStarted && !gameOver && !isDenied && isAlive && !myPlayer?.spectator;

  const isGoldWarn = secondsLeft !== null && secondsLeft <= 10 && secondsLeft > 5;
  const isRedWarn  = secondsLeft !== null && secondsLeft <= 5;
  const actionCue  = !currentAction && showAttackButtons
    ? (isRedWarn ? 'warn-blink-red' : isGoldWarn ? 'warn-blink-gold' : '')
    : '';
  const resourceCue = localResource === '' && showAttackButtons
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

  const handleDefend = () => {
    getSocket().emit('submit_choice', { lobby_id: lobbyId, player: playerName, action: 'defend', resource: '' });
    onActionChange?.('defend');
  };

  const handleRaid = () => {
    getSocket().emit('submit_choice', { lobby_id: lobbyId, player: playerName, action: 'raid', resource: '' });
    onActionChange?.('raid');
  };

  const handleResource = (resId: string) => {
    setLocalResource(resId);
    getSocket().emit('submit_choice', { lobby_id: lobbyId, player: playerName, resource: resId, action: '' });
  };

  return (
    <>
      <CameraFlyIn />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow />
      <color attach="background" args={['#87ceeb']} />

      <Mountain scale={150} position={[40, -282, 62]} />
      <Table position={TABLE_POSITION} scale={1.2} />

      {/* WELL (raid) button — anchored to the well model at the table centre */}
      {showAttackButtons && (
        <Html position={[0, 3.9, 0]} center distanceFactor={3}>
          <button
            onClick={handleRaid}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              padding: '14px 28px',
              fontSize: '26px',
              fontWeight: 'bold',
              color: currentAction === 'raid' ? '#ffffff' : '#d8b4fe',
              background: currentAction === 'raid' ? 'rgba(126,34,206,0.95)' : 'rgba(46,16,101,0.85)',
              border: currentAction === 'raid' ? '2px solid #d8b4fe' : '2px solid #7e22ce',
              borderRadius: '8px',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
              boxShadow: currentAction === 'raid'
                ? '0 0 8px rgba(167,139,250,0.6), 0 4px 6px -4px rgba(0,0,0,0.2)'
                : '0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -4px rgba(0,0,0,0.2)',
            }}
          >
            🏴 The Well
          </button>
        </Html>
      )}

      {players.map((player, i) => {
        const slot = PLAYER_POSITIONS[i];
        if (!slot) return null;
        const { position, rotation } = slot;
        const isDead = (player.hp ?? 0) <= 0;
        const isWinner = winner === player.name;
        const isOpponent = player.name !== playerName;
        const isBoss = !!player.boss;
        const isOwnPlayer = player.name === playerName;
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
            frogSkinUrl={skinMap.get(player.name)}
            showAttackButton={showAttackButtons && isOpponent && !isDead && !isBoss}
            onAttack={() => handleAttack(player.name)}
            isAttackSelected={currentAction === 'attack' && attackTarget === player.name}
            actionCue={actionCue}
            chatBubble={chatBubbles.get(player.name)}
            showOwnActions={isOwnPlayer && showAttackButtons && !isDead}
            currentAction={currentAction}
            currentResource={localResource}
            myPlayerData={isOwnPlayer ? myPlayer : undefined}
            onDefend={handleDefend}
            onResource={handleResource}
            resourceCue={resourceCue}
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

      <WinnerCrown worldPosition={crownPosition} />
      <WellCrown worldPosition={wellCrownPosition} />
      <Environment preset="sunset" />
    </>
  );
}
