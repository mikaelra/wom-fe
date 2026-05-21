'use client';

import { useThree, useFrame } from '@react-three/fiber';
import { Html, Environment, useGLTF } from '@react-three/drei';
import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import Mountain from '@/components/mountain';
import Table from '@/components/Table';
import PlayerV1 from '@/components/Playerv1';
import ShieldEffect from '@/components/lobby/ShieldEffect';
import SwordEffect, { HOLD_DUR, RETREAT_DUR, FLYBACK_DUR } from '@/components/lobby/SwordEffect';
import { getSocket } from '@/lib/api';
import { assignSkins, skinUrl } from '@/lib/frogSkins';
import {
  TABLE_POSITION,
  SCENE_CENTER,
  MAX_PLAYERS,
  getPlayerPositions,
  getBossPosition,
  getBossPlayerPositions,
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

    // Apply pan offset by orbiting around the look-at point, then scale by zoom
    const arm = currentPosition.current.clone().sub(LOBBY_LOOKAT);
    arm.applyAxisAngle(new THREE.Vector3(0, 1, 0), panOffset.current.yaw);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), arm).normalize();
    arm.applyAxisAngle(right, panOffset.current.pitch);
    arm.multiplyScalar(panOffset.current.zoom);

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
  bossHp,
  bossMaxHp,
  bossTitle,
  frogSkinUrl,
  // own-player action UI
  showOwnActions,
  currentAction,
  currentResource,
  myPlayerData,
  onDefend,
  onResource,
  resourceCue,
  showShield,
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
  bossHp?: number;
  bossMaxHp?: number;
  bossTitle?: string;
  frogSkinUrl?: string;
  showOwnActions?: boolean;
  currentAction?: string;
  currentResource?: string;
  myPlayerData?: Player;
  onDefend?: () => void;
  onResource?: (res: string) => void;
  resourceCue?: string;
  showShield?: boolean;
}) {
  const modelUrl = name === 'TURTLE' ? '/models/turtlev01.glb' : isBoss ? '/models/hades/hades_v3-ld.glb' : (frogSkinUrl ?? skinUrl('frog_green_v1'));
  return (
    <group position={position} rotation={rotation}>
      <PlayerV1
        url={modelUrl}
        scale={isBoss ? 1.44 : 0.6}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        isAnimating={isAnimating}
      />
      {showShield && <ShieldEffect />}
      {chatBubble && (
        <Html position={[0, 1.3, 0]} center distanceFactor={3} zIndexRange={[0, 0]}>
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
      {showAttackButton && !isBoss && (
        <Html position={[0, 0.9, 0]} center distanceFactor={3} zIndexRange={[0, 0]}>
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
        <Html position={[0, -0.1, 0]} center distanceFactor={3} zIndexRange={[0, 0]}>
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
        <Html position={[0, -0.6, 0]} center distanceFactor={3} zIndexRange={[0, 0]}>
          <div style={{ display: 'flex', gap: '10px', pointerEvents: 'auto' }}>
            {/* HP */}
            <button
              onClick={() => onResource?.('gain_hp')}
              className={resourceCue}
              style={{
                cursor: 'pointer',
                padding: '10px 14px',
                minWidth: '74px',
                textAlign: 'center',
                borderRadius: '8px',
                backdropFilter: 'blur(4px)',
                border: currentResource === 'gain_hp' ? '2px solid #f87171' : '2px solid rgba(239,68,68,0.5)',
                background: currentResource === 'gain_hp' ? 'rgba(185,28,28,0.8)' : 'rgba(0,0,0,0.7)',
                boxShadow: currentResource === 'gain_hp' ? '0 0 8px rgba(239,68,68,0.5)' : undefined,
              }}
            >
              <p style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>HP</p>
              <p style={{ color: '#f87171', fontWeight: 'bold', fontSize: '24px', lineHeight: 1.2, margin: 0 }}>{myPlayerData.hp}</p>
              <p style={{ color: 'rgba(248,113,113,0.7)', fontSize: '12px', margin: 0 }}>❤ Get</p>
            </button>
            {/* COINS */}
            <button
              onClick={() => onResource?.('gain_coin')}
              className={resourceCue}
              style={{
                cursor: 'pointer',
                padding: '10px 14px',
                minWidth: '74px',
                textAlign: 'center',
                borderRadius: '8px',
                backdropFilter: 'blur(4px)',
                border: currentResource === 'gain_coin' ? '2px solid #facc15' : '2px solid rgba(234,179,8,0.5)',
                background: currentResource === 'gain_coin' ? 'rgba(161,98,7,0.8)' : 'rgba(0,0,0,0.7)',
                boxShadow: currentResource === 'gain_coin' ? '0 0 8px rgba(234,179,8,0.5)' : undefined,
              }}
            >
              <p style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Coins</p>
              <p style={{ color: '#facc15', fontWeight: 'bold', fontSize: '24px', lineHeight: 1.2, margin: 0 }}>{myPlayerData.coins}</p>
              <p style={{ color: 'rgba(250,204,21,0.7)', fontSize: '12px', margin: 0 }}>💰 Get</p>
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
                  <p style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>ATK</p>
                  <p style={{ color: '#60a5fa', fontWeight: 'bold', fontSize: '24px', lineHeight: 1.2, margin: 0 }}>{myPlayerData.attackDamage}</p>
                  <p style={{ color: 'rgba(96,165,250,0.7)', fontSize: '12px', margin: 0 }}>⚔ Buy</p>
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
      {/* Boss HP card — floats above the Hades model in world space, tracks with camera.
          zIndexRange is raised above lost-soul buttons ([0,0]) so clicks land here first. */}
      {isBoss && bossHp !== undefined && bossMaxHp !== undefined && (
        <Html position={[0, 1.5, 0]} center distanceFactor={3} zIndexRange={[100, 100]}>
          <div style={{
            pointerEvents: showAttackButton ? 'auto' : 'none',
            userSelect: 'none',
            textAlign: 'center',
            background: 'rgba(0,0,0,0.75)',
            border: '2px solid rgba(239,68,68,0.4)',
            borderRadius: '20px',
            padding: '12px 28px',
            backdropFilter: 'blur(4px)',
            minWidth: '240px',
          }}>
            <p style={{ color: '#f87171', fontWeight: 'bold', fontSize: '26px', margin: 0, whiteSpace: 'nowrap' }}>{name}</p>
            {bossTitle && (
              <p style={{ color: '#d1d5db', fontSize: '22px', margin: '2px 0 8px', whiteSpace: 'nowrap' }}>{bossTitle}</p>
            )}
            <div style={{ width: '100%', height: '12px', background: '#374151', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.max(0, (bossHp / bossMaxHp) * 100)}%`,
                background: '#ef4444',
                borderRadius: '6px',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{ color: '#fca5a5', fontSize: '22px', margin: '6px 0 0', whiteSpace: 'nowrap' }}>
              {Math.max(0, bossHp)} / {bossMaxHp} HP
            </p>
            {showAttackButton && (
              <button
                onClick={onAttack}
                className={actionCue}
                style={{
                  marginTop: '10px',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  padding: '14px 28px',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: isAttackSelected ? '#ffffff' : '#fca5a5',
                  background: isAttackSelected ? 'rgba(220,38,38,0.95)' : 'rgba(127,29,29,0.85)',
                  border: isAttackSelected ? '2px solid #fca5a5' : '2px solid #b91c1c',
                  borderRadius: '10px',
                  whiteSpace: 'nowrap',
                  backdropFilter: 'blur(4px)',
                  boxShadow: isAttackSelected
                    ? '0 0 16px rgba(239,68,68,0.6), 0 4px 6px -4px rgba(0,0,0,0.2)'
                    : '0 10px 15px -3px rgba(0,0,0,0.3)',
                }}
              >
                ⚔ ATTACK
              </button>
            )}
          </div>
        </Html>
      )}
      <Html
        position={[0, 0.5, 0]}
        center
        distanceFactor={3}
        zIndexRange={[0, 0]}
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


// Behind Hades who is fixed at [0, PLAYER_Y, -1.4] (far z- side)
const LOST_SOUL_POSITIONS: [number, number, number][] = [
  [-0.5, 4.2, -1.9],
  [0.5, 4.2, -1.9],
  [-0.3, 4.4, -2.3],
  [0.3, 4.4, -2.3],
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
        zIndexRange={[0, 0]}
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
        <Html position={[0, 0.75, 0]} center distanceFactor={3} zIndexRange={[0, 0]}>
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

const BOSS_MAX_HP = 8;

useGLTF.preload('/models/lost_soul_v2.glb');
useGLTF.preload('/models/hades/hades_v3-ld.glb');
useGLTF.preload('/models/turtlev01.glb');
useGLTF.preload('/models/crowns/crown_ld_v1.glb');
useGLTF.preload('/models/well_crown_v1.glb');
useGLTF.preload('/models/shields/shield_animation-ld.glb');
useGLTF.preload('/models/swords/sword_animation-ld.glb');
// Frog skins are preloaded on-demand per lobby (see usePreloadLobbySkins below).
// Previously we eagerly preloaded all 13 skins (~92 MB) on app start.

type StrikeEvent = {
  id: string;
  fromPos: [number, number, number];
  toPos:   [number, number, number];
  targetDefended: boolean;
  targetHit: boolean;
  isIncoming: boolean;
  flybackPos?: [number, number, number];
};

type HitFlashEvent = {
  id: string;
  position: [number, number, number];
};

type ImpactShield = {
  id:   string;
  pos:  [number, number, number];
  rotY: number;
};

function AuraFlash({ position }: { position: [number, number, number] }) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const spawnRef = useRef(performance.now());
  const DURATION = 550;

  useFrame(() => {
    if (!meshRef.current) return;
    const t   = Math.min((performance.now() - spawnRef.current) / DURATION, 1);
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    // Expand: 0.35 → 1.75 world units
    meshRef.current.scale.setScalar(0.35 + t * 1.4);
    // Quick flash in, slow fade out
    mat.opacity = t < 0.18 ? (t / 0.18) * 0.65 : ((1 - t) / 0.82) * 0.65;
  });

  return (
    <mesh
      ref={meshRef}
      position={[position[0], position[1] + 0.45, position[2]]}
      renderOrder={20}
    >
      <sphereGeometry args={[0.45, 12, 12]} />
      <meshBasicMaterial color="#ff1100" transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

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

  // ----- Animation state -----
  const prevStateRef  = useRef<LobbyState | null>(null);
  const posMapRef     = useRef(new Map<string, [number, number, number]>());
  const [strikeEvents,  setStrikeEvents]  = useState<StrikeEvent[]>([]);
  const [hitFlashEvents, setHitFlashEvents] = useState<HitFlashEvent[]>([]);
  const [impactShields, setImpactShields] = useState<ImpactShield[]>([]);
  // Queue for incoming defended strikes that play one-after-another
  const pendingIncomingRef = useRef<StrikeEvent[]>([]);

  // Track the last action the local player submitted.
  // currentAction is reset to '' by the parent on round change BEFORE the
  // round-transition effect runs, so we snapshot it here whenever it changes.
  const lastActionRef = useRef({ action: '', target: '' });
  useEffect(() => {
    if (currentAction) {
      lastActionRef.current = { action: currentAction, target: attackTarget ?? '' };
    }
  }, [currentAction, attackTarget]);

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

  const myPlayer = state?.players.find((p) => p.name === playerName);
  const gameOver = state?.gameover ?? false;
  const isBossFight = !!state?.boss_fight;
  const isDenied = playerName === state?.deny_target;

  // Compute skins for all frog players deterministically from their names so
  // every client agrees without any server round-trip.
  const skinMap = useMemo(() => {
    const frogPlayers = allPlayers.filter((p) => !p.boss && !p.gremlin && !p.lost_soul && p.name !== 'TURTLE');
    return assignSkins(frogPlayers, lobbyId);
  }, [allPlayers, lobbyId]);

  // Preload only the skins actually used in this lobby (was: all 13 skins eagerly,
  // ~92 MB). New skins are fetched on-demand when a player joins.
  useEffect(() => {
    for (const url of skinMap.values()) {
      useGLTF.preload(url);
    }
  }, [skinMap]);

  // Sort so current player is first.
  // In boss fights: boss is kept last (gets its own fixed far-side position) and non-boss
  // players are secondarily sorted by name so their slots stay stable as new players join.
  // Outside boss fights: boss goes to slot 1 (far side of the full circle).
  const players = allPlayers
    .filter((p) => !p.lost_soul)
    .sort((a, b) => {
      const score = (p: typeof a) => (p.name === playerName ? 0 : p.boss ? (isBossFight ? 999 : 1) : 2);
      const diff = score(a) - score(b);
      if (diff !== 0) return diff;
      // Stable secondary sort by name so existing players keep their slots when new ones join
      return a.name.localeCompare(b.name);
    })
    .slice(0, MAX_PLAYERS);
  const winner = state?.winner ?? state?.raidwinner ?? null;

  // Compute seat positions. In boss fights the boss is pinned to the far side and players
  // spread across the near half, so adding a player never moves Hades.
  const PLAYER_POSITIONS = (() => {
    if (!isBossFight) return getPlayerPositions(players.length);
    const bossSlot = getBossPosition();
    const nonBossSlots = getBossPlayerPositions(players.filter((p) => !p.boss).length);
    let nbi = 0;
    return players.map((p) => (p.boss ? bossSlot : nonBossSlots[nbi++]));
  })();

  // Keep posMapRef up-to-date each render (synchronous ref write — no re-render triggered).
  // This is read by the round-transition effect below.
  {
    const m = new Map<string, [number, number, number]>();
    players.forEach((p, i) => {
      const slot = PLAYER_POSITIONS[i];
      if (slot) m.set(p.name, slot.position);
    });
    lostSouls.forEach((soul, i) => {
      m.set(soul.name, LOST_SOUL_POSITIONS[i % LOST_SOUL_POSITIONS.length]);
    });
    posMapRef.current = m;
  }

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

  // Detect round transitions and spawn 3D animation events.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state) { prevStateRef.current = null; return; }
    const prev = prevStateRef.current;

    if (prev && state.round > (prev.round ?? 0) && state.round > 0) {
      // Discard any leftover queue from the previous round
      pendingIncomingRef.current = [];

      const posMap = posMapRef.current;
      const newStrikes:       StrikeEvent[]    = [];
      const newFlashes:       HitFlashEvent[]  = [];
      const newImpactShields: ImpactShield[]   = [];
      const myPrev = prev.players.find((p) => p.name === playerName);

      // ── Outgoing: local player attacked someone ──────────────────────────
      // Use lastActionRef (snapshotted before parent resets currentAction) instead of
      // submittedAction which the server may not include in the new-round state.
      const myAction = lastActionRef.current.action;
      const myTarget = lastActionRef.current.target;
      lastActionRef.current = { action: '', target: '' };
      if (myAction === 'attack' && myTarget) {
        const tgt    = myTarget;
        const myPos  = posMap.get(playerName);
        const tgtPos = posMap.get(tgt);
        if (myPos && tgtPos) {
          const tgtPrev = prev.players.find((p) => p.name === tgt);
          const tgtNew  = state.players.find((p) => p.name === tgt);
          const tgtHit  = (tgtNew?.hp ?? Infinity) < (tgtPrev?.hp ?? Infinity);
          const tgtDefended = !tgtHit;

          const fromPos: [number, number, number] = [myPos[0], myPos[1] + 0.3, myPos[2]];
          const baseToPos: [number, number, number] = [tgtPos[0], tgtPos[1] + 0.3, tgtPos[2]];

          // When blocked: sword stops at the shield, which floats in front of the
          // defender (0.8 u toward the attacker). flyback carries the sword back.
          const SHIELD_OFFSET = 0.8;
          let toPos = baseToPos;
          let flybackPos: [number, number, number] | undefined;
          if (tgtDefended) {
            const dx = fromPos[0] - baseToPos[0];
            const dz = fromPos[2] - baseToPos[2];
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0) {
              toPos = [baseToPos[0] + (dx / len) * SHIELD_OFFSET, baseToPos[1], baseToPos[2] + (dz / len) * SHIELD_OFFSET];
            }
            // Fly back into the attacker's body (slightly past centre so it visually enters)
            flybackPos = fromPos;
          }

          newStrikes.push({ id: `out-${Date.now()}`, fromPos, toPos, targetDefended: tgtDefended, targetHit: tgtHit, isIncoming: false, flybackPos });
        }
      }

      // ── Incoming: local player was attacked ──────────────────────────────
      const myPrevHp = myPrev?.hp ?? Infinity;
      const myNewHp  = state.players.find((p) => p.name === playerName)?.hp ?? Infinity;
      const hpLost   = myNewHp < myPrevHp;
      const myPos    = posMap.get(playerName);

      // All players whose submitted action was attacking me this round
      const incomingAttackers = prev.players.filter(
        (p) => p.submittedAction === 'attack' && p.target === playerName,
      );

      if (myPos) {
        if (myAction === 'defend' && incomingAttackers.length > 0) {
          // Build all strike events first, then fire only the first one.
          // Subsequent strikes are queued in pendingIncomingRef and started
          // one-by-one as each preceding onDone fires.
          const SHIELD_OFFSET = 0.8;
          const allDefStrikes: StrikeEvent[] = [];

          for (const atk of incomingAttackers) {
            const atkPos  = posMap.get(atk.name);
            const fromPos: [number, number, number] = atkPos
              ? [atkPos[0], atkPos[1] + 0.3, atkPos[2]]
              : [myPos[0] + 0.9, myPos[1] + 0.3, myPos[2] + 0.9];
            const baseToPos: [number, number, number] = [myPos[0], myPos[1] + 0.3, myPos[2]];

            const dx = fromPos[0] - baseToPos[0];
            const dz = fromPos[2] - baseToPos[2];
            const ld = Math.sqrt(dx * dx + dz * dz);
            const shieldPos: [number, number, number] = ld > 0
              ? [baseToPos[0] + (dx / ld) * SHIELD_OFFSET, baseToPos[1], baseToPos[2] + (dz / ld) * SHIELD_OFFSET]
              : baseToPos;

            allDefStrikes.push({
              id:             `in-def-${atk.name}-${Date.now()}`,
              fromPos,
              toPos:          shieldPos,
              targetDefended: true,
              targetHit:      false,
              isIncoming:     true,
              flybackPos:     atkPos ? fromPos : undefined,
            });
          }

          if (allDefStrikes.length > 0) {
            // Fire the first strike immediately with its pre-shown shield
            const first    = allDefStrikes[0];
            const firstSid = `def-shield-${first.id}`;
            const firstRotY = Math.atan2(first.fromPos[0] - first.toPos[0], first.fromPos[2] - first.toPos[2]);
            newStrikes.push(first);
            newImpactShields.push({ id: firstSid, pos: first.toPos, rotY: firstRotY });
            const fullDurMs = (HOLD_DUR + RETREAT_DUR + FLYBACK_DUR) * 1000 + 350;
            setTimeout(() => setImpactShields((s) => s.filter((x) => x.id !== firstSid)), fullDurMs);
            // Queue the rest to play sequentially after each onDone
            pendingIncomingRef.current = allDefStrikes.slice(1);
          }
        } else if (hpLost) {
          // Not defending (or server has no attacker info) — single sword hit
          const attacker = incomingAttackers[0];
          const atkPos   = attacker ? posMap.get(attacker.name) : undefined;
          const fromPos: [number, number, number] = atkPos
            ? [atkPos[0], atkPos[1] + 0.3, atkPos[2]]
            : [myPos[0] + 0.9, myPos[1] + 0.3, myPos[2] + 0.9];
          const toPos: [number, number, number] = [myPos[0], myPos[1] + 0.3, myPos[2]];
          const flybackPos: [number, number, number] | undefined = atkPos ? fromPos : undefined;
          newStrikes.push({
            id:             `in-${Date.now()}`,
            fromPos,
            toPos,
            targetDefended: false,
            targetHit:      true,
            isIncoming:     true,
            flybackPos,
          });
        }
      }

      // ── Aura flash for every player who lost HP this round ───────────────
      prev.players.forEach((prevP) => {
        const newP = state.players.find((p) => p.name === prevP.name);
        if (!newP) return;
        if ((newP.hp ?? Infinity) < (prevP.hp ?? Infinity)) {
          const pos = posMap.get(prevP.name);
          if (pos) newFlashes.push({ id: `fl-${prevP.name}-${Date.now()}`, position: pos });
        }
      });

      if (newStrikes.length)       setStrikeEvents((ev) => [...ev, ...newStrikes]);
      if (newImpactShields.length) setImpactShields((s) => [...s, ...newImpactShields]);
      if (newFlashes.length) {
        setHitFlashEvents((ev) => [...ev, ...newFlashes]);
        newFlashes.forEach((f) =>
          setTimeout(
            () => setHitFlashEvents((ev) => ev.filter((h) => h.id !== f.id)),
            650,
          ),
        );
      }
    }

    prevStateRef.current = state;
  }, [state, playerName]); // posMapRef is a stable ref — no dep needed

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
        <Html position={[0, 3.9, 0]} center distanceFactor={3} zIndexRange={[0, 0]}>
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
            bossHp={isBoss ? player.hp : undefined}
            bossMaxHp={isBoss ? BOSS_MAX_HP : undefined}
            bossTitle={isBoss ? player.title : undefined}
            frogSkinUrl={skinMap.get(player.name)}
            showAttackButton={showAttackButtons && isOpponent && !isDead}
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
            showShield={isOwnPlayer && currentAction === 'defend'}
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

      {/* Ready sword — floats near the attack target while local player has it selected */}
      {currentAction === 'attack' && attackTarget && (() => {
        const myPos  = posMapRef.current.get(playerName);
        const tgtPos = posMapRef.current.get(attackTarget);
        if (!myPos || !tgtPos) return null;
        const fp: [number, number, number] = [myPos[0],  myPos[1]  + 0.3, myPos[2]];
        const tp: [number, number, number] = [tgtPos[0], tgtPos[1] + 0.3, tgtPos[2]];
        return (
          <SwordEffect
            key={`ready-${attackTarget}`}
            fromPosition={fp}
            toPosition={tp}
            mode="ready"
          />
        );
      })()}

      {/* Executing sword strike animations (triggered at round transition) */}
      {strikeEvents.map((ev) => (
        <SwordEffect
          key={ev.id}
          fromPosition={ev.fromPos}
          toPosition={ev.toPos}
          mode="execute"
          flybackPosition={ev.flybackPos}
          onStrike={() => {
            if (ev.targetDefended && !ev.isIncoming) {
              // ev.toPos is already the shield position (in front of the defender).
              const rotY = Math.atan2(ev.fromPos[0] - ev.toPos[0], ev.fromPos[2] - ev.toPos[2]);
              const sid  = `shield-${ev.id}`;
              setImpactShields((s) => [...s, { id: sid, pos: ev.toPos, rotY }]);
              // Keep the shield visible through the retreat + flyback phases
              const holdMs = (HOLD_DUR + RETREAT_DUR + FLYBACK_DUR) * 1000 + 200;
              setTimeout(() => setImpactShields((s) => s.filter((x) => x.id !== sid)), holdMs);
            }
          }}
          onDone={() => {
            setStrikeEvents((s) => s.filter((x) => x.id !== ev.id));
            // If this was an incoming defended strike, start the next queued one
            if (ev.isIncoming && ev.targetDefended && pendingIncomingRef.current.length > 0) {
              const [next, ...rest] = pendingIncomingRef.current;
              pendingIncomingRef.current = rest;
              setStrikeEvents((s) => [...s, next]);
              // Show the shield for the next strike just as the sword begins
              const sid    = `def-shield-${next.id}`;
              const rotY   = Math.atan2(next.fromPos[0] - next.toPos[0], next.fromPos[2] - next.toPos[2]);
              setImpactShields((s) => [...s, { id: sid, pos: next.toPos, rotY }]);
              const fullDurMs = (HOLD_DUR + RETREAT_DUR + FLYBACK_DUR) * 1000 + 350;
              setTimeout(() => setImpactShields((s) => s.filter((x) => x.id !== sid)), fullDurMs);
            }
          }}
        />
      ))}

      {/* Impact shield — appears at the target's position when a defended player is struck */}
      {impactShields.map((s) => (
        <ShieldEffect key={s.id} localSpace={false} worldPosition={s.pos} worldRotationY={s.rotY} />
      ))}

      {/* Red aura — expands and fades around any character that takes damage */}
      {hitFlashEvents.map((f) => (
        <AuraFlash key={f.id} position={f.position} />
      ))}

      <WinnerCrown worldPosition={crownPosition} />
      <WellCrown worldPosition={wellCrownPosition} />
      <Environment preset="sunset" />
    </>
  );
}
