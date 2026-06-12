'use client';

import { useThree, useFrame } from '@react-three/fiber';
import { Html, Environment, useGLTF } from '@react-three/drei';
import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import * as THREE from 'three';
import Temple from '@/components/temple';
import SeaAndSky from '@/components/lobby/SeaAndSky';
import Table from '@/components/Table';
import PlayerV1 from '@/components/Playerv1';
import ShieldEffect from '@/components/lobby/ShieldEffect';
import SwordEffect, { STRIKE_DUR, HOLD_DUR, RETREAT_DUR, BOUNCE_DUR } from '@/components/lobby/SwordEffect';
import WellRewardEffect, { preloadWellRewardModels, WELL_REWARD_FLIGHT_DUR, type WellRewardType } from '@/components/lobby/WellRewardEffect';
import WellSplashEffect from '@/components/lobby/WellSplashEffect';
import WellGlowEffect from '@/components/lobby/WellGlowEffect';
import InGameGuide from '@/components/lobby/InGameGuide';
import { guideGlowClass, type GuideHighlights } from '@/lib/guideHighlights';
import { getSocket, getPlayerMessages } from '@/lib/api';
import { parseCombatMessages } from '@/lib/parseCombatMessages';
import { parseWellReward, glowForReward, type WellRewardComponent, type WellGlow } from '@/lib/parseWellReward';
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
import type { LobbyState } from '@/types/game';


const LOBBY_LOOKAT = new THREE.Vector3(...SCENE_CENTER);

// ── Sea & sky tuning ────────────────────────────────────────────────────────
// Single source of truth — edit these to move the water / sun. (Don't also set
// the same props on <SeaAndSky/> below, or the prop would override these.)
const SEA_LEVEL = 2;                       // water height; lower = sea drops
const SUN_POSITION: [number, number, number] = [100, 20, 100]; // sun direction

// Camera controller — snaps to target immediately on mount so Html buttons appear in the
// correct screen position before any models load, then tracks resize / pan smoothly.
function CameraFlyIn() {
  const { camera, size } = useThree();
  // Start at the target position (not the Canvas default [33,26,33]) so there is no fly-in
  // delay and Html elements are projected correctly on the very first frame.
  const [tx, ty, tz] = getCameraTargetPosition(size.width, size.height);
  const currentPosition = useRef(new THREE.Vector3(tx, ty, tz));
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
  const { scene } = useGLTF('/models/crowns/well_crown_v1.glb');
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


// Holds only the GLB-dependent parts of a player slot so it can be Suspense-wrapped
// independently of the HTML UI (names / action buttons) rendered by PlayerWithName.
function PlayerModelLayer({ modelUrl, isBoss, isAnimating, showShield }: {
  modelUrl: string;
  isBoss: boolean;
  isAnimating: boolean;
  showShield?: boolean;
}) {
  return (
    <>
      <PlayerV1
        url={modelUrl}
        scale={isBoss ? 1.44 : 0.6}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        isAnimating={isAnimating}
      />
      {showShield && <ShieldEffect />}
    </>
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
  onDefend,
  showShield,
  highlight,
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
  onDefend?: () => void;
  showShield?: boolean;
  highlight?: GuideHighlights;
}) {
  const modelUrl = name === 'TURTLE' ? '/models/turtlev01.glb' : isBoss ? '/models/hades/hades_v3-ld.glb' : (frogSkinUrl ?? skinUrl('frog_green_v1'));
  // Welcome-tour highlights — glow the real button(s) the current slide points at.
  const hl = highlight ?? {};
  const hlAttack = guideGlowClass(hl.attack);
  const hlDefend = guideGlowClass(hl.defend);
  return (
    <group position={position} rotation={rotation}>
      {/* 3D model — lazy; suspends until GLB is ready */}
      <Suspense fallback={null}>
        <PlayerModelLayer modelUrl={modelUrl} isBoss={!!isBoss} isAnimating={isAnimating} showShield={showShield} />
      </Suspense>
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
        <Html position={[0, 0.9, 0]} center distanceFactor={3.45} zIndexRange={[0, 0]}>
          <button
            onClick={onAttack}
            className={`${actionCue} ${hlAttack}`}
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
        <Html position={[0, -0.1, 0]} center distanceFactor={3.45} zIndexRange={[0, 0]}>
          <button
            onClick={onDefend}
            className={`${actionCue} ${hlDefend}`}
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
      {/* Boss HP card — floats above the Hades model in world space, tracks with camera.
          zIndexRange sits above the lost-soul/action buttons ([0,0]) so clicks land here
          first, but stays below the CSS overlay panels (waiting lobby + round messages,
          which use Tailwind z-10/z-20) so the card renders beneath them rather than
          covering them. */}
      {isBoss && bossHp !== undefined && bossMaxHp !== undefined && (
        <Html position={[0, -0.5, 0]} center distanceFactor={4.2} zIndexRange={[5, 5]}>
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

// GLB-only sub-component so Suspense can wrap the model without blocking the HTML labels.
function LostSoulMesh() {
  const { scene } = useGLTF('/models/lost_soul_v2.glb');
  const sceneClone = useMemo(() => scene.clone(), [scene]);
  return <primitive object={sceneClone} scale={0.4} />;
}

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
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.8 + position[0]) * 0.1;
    }
  });

  return (
    <group ref={ref} position={position}>
      {/* 3D model — lazy; name label and attack button render immediately */}
      <Suspense fallback={null}>
        <LostSoulMesh />
      </Suspense>
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
        <Html position={[0, 0.75, 0]} center distanceFactor={3.45} zIndexRange={[0, 0]}>
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
useGLTF.preload('/models/crowns/well_crown_v1.glb');
useGLTF.preload('/models/shields/shield_animation-ld.glb');
useGLTF.preload('/models/swords/sword_animation-ld.glb');
preloadWellRewardModels();
// Frog skins are preloaded on-demand per lobby (see usePreloadLobbySkins below).
// Previously we eagerly preloaded all 13 skins (~92 MB) on app start.

type StrikeEvent = {
  id: string;
  fromPos: [number, number, number];
  toPos:   [number, number, number];
  targetDefended: boolean;
  targetHit: boolean;
  isIncoming: boolean;
  // 'retreat' = normal hit, 'stop' = blocked no reflect, 'bounce' = blocked + reflected
  postImpact: 'retreat' | 'stop' | 'bounce';
  // World-space position to aura-flash on strike (undefined = no flash)
  flashPosition?: [number, number, number];
  // For bounce-back strikes: where to aura-flash when the bounce lands on the attacker
  bounceFlashPos?: [number, number, number];
};

type HitFlashEvent = {
  id: string;
  position: [number, number, number];
};

type WellRewardEvent = {
  id: string;
  type: WellRewardType;
  fromPos: [number, number, number];
  toPos:   [number, number, number];
  delay:   number;
};

// Splash + rarity glow that play on the well when you win it.
type WellWinFx = {
  id: string;
  glow: WellGlow | null; // null = common reward, no glow
};

// Where rewards spout out of the well (center of the table, just above the rim).
const WELL_SPOUT_POSITION: [number, number, number] = [0, 3.45, 0];
// Where the splash erupts (well mouth) and where the rarity glow lies (under it).
const WELL_SPLASH_POSITION: [number, number, number] = [0, 3.4, 0];
const WELL_GLOW_POSITION:   [number, number, number] = [0, 2.95, 0];
// Lifetime of the splash/glow before removal (ms) — also how long incoming
// attacks wait when a win has no flying reward models (e.g. a 0-coin steal).
const WELL_FX_DURATION = 1600;
// Stagger between successive reward instances (seconds).
const WELL_REWARD_STAGGER = 0.18;

// A steal source: one player's seat plus how many coins were stolen from them.
type StealSource = { pos: [number, number, number]; count: number };

// Build the per-instance reward animations for a won well result. A result can
// contain several components (e.g. 2 gold + 2 hp), each spawning `count` models.
//  - simple rewards: models arch from the well onto the winner.
//  - 'steal': one coin flies from each player to the winner, one per coin stolen.
function buildWellRewardEvents(
  components: WellRewardComponent[],
  winnerPos: [number, number, number],
  stealSources: StealSource[],
): WellRewardEvent[] {
  const land: [number, number, number] = [winnerPos[0], winnerPos[1] + 0.5, winnerPos[2]];
  const stamp = Date.now();
  const events: WellRewardEvent[] = [];
  let seq = 0; // running index so every instance staggers off the same clock

  for (const reward of components) {
    if (reward.type === 'steal') {
      // Fall back to the well only if we somehow have no player sources.
      const sources: StealSource[] = stealSources.length
        ? stealSources
        : [{ pos: WELL_SPOUT_POSITION, count: Math.max(1, reward.count) }];
      sources.forEach((src, si) => {
        const from: [number, number, number] = [src.pos[0], src.pos[1] + 0.3, src.pos[2]];
        const coins = Math.max(0, src.count); // broke players yield no coin
        for (let i = 0; i < coins; i++) {
          // Spread coins from the same player so they don't perfectly overlap.
          const jitter = coins > 1 ? (i - (coins - 1) / 2) * 0.15 : 0;
          events.push({
            id:   `well-steal-${stamp}-${si}-${i}`,
            type: 'steal',
            fromPos: [from[0] + jitter, from[1], from[2]],
            toPos:   [land[0] + jitter, land[1], land[2]],
            delay:   seq++ * WELL_REWARD_STAGGER,
          });
        }
      });
      continue;
    }

    const n = Math.max(1, reward.count);
    for (let i = 0; i < n; i++) {
      // Spread multiples slightly so they don't perfectly overlap on landing.
      const jitter = n > 1 ? (i - (n - 1) / 2) * 0.18 : 0;
      events.push({
        id:   `well-${reward.type}-${stamp}-${i}`,
        type: reward.type,
        fromPos: WELL_SPOUT_POSITION,
        toPos:   [land[0] + jitter, land[1], land[2] + jitter],
        delay:   seq++ * WELL_REWARD_STAGGER,
      });
    }
  }

  return events;
}

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
  /** Welcome-tour highlights, lifted to the page so the overlay can glow the
   *  resource cards too. The 3D scene uses it for attack/defend/well. */
  guideHighlight?: GuideHighlights;
  onGuideHighlightChange?: (h: GuideHighlights) => void;
};

export default function LobbyScene({ state, playerName, lobbyId, currentAction, attackTarget, onAttackSelect, onActionChange, guideHighlight = {}, onGuideHighlightChange }: LobbySceneProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // ----- Animation state -----
  const prevStateRef  = useRef<LobbyState | null>(null);
  const posMapRef     = useRef(new Map<string, [number, number, number]>());
  const [strikeEvents,  setStrikeEvents]  = useState<StrikeEvent[]>([]);
  const [hitFlashEvents, setHitFlashEvents] = useState<HitFlashEvent[]>([]);
  const [impactShields, setImpactShields] = useState<ImpactShield[]>([]);
  const [wellRewardEvents, setWellRewardEvents] = useState<WellRewardEvent[]>([]);
  const [wellWinFx, setWellWinFx] = useState<WellWinFx[]>([]);
  // Timeout IDs for staggered incoming defended strikes (cleared each new round)
  const staggerTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);


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

  // Detect round transitions and spawn 3D animation events based on personal messages.
  useEffect(() => {
    if (!state) { prevStateRef.current = null; return; }
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    if (!prev || state.round <= (prev.round ?? 0) || state.round <= 0) return;

    staggerTimeoutsRef.current.forEach(clearTimeout);
    staggerTimeoutsRef.current = [];

    let cancelled = false;

    getPlayerMessages(lobbyId, playerName).then((json) => {
      if (cancelled) return;
      const combat = parseCombatMessages(json.messages ?? []);
      const posMap = posMapRef.current;
      const myPos  = posMap.get(playerName);

      const newStrikes:       StrikeEvent[]  = [];
      const newImpactShields: ImpactShield[] = [];

      // ── Outgoing: local player attacked someone ──────────────────────────
      if (combat.outgoing) {
        const { target, outcome } = combat.outgoing;
        const tgtPos = posMap.get(target);
        if (myPos && tgtPos) {
          const tgtDefended = outcome === 'blocked' || outcome === 'reflected' || outcome === 'instakill_blocked';
          const tgtHit      = outcome === 'hit' || outcome === 'instakill';
          const reflected   = outcome === 'reflected';

          const fromPos: [number, number, number]    = [myPos[0],  myPos[1]  + 0.3, myPos[2]];
          const baseToPos: [number, number, number]  = [tgtPos[0], tgtPos[1] + 0.3, tgtPos[2]];

          const SHIELD_OFFSET = 0.8;
          let toPos = baseToPos;
          if (tgtDefended) {
            const dx = fromPos[0] - baseToPos[0];
            const dz = fromPos[2] - baseToPos[2];
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0) {
              toPos = [baseToPos[0] + (dx / len) * SHIELD_OFFSET, baseToPos[1], baseToPos[2] + (dz / len) * SHIELD_OFFSET];
            }
          }

          newStrikes.push({
            id: `out-${Date.now()}`, fromPos, toPos,
            targetDefended: tgtDefended, targetHit: tgtHit, isIncoming: false,
            postImpact:     tgtDefended ? (reflected ? 'bounce' : 'stop') : 'retreat',
            flashPosition:  tgtHit    ? tgtPos : undefined,
            bounceFlashPos: reflected ? myPos  : undefined,
          });
        }
      }

      // ── Well reward: only for the player who actually won the well ────────
      // (steal *victims* also receive a "Steal-all!" line, so gate on raidwinner.)
      // Spawned first; incoming attacks below are delayed until it finishes so
      // the two don't play at once and confuse the player.
      let wellDelayMs = 0;
      if (myPos && state.raidwinner === playerName) {
        const components = parseWellReward(json.messages ?? []);
        if (components.length) {
          // Splash + rarity glow on the well itself.
          const fxId = `wellfx-${Date.now()}`;
          setWellWinFx((fx) => [...fx, { id: fxId, glow: glowForReward(components) }]);
          staggerTimeoutsRef.current.push(
            setTimeout(() => setWellWinFx((fx) => fx.filter((x) => x.id !== fxId)), WELL_FX_DURATION),
          );

          // For steal: one coin per stolen coin, flying from each victim's seat.
          const stealVictims = components.find((c) => c.type === 'steal')?.victims ?? [];
          const stealSources = stealVictims
            .map((v) => ({ pos: posMap.get(v.name), count: v.amount }))
            .filter((s): s is { pos: [number, number, number]; count: number } => !!s.pos);
          const rewardEvents = buildWellRewardEvents(components, myPos, stealSources);
          const rewardDurMs = rewardEvents.length
            ? (Math.max(...rewardEvents.map((e) => e.delay)) + WELL_REWARD_FLIGHT_DUR) * 1000
            : 0;
          if (rewardEvents.length) setWellRewardEvents((ev) => [...ev, ...rewardEvents]);
          // Hold incoming attacks until both the splash/glow and any reward
          // models have finished.
          wellDelayMs = Math.max(rewardDurMs, WELL_FX_DURATION);
        }
      }

      // ── Incoming: local player was attacked ──────────────────────────────
      if (myPos && combat.incoming.length > 0) {
        const SHIELD_OFFSET = 0.8;
        const ONE_DEF_MS    = (STRIKE_DUR + HOLD_DUR + BOUNCE_DUR)  * 1000;
        const ONE_HIT_MS    = (STRIKE_DUR + HOLD_DUR + RETREAT_DUR) * 1000;
        const GAP_MS        = 200;
        // Start after the well animation so incoming swords don't overlap it.
        let staggerMs       = wellDelayMs;

        combat.incoming.forEach((inc, i) => {
          const atkPos  = inc.attacker ? posMap.get(inc.attacker) : undefined;
          const fromPos: [number, number, number] = atkPos
            ? [atkPos[0], atkPos[1] + 0.3, atkPos[2]]
            : [myPos[0] + 0.9, myPos[1] + 0.3, myPos[2] + 0.9];
          const baseToPos: [number, number, number] = [myPos[0], myPos[1] + 0.3, myPos[2]];

          const isDefended   = inc.outcome === 'blocked' || inc.outcome === 'reflected_back' || inc.outcome === 'instakill_blocked';
          const atkReflected = inc.outcome === 'reflected_back';

          let toPos = baseToPos;
          if (isDefended) {
            const dx = fromPos[0] - baseToPos[0];
            const dz = fromPos[2] - baseToPos[2];
            const ld = Math.sqrt(dx * dx + dz * dz);
            if (ld > 0) {
              toPos = [baseToPos[0] + (dx / ld) * SHIELD_OFFSET, baseToPos[1], baseToPos[2] + (dz / ld) * SHIELD_OFFSET];
            }
          }

          const strike: StrikeEvent = {
            id:             `in-${inc.attacker ?? 'anon'}-${Date.now()}-${i}`,
            fromPos, toPos,
            targetDefended: isDefended,
            targetHit:      !isDefended,
            isIncoming:     true,
            postImpact:     isDefended ? (atkReflected ? 'bounce' : 'stop') : 'retreat',
            flashPosition:  !isDefended         ? myPos  : undefined,
            bounceFlashPos: atkReflected && atkPos ? atkPos : undefined,
          };

          const ONE_ANIM_MS = isDefended ? ONE_DEF_MS : ONE_HIT_MS;
          const delay       = staggerMs;
          staggerMs += ONE_ANIM_MS + GAP_MS;

          if (delay === 0) {
            newStrikes.push(strike);
            if (isDefended) {
              const sid       = `def-shield-${strike.id}`;
              const shieldDur = ONE_DEF_MS + 350;
              const rotY      = Math.atan2(fromPos[0] - baseToPos[0], fromPos[2] - baseToPos[2]);
              newImpactShields.push({ id: sid, pos: toPos, rotY });
              staggerTimeoutsRef.current.push(
                setTimeout(() => setImpactShields((s) => s.filter((x) => x.id !== sid)), shieldDur),
              );
            }
          } else {
            staggerTimeoutsRef.current.push(
              setTimeout(() => {
                setStrikeEvents((s) => [...s, strike]);
                if (isDefended) {
                  const sid       = `def-shield-${strike.id}`;
                  const shieldDur = ONE_DEF_MS + 350;
                  const rotY      = Math.atan2(fromPos[0] - baseToPos[0], fromPos[2] - baseToPos[2]);
                  setImpactShields((s) => [...s, { id: sid, pos: toPos, rotY }]);
                  staggerTimeoutsRef.current.push(
                    setTimeout(() => setImpactShields((s) => s.filter((x) => x.id !== sid)), shieldDur),
                  );
                }
              }, delay),
            );
          }
        });
      }

      // ── Witnessed eliminations: flash on the victim ───────────────────────
      const SWORD_IMPACT_MS = (STRIKE_DUR + HOLD_DUR) * 1000;
      combat.witnessedEliminations.forEach((we, i) => {
        const victimPos = posMap.get(we.victim);
        if (!victimPos) return;
        const delay = wellDelayMs + SWORD_IMPACT_MS + i * 450;
        staggerTimeoutsRef.current.push(
          setTimeout(() => {
            const f = { id: `fl-${we.victim}-${Date.now()}`, position: victimPos };
            setHitFlashEvents((ev) => [...ev, f]);
            staggerTimeoutsRef.current.push(
              setTimeout(() => setHitFlashEvents((ev) => ev.filter((h) => h.id !== f.id)), 650),
            );
          }, delay),
        );
      });

      if (newStrikes.length)       setStrikeEvents((ev) => [...ev, ...newStrikes]);
      if (newImpactShields.length) setImpactShields((s) => [...s, ...newImpactShields]);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [state, playerName, lobbyId]); // posMapRef is a stable ref — no dep needed

  // ── Debug: preview well-reward animations without a live game ─────────────
  // Append `?welltest=<types>` to the lobby URL to loop the animation(s) onto
  // your own player for size/rotation tuning. Examples:
  //   ?welltest=gold              ?welltest=steal
  //   ?welltest=health:2,gold:2   ?welltest=sword,deny,info,instakill
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('welltest');
    if (!raw) return;

    const components: WellRewardComponent[] = raw.split(',').map((part) => {
      const [type, count] = part.trim().split(':');
      return { type: type as WellRewardType, count: count ? parseInt(count, 10) : 1 };
    }).filter((c) => !!c.type);
    if (!components.length) return;

    const fire = () => {
      const myPos = posMapRef.current.get(playerName);
      if (!myPos) return;
      // Splash + rarity glow on the well.
      const fxId = `wellfx-dbg-${Date.now()}`;
      setWellWinFx((fx) => [...fx, { id: fxId, glow: glowForReward(components) }]);
      setTimeout(() => setWellWinFx((fx) => fx.filter((x) => x.id !== fxId)), WELL_FX_DURATION);
      // Fake steal sources: every other player coughs up `count` coins (default 1).
      const stealCount = components.find((c) => c.type === 'steal')?.count ?? 1;
      const stealSources = Array.from(posMapRef.current.entries())
        .filter(([name]) => name !== playerName)
        .map(([, pos]) => ({ pos, count: stealCount }));
      setWellRewardEvents((ev) => [...ev, ...buildWellRewardEvents(components, myPos, stealSources)]);
    };
    fire();
    const interval = setInterval(fire, 4000);
    return () => clearInterval(interval);
  }, [playerName]);

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

  return (
    <>
      <CameraFlyIn />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow />

      {/* Sky dome + sea plane — the sea horizon sits where they meet in the distance.
          Tweak seaLevel to line the water up with the temple/player base. */}
      <SeaAndSky seaLevel={SEA_LEVEL} sunPosition={SUN_POSITION} />

      {/* Stage 1: Temple — background scenery, loads first.
          NOTE: the model's origin sits on one of its corner columns rather than its
          center, so position/scale will likely need tweaking to frame it nicely. */}
      <Suspense fallback={null}>
        <Temple scale={1} position={[0, 4, 0]} />
      </Suspense>

      {/* Player names, action buttons, and resource cards — immediate, no model dependency.
          Each PlayerWithName handles its own internal Suspense for the GLB. */}
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
            showAttackButton={showAttackButtons && isOpponent && !isDead && (!isBossFight || isBoss)}
            onAttack={() => handleAttack(player.name)}
            isAttackSelected={currentAction === 'attack' && attackTarget === player.name}
            actionCue={actionCue}
            chatBubble={chatBubbles.get(player.name)}
            showOwnActions={isOwnPlayer && showAttackButtons && !isDead}
            currentAction={currentAction}
            onDefend={handleDefend}
            showShield={isOwnPlayer && currentAction === 'defend'}
            highlight={guideHighlight}
          />
        );
      })}

      {/* Lost soul names + attack buttons — immediate; mesh loads lazily inside LostSoulModel */}
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

      {/* Well (raid) button — immediate; the Table GLB loads separately below */}
      {showAttackButtons && (
        <Html position={[0, 3.3, 0]} center distanceFactor={3.45} zIndexRange={[0, 0]}>
          <button
            onClick={handleRaid}
            className={guideGlowClass(guideHighlight?.well)}
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

      {/* In-game welcome tour — bubbles anchored beside the elements they describe */}
      <InGameGuide
        ownPosition={PLAYER_POSITIONS[players.findIndex((p) => p.name === playerName)]?.position ?? null}
        gameStarted={gameStarted && !!myPlayer}
        onHighlightChange={onGuideHighlightChange}
      />

      {/* Stage 2: Well/Table model */}
      <Suspense fallback={null}>
        <Table position={TABLE_POSITION} scale={1.2} />
      </Suspense>

      {/* Stage 4: Well/lobby crown (floats above current well winner) */}
      <Suspense fallback={null}>
        <WellCrown worldPosition={wellCrownPosition} />
      </Suspense>

      {/* Stage 5: Sword and shield combat effects */}
      <Suspense fallback={null}>
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

        {strikeEvents.map((ev) => (
          <SwordEffect
            key={ev.id}
            fromPosition={ev.fromPos}
            toPosition={ev.toPos}
            mode="execute"
            postImpact={ev.postImpact}
            onStrike={() => {
              if (ev.targetDefended && !ev.isIncoming) {
                const rotY = Math.atan2(ev.fromPos[0] - ev.toPos[0], ev.fromPos[2] - ev.toPos[2]);
                const sid  = `shield-${ev.id}`;
                setImpactShields((s) => [...s, { id: sid, pos: ev.toPos, rotY }]);
                const postDurSec = ev.postImpact === 'bounce' ? BOUNCE_DUR : 0;
                const holdMs = (HOLD_DUR + postDurSec) * 1000 + 200;
                setTimeout(() => setImpactShields((s) => s.filter((x) => x.id !== sid)), holdMs);
              }
              if (ev.flashPosition) {
                const fid = `fl-sword-${ev.id}`;
                setHitFlashEvents((s) => [...s, { id: fid, position: ev.flashPosition! }]);
                setTimeout(() => setHitFlashEvents((s) => s.filter((x) => x.id !== fid)), 650);
              }
            }}
            onDone={() => {
              if (ev.postImpact === 'bounce' && ev.bounceFlashPos) {
                const fid = `fl-bounce-${ev.id}`;
                setHitFlashEvents((s) => [...s, { id: fid, position: ev.bounceFlashPos! }]);
                setTimeout(() => setHitFlashEvents((s) => s.filter((x) => x.id !== fid)), 650);
              }
              setStrikeEvents((s) => s.filter((x) => x.id !== ev.id));
            }}
          />
        ))}

        {impactShields.map((s) => (
          <ShieldEffect key={s.id} localSpace={false} worldPosition={s.pos} worldRotationY={s.rotY} />
        ))}

        {/* Well rewards arching out of the well onto the winner */}
        {wellRewardEvents.map((ev) => (
          <WellRewardEffect
            key={ev.id}
            type={ev.type}
            fromPosition={ev.fromPos}
            toPosition={ev.toPos}
            delay={ev.delay}
            onDone={() => setWellRewardEvents((s) => s.filter((x) => x.id !== ev.id))}
          />
        ))}
      </Suspense>

      {/* Well-win splash + rarity glow — pure geometry/particles, render immediately */}
      {wellWinFx.map((fx) => (
        <group key={fx.id}>
          <WellSplashEffect position={WELL_SPLASH_POSITION} />
          {fx.glow && <WellGlowEffect position={WELL_GLOW_POSITION} color={fx.glow} />}
        </group>
      ))}

      {/* Red aura — pure geometry, no model; renders immediately */}
      {hitFlashEvents.map((f) => (
        <AuraFlash key={f.id} position={f.position} />
      ))}

      {/* Stage 6: Game-winning crown */}
      <Suspense fallback={null}>
        <WinnerCrown worldPosition={crownPosition} />
      </Suspense>

      <Suspense fallback={null}>
        <Environment preset="sunset" />
      </Suspense>

    </>
  );
}
