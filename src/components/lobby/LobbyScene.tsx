'use client';

import { useThree, useFrame } from '@react-three/fiber';
import { Html, Environment, useGLTF } from '@react-three/drei';
import { useRef, useMemo, useState, useEffect, useCallback, Suspense } from 'react';
import * as THREE from 'three';
import Temple from '@/components/temple';
import SeaAndSky from '@/components/lobby/SeaAndSky';
import Table from '@/components/Table';
import ShieldEffect from '@/components/lobby/ShieldEffect';
import SwordEffect, { STRIKE_DUR, HOLD_DUR, RETREAT_DUR, BOUNCE_DUR } from '@/components/lobby/SwordEffect';
import WellRewardEffect, { preloadWellRewardModels, WELL_REWARD_FLIGHT_DUR, type WellRewardType } from '@/components/lobby/WellRewardEffect';
import WellSplashEffect from '@/components/lobby/WellSplashEffect';
import WellGlowEffect, { WellGlowLight, type WellGlowColor } from '@/components/lobby/WellGlowEffect';
import KillFireEffect from '@/components/lobby/KillFireEffect';
import { PlayerWithName, LostSoulModel, WinnerCrown, WellCrown, LOST_SOUL_POSITIONS, BOSS_MAX_HP } from '@/components/lobby/PlayerAvatars';
import { guideGlowClass, type GuideHighlights } from '@/lib/guideHighlights';
import { getSocket } from '@/lib/socket';
import { useGameEvents } from '@/lib/useGameEvents';
import { emitHpFx, type HpFxEvent } from '@/lib/resourceFx';
import { combatFromEvents, wellRewardFromEvents, glowForReward, type WellRewardComponent } from '@/lib/gameEvents';
import { assignSkins } from '@/lib/frogSkins';
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
import { useLobbyGame } from '@/lib/useLobbyGame';
import type { LobbyState } from '@/types/game';


const LOBBY_LOOKAT = new THREE.Vector3(...SCENE_CENTER);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
// Scratch vectors reused by CameraFlyIn's frame loop — allocating these per
// frame caused steady GC pressure (periodic hitches).
const camTarget = new THREE.Vector3();
const camArm    = new THREE.Vector3();
const camRight  = new THREE.Vector3();

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

  useFrame((_, delta) => {
    const [x, y, z] = getCameraTargetPosition(size.width, size.height);
    camTarget.set(x, y, z);
    // Frame-rate independent ease toward the target (0.025/frame at 60 fps ≈ lambda 1.5)
    currentPosition.current.lerp(camTarget, 1 - Math.exp(-1.5 * delta));

    // Apply pan offset by orbiting around the look-at point, then scale by zoom
    camArm.copy(currentPosition.current).sub(LOBBY_LOOKAT);
    camArm.applyAxisAngle(WORLD_UP, panOffset.current.yaw);
    camRight.crossVectors(WORLD_UP, camArm).normalize();
    camArm.applyAxisAngle(camRight, panOffset.current.pitch);
    camArm.multiplyScalar(panOffset.current.zoom);

    camera.position.copy(LOBBY_LOOKAT).add(camArm);
    camera.lookAt(LOBBY_LOOKAT);

    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = getResponsiveFov(size.width, size.height);
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}

const CHAT_BUBBLE_DURATION_MS = 4000;

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
  // For incoming strikes: HP-card feedback to emit at the impact moment.
  incomingFx?: HpFxEvent;
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

// A fiery red glow that erupts under a character when a kill is made. Seen by the
// killer (under themselves), the witness and the victim (under the killer).
type KillFireEvent = {
  id:  string;
  pos: [number, number, number];
};

// Text shown to the lone witness of a kill, naming the killer in a fiery style.
type KillBanner = {
  id:     string;
  killer: string;
  pos:    [number, number, number];
};

// Splash + glow that play on the well. A win shows a splash plus the rarity
// glow (or none for common rewards); choosing the well but losing shows just a
// small red glow.
type WellWinFx = {
  id: string;
  splash: boolean;
  glow: WellGlowColor | null;
  glowRadius?: number;
  glowIntensity?: number;
  glowStartMs?: number; // performance.now() at spawn — drives the persistent light
};
// Size + brightness of the small red "you chose the well but lost" glow.
const WELL_LOSS_GLOW_RADIUS = 0.9;
const WELL_LOSS_GLOW_INTENSITY = 0.33;

// Where rewards spout out of the well (center of the table, just above the rim).
const WELL_SPOUT_POSITION: [number, number, number] = [0, 2.4, 0];
// Where the splash erupts (well mouth) and where the rarity glow lies (under it).
const WELL_SPLASH_POSITION: [number, number, number] = [0, 2.4, 0];
const WELL_GLOW_POSITION:   [number, number, number] = [0, 2.3, 0];
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
  const land: [number, number, number] = [winnerPos[0], winnerPos[1], winnerPos[2]];
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
};

export default function LobbyScene({ state, playerName, lobbyId, currentAction, attackTarget, onAttackSelect, onActionChange, guideHighlight = {} }: LobbySceneProps) {
  // Countdown warning level for the action buttons. We deliberately do NOT
  // store the remaining seconds here — that re-rendered the whole scene every
  // second. The level only changes twice per round ('' → gold → red), and
  // setState with an unchanged value bails out without re-rendering.
  const [warnLevel, setWarnLevel] = useState<'' | 'gold' | 'red'>('');
  // Which lost soul the player clicked. All lost souls share the same server
  // name ("Lost Soul 👻"), so attackTarget alone can't distinguish them — this
  // index picks out the one whose button lights up / the sword hovers at.
  const [selectedSoulIdx, setSelectedSoulIdx] = useState<number | null>(null);

  // ----- Animation state -----
  const prevStateRef  = useRef<LobbyState | null>(null);
  const posMapRef     = useRef(new Map<string, [number, number, number]>());
  const [strikeEvents,  setStrikeEvents]  = useState<StrikeEvent[]>([]);
  const [hitFlashEvents, setHitFlashEvents] = useState<HitFlashEvent[]>([]);
  const [impactShields, setImpactShields] = useState<ImpactShield[]>([]);
  const [wellRewardEvents, setWellRewardEvents] = useState<WellRewardEvent[]>([]);
  const [wellWinFx, setWellWinFx] = useState<WellWinFx[]>([]);
  const [killFireEvents, setKillFireEvents] = useState<KillFireEvent[]>([]);
  const [killBanners, setKillBanners] = useState<KillBanner[]>([]);
  // Timeout IDs for staggered incoming defended strikes (cleared each new round)
  const staggerTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Last round this component has already scheduled combat/well-reward
  // animations for, from useGameEvents' shared fetch (see the effect below).
  const processedEventsRoundRef = useRef(0);
  // Mirrors the local player's chosen action. The parent clears currentAction on
  // the new round, but child effects run before the parent's, so when the
  // round-transition effect fires this still holds the resolved round's choice.
  const currentActionRef = useRef(currentAction);
  currentActionRef.current = currentAction;


  useEffect(() => {
    if (!state?.round_end_time) { setWarnLevel(''); return; }
    const endTime = new Date(state.round_end_time).getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setWarnLevel(s <= 5 ? 'red' : s <= 10 ? 'gold' : '');
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [state?.round_end_time]);

  const allPlayers = useMemo(() => state?.players ?? [], [state?.players]);
  const lostSouls = useMemo(() => allPlayers.filter((p) => p.lost_soul), [allPlayers]);

  const { winner: gameWinner, wellWinner, canAct: showAttackButtons, phase } = useLobbyGame(state, playerName);
  const gameOver = phase === 'gameover';
  const isBossFight = !!state?.boss_fight;
  const gameEvents = useGameEvents(lobbyId, playerName, state?.round, state?.deny_target);

  // Compute skins for all frog players deterministically from their names so
  // every client agrees without any server round-trip.
  const skinMap = useMemo(() => {
    const frogPlayers = allPlayers.filter((p) => !p.boss && !p.lost_soul && p.name !== 'TURTLE');
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
  // Memoized so the slot arrays keep a stable identity across FX/countdown
  // re-renders — PlayerWithName is memo()ed and compares props shallowly.
  const players = useMemo(() => allPlayers
    .filter((p) => !p.lost_soul)
    .sort((a, b) => {
      const score = (p: typeof a) => (p.name === playerName ? 0 : p.boss ? (isBossFight ? 999 : 1) : 2);
      const diff = score(a) - score(b);
      if (diff !== 0) return diff;
      // Stable secondary sort by name so existing players keep their slots when new ones join
      return a.name.localeCompare(b.name);
    })
    .slice(0, MAX_PLAYERS), [allPlayers, playerName, isBossFight]);
  const winner = gameWinner ?? wellWinner;

  // Compute seat positions. In boss fights the boss is pinned to the far side and players
  // spread across the near half, so adding a player never moves Hades.
  const PLAYER_POSITIONS = useMemo(() => {
    if (!isBossFight) return getPlayerPositions(players.length);
    const bossSlot = getBossPosition();
    const nonBossSlots = getBossPlayerPositions(players.filter((p) => !p.boss).length);
    let nbi = 0;
    return players.map((p) => (p.boss ? bossSlot : nonBossSlots[nbi++]));
  }, [players, isBossFight]);

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
  // wellwinner = who last won The Well; crown shows during gameplay (not on game-over screen)
  const wellCrownHolder = (!gameOver && wellWinner) ? wellWinner : null;

  // Well crown hovers above the current well winner for everyone to see
  const wellCrownPosition = useMemo((): [number, number, number] | null => {
    if (!wellCrownHolder) return null;
    const idx = players.findIndex((p) => p.name === wellCrownHolder);
    if (idx < 0) return null;
    return PLAYER_POSITIONS[idx]?.position ?? null;
  }, [wellCrownHolder, players, PLAYER_POSITIONS]);

  const actionCue  = !currentAction && showAttackButtons
    ? (warnLevel === 'red' ? 'warn-blink-red' : warnLevel === 'gold' ? 'warn-blink-gold' : '')
    : '';

  // Detect round transitions: clear stale animation state left over from the
  // previous round and spawn the (synchronous, message-data-free) well-loss
  // glow. Splitting this from the message-driven scheduling below means this
  // half no longer needs to wait on the shared useGameEvents fetch.
  useEffect(() => {
    if (!state) { prevStateRef.current = null; return; }
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    if (!prev || state.round <= (prev.round ?? 0) || state.round <= 0) return;

    staggerTimeoutsRef.current.forEach(clearTimeout);
    staggerTimeoutsRef.current = [];
    // Clear any lingering kill effects from the previous round (their removal
    // timeouts were just cancelled above).
    setKillFireEvents([]);
    setKillBanners([]);

    // Chose The Well but didn't win → small red glow under the well (PvP only).
    // The win case is handled below once we've fetched the reward messages.
    if (currentActionRef.current === 'well' && !state.boss_fight && state.wellwinner !== playerName) {
      const lossId = `wellloss-${Date.now()}`;
      setWellWinFx((fx) => [...fx, { id: lossId, splash: false, glow: 'red', glowRadius: WELL_LOSS_GLOW_RADIUS, glowIntensity: WELL_LOSS_GLOW_INTENSITY, glowStartMs: performance.now() }]);
      staggerTimeoutsRef.current.push(
        setTimeout(() => setWellWinFx((fx) => fx.filter((x) => x.id !== lossId)), WELL_FX_DURATION),
      );
    }
  }, [state, playerName]);

  // Spawn 3D animation events based on personal messages, once this round's
  // events have arrived via the shared useGameEvents fetch. Gated on
  // processedEventsRoundRef (not prevStateRef, which the effect above already
  // consumes for its own "did the round just increase" check) so this only
  // runs once per round -- exactly when that round's data becomes available --
  // rather than on every state_update broadcast for the same round.
  useEffect(() => {
    if (!state || !gameEvents) return;
    if (gameEvents.round !== state.round) return;
    if (gameEvents.round <= processedEventsRoundRef.current) return;
    processedEventsRoundRef.current = gameEvents.round;

    const combat = combatFromEvents(gameEvents.events);
    const posMap = posMapRef.current;
    const myPos  = posMap.get(playerName);

    const newStrikes:       StrikeEvent[]  = [];
    const newImpactShields: ImpactShield[] = [];

    // ── Kill animation helpers ───────────────────────────────────────────
    // A fiery red glow erupts under the killer (seen by killer, witness and
    // victim); the killer additionally sees the victim's coins fly over and
    // their ATK/coin cards tick up. `staggerTimeoutsRef` clears all of these
    // on the next round transition.
    const SWORD_IMPACT_MS = (STRIKE_DUR + HOLD_DUR) * 1000;
    // Coins land ~one travel-arc after launch (WellRewardEffect TRAVEL_DUR).
    const KILL_LOOT_LAND_MS = 850;
    const myNowHp = state.players.find((p) => p.name === playerName)?.hp ?? 1;
    const iDied   = myNowHp <= 0;
    const killStamp = Date.now();
    let killSeq = 0;

    const scheduleKillFire = (pos: [number, number, number], atMs: number) => {
      const id = `killfire-${killStamp}-${killSeq++}`;
      staggerTimeoutsRef.current.push(
        setTimeout(() => setKillFireEvents((e) => [...e, { id, pos }]), Math.max(0, atMs)),
      );
    };

    const scheduleKillBanner = (killer: string, pos: [number, number, number], atMs: number) => {
      const id = `killbanner-${killStamp}-${killSeq++}`;
      staggerTimeoutsRef.current.push(
        setTimeout(() => {
          setKillBanners((b) => [...b, { id, killer, pos }]);
          staggerTimeoutsRef.current.push(
            setTimeout(() => setKillBanners((b) => b.filter((x) => x.id !== id)), 2600),
          );
        }, Math.max(0, atMs)),
      );
    };

    // Killer only: fling the victim's coins over and tick up the ATK/coin cards.
    const scheduleKillLoot = (
      fromPos: [number, number, number],
      toPos: [number, number, number],
      coins: number,
      atMs: number,
    ) => {
      if (coins > 0) {
        staggerTimeoutsRef.current.push(
          setTimeout(() => {
            const from: [number, number, number] = [fromPos[0], fromPos[1] + 0.3, fromPos[2]];
            const evs: WellRewardEvent[] = [];
            for (let c = 0; c < coins; c++) {
              const jitter = coins > 1 ? (c - (coins - 1) / 2) * 0.15 : 0;
              evs.push({
                id:   `kill-coin-${killStamp}-${killSeq++}`,
                type: 'steal',
                fromPos: [from[0] + jitter, from[1], from[2]],
                toPos:   [toPos[0] + jitter, toPos[1], toPos[2]],
                delay:   c * WELL_REWARD_STAGGER,
              });
            }
            setWellRewardEvents((ev) => [...ev, ...evs]);
          }, Math.max(0, atMs)),
        );
      }
      // Reveal the gained coins (+ the +1 ATK) on the resource cards once the
      // coins have arrived — staged like the Well reward (see useStagedResources).
      staggerTimeoutsRef.current.push(
        setTimeout(() => emitHpFx({ kind: 'killgain', coins, atk: 1 }), Math.max(0, atMs) + KILL_LOOT_LAND_MS),
      );
    };

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

        // Kill! At the moment the blow lands: fiery glow under me (the killer,
        // symbolising my +1 ATK) and the victim's coins arch over to me.
        if (combat.outgoing.eliminated) {
          scheduleKillFire(myPos, SWORD_IMPACT_MS);
          scheduleKillLoot(tgtPos, myPos, combat.outgoing.coinsReceived ?? 0, SWORD_IMPACT_MS);
        }
      }
    }

    // ── Well reward: only for the player who actually won the well ────────
    // (steal *victims* also receive a "Steal-all!" line, so gate on wellwinner.)
    // Spawned first; incoming attacks below are delayed until it finishes so
    // the two don't play at once and confuse the player.
    let wellDelayMs = 0;
    if (myPos && state.wellwinner === playerName) {
      const components = wellRewardFromEvents(gameEvents.events);
      if (components.length) {
        // Splash + rarity glow on the well itself.
        const fxId = `wellfx-${Date.now()}`;
        setWellWinFx((fx) => [...fx, { id: fxId, splash: true, glow: glowForReward(components), glowStartMs: performance.now() }]);
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
        const incomingFx: HpFxEvent = isDefended
          ? { kind: 'block' }
          : inc.outcome === 'instakill'
            ? { kind: 'kill' }
            : { kind: 'hit', damage: inc.damage ?? 1 };

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
          incomingFx,
        };

        const ONE_ANIM_MS = isDefended ? ONE_DEF_MS : ONE_HIT_MS;
        const delay       = staggerMs;
        staggerMs += ONE_ANIM_MS + GAP_MS;

        // Reflection kill: my shield bounced the attack back and finished the
        // attacker. I'm the killer — fiery glow under me + their coins fly over.
        if (atkReflected && inc.attackerDied && inc.coinsReceived != null && atkPos) {
          scheduleKillFire(myPos, delay + ONE_DEF_MS);
          scheduleKillLoot(atkPos, myPos, inc.coinsReceived, delay + ONE_DEF_MS);
        }
        // I was killed by this blow: I see the fiery glow erupt under my killer
        // (no coins — those go to them, not me).
        if (iDied && !isDefended && atkPos && (inc.outcome === 'hit' || inc.outcome === 'instakill')) {
          scheduleKillFire(atkPos, delay + SWORD_IMPACT_MS);
        }

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

    // ── Witnessed eliminations ────────────────────────────────────────────
    // The lone witness sees a fiery glow erupt under the killer plus a banner
    // naming them, and a red flash on the victim — but no coins (those are the
    // killer's alone).
    combat.witnessedEliminations.forEach((we, i) => {
      const victimPos = posMap.get(we.victim);
      const killerPos = posMap.get(we.attacker);
      const delay = wellDelayMs + SWORD_IMPACT_MS + i * 450;
      if (victimPos) {
        staggerTimeoutsRef.current.push(
          setTimeout(() => {
            const f = { id: `fl-${we.victim}-${Date.now()}`, position: victimPos };
            setHitFlashEvents((ev) => [...ev, f]);
            staggerTimeoutsRef.current.push(
              setTimeout(() => setHitFlashEvents((ev) => ev.filter((h) => h.id !== f.id)), 650),
            );
          }, delay),
        );
      }
      if (killerPos) {
        scheduleKillFire(killerPos, delay);
        scheduleKillBanner(we.attacker, killerPos, delay);
      }
    });

    if (newStrikes.length)       setStrikeEvents((ev) => [...ev, ...newStrikes]);
    if (newImpactShields.length) setImpactShields((s) => [...s, ...newImpactShields]);
    // gameEvents as a whole (not just its round) is a safe dep here: unlike
    // useStagedResources, this effect has no cleanup function, so a same-round
    // gameEvents refetch just re-runs the body, which the processedEventsRoundRef
    // guard above turns into a harmless no-op.
  }, [state, gameEvents, playerName]); // posMapRef is a stable ref — no dep needed

  // ── Debug: preview well-reward animations without a live game ─────────────
  // Append `?welltest=<types>` to the lobby URL to loop the animation(s) onto
  // your own player for size/rotation tuning. Examples:
  //   ?welltest=gold              ?welltest=steal       ?welltest=loss
  //   ?welltest=health:2,gold:2   ?welltest=sword,deny,info,instakill
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('welltest');
    if (!raw) return;

    // `loss` previews the red "chose the well but lost" glow; the rest are reward types.
    const tokens = raw.split(',').map((p) => p.trim()).filter(Boolean);
    const showLoss = tokens.includes('loss');
    const components: WellRewardComponent[] = tokens
      .filter((t) => t !== 'loss')
      .map((part) => {
        const [type, count] = part.split(':');
        return { type: type as WellRewardType, count: count ? parseInt(count, 10) : 1 };
      })
      .filter((c) => !!c.type);
    if (!components.length && !showLoss) return;

    const fire = () => {
      const myPos = posMapRef.current.get(playerName);
      if (!myPos) return;
      if (showLoss) {
        const lossId = `wellloss-dbg-${Date.now()}`;
        setWellWinFx((fx) => [...fx, { id: lossId, splash: false, glow: 'red', glowRadius: WELL_LOSS_GLOW_RADIUS, glowIntensity: WELL_LOSS_GLOW_INTENSITY, glowStartMs: performance.now() }]);
        setTimeout(() => setWellWinFx((fx) => fx.filter((x) => x.id !== lossId)), WELL_FX_DURATION);
      }
      if (!components.length) return;
      // Splash + rarity glow on the well.
      const fxId = `wellfx-dbg-${Date.now()}`;
      setWellWinFx((fx) => [...fx, { id: fxId, splash: true, glow: glowForReward(components), glowStartMs: performance.now() }]);
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

  // ── Debug: preview the kill animations without a live game ─────────────────
  // Append `?killtest=<roles>` to the lobby URL to loop the kill fx onto the
  // scene every 4s. Roles are comma-separated (default `killer`):
  //   killer  — fiery glow under you + a victim's coins fly to you (?killtest=killer:4 for 4 coins)
  //   witness — fiery glow under the killer + a banner naming them
  //   victim  — fiery glow under your killer (no coins)
  // e.g. ?killtest=killer   ?killtest=witness   ?killtest=killer:5,witness
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('killtest');
    if (raw == null) return;
    const roles = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (!roles.length) roles.push('killer');

    const SWORD_IMPACT_MS = (STRIKE_DUR + HOLD_DUR) * 1000;

    const fire = () => {
      const myPos = posMapRef.current.get(playerName);
      if (!myPos) return;
      // Borrow another seat as the "other" character; fall back to an offset spot.
      const otherEntry = Array.from(posMapRef.current.entries()).find(([n]) => n !== playerName);
      const otherPos: [number, number, number] = otherEntry?.[1] ?? [myPos[0] + 2.2, myPos[1], myPos[2]];
      const otherName = otherEntry?.[0] ?? 'Rival';
      const stamp = Date.now();
      let seq = 0;

      const spawnFire = (pos: [number, number, number], atMs: number) => {
        const id = `killfire-dbg-${stamp}-${seq++}`;
        setTimeout(() => setKillFireEvents((e) => [...e, { id, pos }]), atMs);
      };
      const spawnCoins = (from: [number, number, number], to: [number, number, number], coins: number, atMs: number) => {
        if (coins <= 0) return;
        setTimeout(() => {
          const f: [number, number, number] = [from[0], from[1] + 0.3, from[2]];
          const evs: WellRewardEvent[] = [];
          for (let c = 0; c < coins; c++) {
            const jitter = coins > 1 ? (c - (coins - 1) / 2) * 0.15 : 0;
            evs.push({
              id:   `kill-coin-dbg-${stamp}-${seq++}`,
              type: 'steal',
              fromPos: [f[0] + jitter, f[1], f[2]],
              toPos:   [to[0] + jitter, to[1], to[2]],
              delay:   c * WELL_REWARD_STAGGER,
            });
          }
          setWellRewardEvents((ev) => [...ev, ...evs]);
        }, atMs);
      };
      const spawnBanner = (killer: string, pos: [number, number, number], atMs: number) => {
        const id = `killbanner-dbg-${stamp}-${seq++}`;
        setTimeout(() => {
          setKillBanners((b) => [...b, { id, killer, pos }]);
          setTimeout(() => setKillBanners((b) => b.filter((x) => x.id !== id)), 2600);
        }, atMs);
      };

      for (const role of roles) {
        const [kind, countStr] = role.split(':');
        if (kind === 'witness') {
          spawnFire(otherPos, SWORD_IMPACT_MS);
          spawnBanner(otherName, otherPos, SWORD_IMPACT_MS);
        } else if (kind === 'victim') {
          spawnFire(otherPos, SWORD_IMPACT_MS);
        } else { // killer (default)
          const coins = countStr ? Math.max(0, parseInt(countStr, 10)) : 3;
          spawnFire(myPos, SWORD_IMPACT_MS);
          spawnCoins(otherPos, myPos, coins, SWORD_IMPACT_MS);
        }
      }
    };
    fire();
    const interval = setInterval(fire, 4000);
    return () => clearInterval(interval);
  }, [playerName]);

  // Build a map of sender → latest message text if it's within CHAT_BUBBLE_DURATION_MS.
  // bubbleTick forces a re-evaluation when the next bubble expires — previously
  // bubbles lingered until some unrelated state update happened to re-render.
  const [bubbleTick, setBubbleTick] = useState(0);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.chat, bubbleTick]);

  useEffect(() => {
    const now = Date.now();
    let soonest = Infinity;
    for (const msg of state?.chat ?? []) {
      const expiry = new Date(msg.timestamp).getTime() + CHAT_BUBBLE_DURATION_MS;
      if (expiry > now) soonest = Math.min(soonest, expiry);
    }
    if (!Number.isFinite(soonest)) return;
    const t = setTimeout(() => setBubbleTick((n) => n + 1), soonest - now + 50);
    return () => clearTimeout(t);
  }, [state?.chat, bubbleTick]);

  // Stable identities — these are passed to memo()ed players/souls, so a fresh
  // closure per render would defeat the memoization.
  const handleAttack = useCallback((targetName: string) => {
    getSocket().emit('submit_choice', { lobby_id: lobbyId, action: 'attack', target: targetName, resource: '' });
    setSelectedSoulIdx(null);
    onAttackSelect?.(targetName);
  }, [lobbyId, onAttackSelect]);

  // Lost souls all share one server name, so the emitted target is the shared
  // name while the clicked index is remembered locally for selection UI.
  const handleSoulAttack = useCallback((targetName: string, index: number) => {
    getSocket().emit('submit_choice', { lobby_id: lobbyId, action: 'attack', target: targetName, resource: '' });
    setSelectedSoulIdx(index);
    onAttackSelect?.(targetName);
  }, [lobbyId, onAttackSelect]);

  const handleDefend = useCallback(() => {
    getSocket().emit('submit_choice', { lobby_id: lobbyId, action: 'defend', resource: '' });
    onActionChange?.('defend');
  }, [lobbyId, onActionChange]);

  const handleWell = useCallback(() => {
    getSocket().emit('submit_choice', { lobby_id: lobbyId, action: 'well', resource: '' });
    onActionChange?.('well');
  }, [lobbyId, onActionChange]);

  return (
    <>
      <CameraFlyIn />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1.2} />

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
        return (
          <PlayerWithName
            key={player.name}
            name={player.name}
            position={position}
            rotation={rotation}
            isAnimating={true}
            isDead={isDead}
            isWinner={!!isWinner}
            isBoss={isBoss}
            bossHp={isBoss ? player.hp : undefined}
            bossMaxHp={isBoss ? BOSS_MAX_HP : undefined}
            bossTitle={isBoss ? player.title ?? undefined : undefined}
            frogSkinUrl={skinMap.get(player.name)}
            showAttackButton={showAttackButtons && isOpponent && !isDead && (!isBossFight || isBoss)}
            onAttack={handleAttack}
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
            // All souls share the same server name, so the name alone is
            // neither a unique key nor a unique attack target (clicking one
            // used to light up every soul's button).
            key={`${soul.name}-${i}`}
            name={soul.name}
            index={i}
            position={pos}
            showAttackButton={showAttackButtons && !isDead}
            onAttack={handleSoulAttack}
            isAttackSelected={currentAction === 'attack' && attackTarget === soul.name && selectedSoulIdx === i}
            actionCue={actionCue}
          />
        );
      })}

      {/* Well button — immediate; the Table GLB loads separately below */}
      {showAttackButtons && (
        <Html position={[0, 3.3, 0]} center distanceFactor={3.45} zIndexRange={[0, 0]}>
          <button
            onClick={handleWell}
            className={`${actionCue} ${guideGlowClass(guideHighlight?.well)}`}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              padding: '14px 28px',
              fontSize: '26px',
              fontWeight: 'bold',
              color: currentAction === 'well' ? '#ffffff' : '#d8b4fe',
              background: currentAction === 'well' ? 'rgba(126,34,206,0.95)' : 'rgba(46,16,101,0.85)',
              border: currentAction === 'well' ? '2px solid #d8b4fe' : '2px solid #7e22ce',
              borderRadius: '8px',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
              boxShadow: currentAction === 'well'
                ? '0 0 8px rgba(167,139,250,0.6), 0 4px 6px -4px rgba(0,0,0,0.2)'
                : '0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -4px rgba(0,0,0,0.2)',
            }}
          >
            🏴 The Well
          </button>
        </Html>
      )}

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
          // Souls share one name (the posMap entry is whichever came last), so
          // aim at the specific soul the player clicked instead.
          const tgtPos = selectedSoulIdx !== null && lostSouls[selectedSoulIdx]?.name === attackTarget
            ? LOST_SOUL_POSITIONS[selectedSoulIdx % LOST_SOUL_POSITIONS.length]
            : posMapRef.current.get(attackTarget);
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
              // Signal the HP card to react at the exact impact moment (drop +
              // shake on a hit, blue aura on a block) — incoming attacks only.
              if (ev.isIncoming && ev.incomingFx) {
                emitHpFx(ev.incomingFx);
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

      {/* Well splash + rarity/loss glow — pure geometry/particles, render immediately */}
      {wellWinFx.map((fx) => (
        <group key={fx.id}>
          {fx.splash && <WellSplashEffect position={WELL_SPLASH_POSITION} />}
          {fx.glow && <WellGlowEffect position={WELL_GLOW_POSITION} color={fx.glow} radius={fx.glowRadius} intensity={fx.glowIntensity} blinks={fx.glow === 'red' ? 2 : undefined} />}
        </group>
      ))}
      {/* Single persistent light driven by the active glow — mounted once so it
          never recompiles material shaders (the source of the earlier stutter). */}
      <WellGlowLight
        position={[WELL_GLOW_POSITION[0], WELL_GLOW_POSITION[1] + 0.4, WELL_GLOW_POSITION[2]]}
        glows={wellWinFx
          .filter((f) => f.glow && f.glowStartMs != null)
          .map((f) => ({ glow: f.glow!, startMs: f.glowStartMs!, intensity: f.glowIntensity, blinks: f.glow === 'red' ? 2 : 3 }))}
      />

      {/* Red aura — pure geometry, no model; renders immediately */}
      {hitFlashEvents.map((f) => (
        <AuraFlash key={f.id} position={f.position} />
      ))}

      {/* Fiery red glow under a character when a kill is made (ATK surge) */}
      {killFireEvents.map((k) => (
        <KillFireEffect
          key={k.id}
          position={k.pos}
          onDone={() => setKillFireEvents((e) => e.filter((x) => x.id !== k.id))}
        />
      ))}

      {/* Witness banner — names the killer in a fiery style above their head */}
      {killBanners.map((b) => (
        <Html
          key={b.id}
          position={[b.pos[0], b.pos[1] + 0.95, b.pos[2]]}
          center
          distanceFactor={3}
          zIndexRange={[0, 0]}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="kill-witness-banner">💀 {b.killer} got a kill! 🔥</div>
        </Html>
      ))}

      {/* Stage 6: Game-winning crown */}
      <Suspense fallback={null}>
        <WinnerCrown worldPosition={crownPosition} />
      </Suspense>

      <Suspense fallback={null}>
        {/* Self-hosted — preset="sunset" fetched this exact file from a CDN at runtime */}
        <Environment files="/hdri/venice_sunset_1k.hdr" />
      </Suspense>

    </>
  );
}
