'use client';

import { useFrame } from '@react-three/fiber';
import { Html, Environment, useGLTF } from '@react-three/drei';
import { useRef, useMemo, useState, useEffect, useCallback, Suspense } from 'react';
import * as THREE from 'three';
import Temple from '@/components/temple';
import SeaAndSky from '@/components/lobby/SeaAndSky';
import Table from '@/components/Table';
import CameraFlyIn from '@/components/lobby/CameraFlyIn';
import ShieldEffect from '@/components/lobby/ShieldEffect';
import SwordEffect, { STRIKE_DUR, HOLD_DUR, BOUNCE_DUR } from '@/components/lobby/SwordEffect';
import WellRewardEffect, { preloadWellRewardModels, type WellRewardType } from '@/components/lobby/WellRewardEffect';
import WellSplashEffect from '@/components/lobby/WellSplashEffect';
import WellGlowEffect, { WellGlowLight } from '@/components/lobby/WellGlowEffect';
import KillFireEffect from '@/components/lobby/KillFireEffect';
import DenyRingEffect from '@/components/lobby/DenyRingEffect';
import { PlayerWithName, LostSoulModel, WinnerCrown, WellCrown, LOST_SOUL_POSITIONS, BOSS_MAX_HP, type InfoRevealBadge } from '@/components/lobby/PlayerAvatars';
import { guideGlowClass, type GuideHighlights } from '@/lib/guideHighlights';
import { getSocket } from '@/lib/socket';
import { useGameEvents } from '@/lib/useGameEvents';
import { emitHpFx } from '@/lib/resourceFx';
import { glowForReward, wellRewardFromEvents, type WellRewardComponent } from '@/lib/gameEvents';
import { assignSkins } from '@/lib/frogSkins';
import {
  buildCombatAnimationPlan,
  buildWellRewardEvents,
  WELL_LOSS_GLOW_RADIUS,
  WELL_LOSS_GLOW_INTENSITY,
  WELL_FX_DURATION,
  WELL_REWARD_STAGGER,
  type StrikeEvent,
  type HitFlashEvent,
  type WellRewardEvent,
  type KillFireEvent,
  type KillBanner,
  type WellWinFx,
  type ImpactShield,
  type CombatAnimationAction,
} from '@/lib/combatAnimationPlan';
import {
  TABLE_POSITION,
  MAX_PLAYERS,
  getPlayerPositions,
  getBossPosition,
  getBossPlayerPositions,
} from '@/lib/sceneConstants';
import { useLobbyGame } from '@/lib/useLobbyGame';
import type { LobbyState } from '@/types/game';


// ── Sea & sky tuning ────────────────────────────────────────────────────────
// Single source of truth — edit these to move the water / sun. (Don't also set
// the same props on <SeaAndSky/> below, or the prop would override these.)
const SEA_LEVEL = 2;                       // water height; lower = sea drops
const SUN_POSITION: [number, number, number] = [100, 20, 100]; // sun direction

const CHAT_BUBBLE_DURATION_MS = 4000;
// Safety net for the death-pose delay below: if a player's HP hits 0 but the
// combat plan never sends a matching 'markDead' (e.g. events fetch hiccup),
// force their dead pose to show after this long rather than leaving them
// looking alive indefinitely.
const DEATH_POSE_FALLBACK_MS = 4000;

useGLTF.preload('/models/shields/shield_animation-ld.glb');

useGLTF.preload('/models/swords/sword_animation-ld.glb');
preloadWellRewardModels();
// Frog skins are preloaded on-demand per lobby (see usePreloadLobbySkins below).
// Previously we eagerly preloaded all 13 skins (~92 MB) on app start.

// Where the splash erupts (well mouth) and where the rarity glow lies (under it).
const WELL_SPLASH_POSITION: [number, number, number] = [0, 2.4, 0];
const WELL_GLOW_POSITION:   [number, number, number] = [0, 2.3, 0];

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
  /** Start the camera pulled back and ease it in, for the join/create entrance transition. */
  flyIn?: boolean;
};

export default function LobbyScene({ state, playerName, lobbyId, currentAction, attackTarget, onAttackSelect, onActionChange, guideHighlight = {}, flyIn = false }: LobbySceneProps) {
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
  const [denyRingFx, setDenyRingFx] = useState<{ id: string; pos: [number, number, number] }[]>([]);
  const prevDenyTargetRef = useRef<string | null>(null);
  // Opponent stats captured when the local player wins the Well's "info"
  // reward. Rendered on each opponent for the round it's captured (fresh),
  // greyed with a "last round" label for the round after (stale), then
  // dropped — derived purely by comparing `round` to state.round at render
  // time, so no separate expiry timer is needed.
  const [infoReveal, setInfoReveal] = useState<{
    round: number;
    stats: Map<string, { hp: number; coins: number; attackDamage: number }>;
  } | null>(null);
  // Players whose HP just hit 0 but whose dead pose (model tip-over + gray
  // fade) is being held off until the kill animation's impact moment —
  // otherwise they'd flop over/gray out before the sword even lands. Cleared
  // per-name by the 'markDead' action (timed with the kill fire), or in bulk
  // on the next round transition / by the fallback timeout below.
  const [deathPending, setDeathPending] = useState<Set<string>>(new Set());
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
    // timeouts were just cancelled above). Any death-pose delay from last round
    // is long since resolved by now, so drop it too rather than leave stale names.
    setKillFireEvents([]);
    setKillBanners([]);
    setDenyRingFx([]);
    setDeathPending(new Set());

    // Hold off newly-eliminated players' dead pose until buildCombatAnimationPlan's
    // kill-fire timing (below) reveals it via 'markDead' — otherwise they flop
    // over/gray out this instant, before the sword animation has even played.
    const newlyDead = state.players
      .filter((p) => (p.hp ?? 0) <= 0 && (prev.players.find((pp) => pp.name === p.name)?.hp ?? 0) > 0)
      .map((p) => p.name);
    if (newlyDead.length) {
      setDeathPending((s) => new Set([...s, ...newlyDead]));
      staggerTimeoutsRef.current.push(
        setTimeout(() => {
          setDeathPending((s) => {
            if (!newlyDead.some((n) => s.has(n))) return s;
            const next = new Set(s);
            newlyDead.forEach((n) => next.delete(n));
            return next;
          });
        }, DEATH_POSE_FALLBACK_MS),
      );
    }

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

  // Deny-ring drop: fires the moment `deny_target` newly names someone (set
  // synchronously server-side on submit_deny_target, see lobby.py), riding the
  // same state_update broadcast every client already receives — so the denier,
  // the denied player, and bystanders all see it at the same instant without a
  // dedicated event. Own ref (not prevStateRef) so ordering vs. the effect above
  // doesn't matter.
  useEffect(() => {
    const target = state?.deny_target ?? null;
    const prevTarget = prevDenyTargetRef.current;
    prevDenyTargetRef.current = target;
    if (!target || target === prevTarget) return;
    const pos = posMapRef.current.get(target);
    if (!pos) return;
    const id = `deny-${target}-${Date.now()}`;
    setDenyRingFx((fx) => [...fx, { id, pos }]);
  }, [state?.deny_target]);

  // Dev preview: append ?debugDenyRing=1 to a lobby URL to replay the deny-ring
  // drop on the first seated player every few seconds, without needing to
  // actually win the Well's (RNG-gated) deny reward. No effect in normal play.
  // Reads via refs and sets up the interval once (empty deps) so frequent
  // state_update-driven re-renders (which change `players`' identity) don't
  // keep resetting the timer before it ever fires.
  const playersRef = useRef(players);
  playersRef.current = players;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.search.includes('debugDenyRing')) return;
    const t = setInterval(() => {
      const first = playersRef.current[0];
      const pos = first ? posMapRef.current.get(first.name) : null;
      if (pos) setDenyRingFx((fx) => [...fx, { id: `debug-${Date.now()}`, pos }]);
    }, 2500);
    return () => clearInterval(t);
  }, []);

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

    const myNowHp = state.players.find((p) => p.name === playerName)?.hp ?? 1;
    const wonWell = state.wellwinner === playerName;
    const plan = buildCombatAnimationPlan({
      events: gameEvents.events,
      playerName,
      posMap: posMapRef.current,
      myNowHp,
      wonWell,
    });

    // "info" Well reward: snapshot every other player's current stats so
    // PlayerAvatars can badge them for this round (then one more, greyed).
    if (wonWell && wellRewardFromEvents(gameEvents.events).some((c) => c.type === 'info')) {
      const stats = new Map<string, { hp: number; coins: number; attackDamage: number }>();
      state.players.forEach((p) => {
        if (p.name !== playerName) stats.set(p.name, { hp: p.hp, coins: p.coins, attackDamage: p.attackDamage });
      });
      setInfoReveal({ round: state.round, stats });
    }

    const applyAction = (action: CombatAnimationAction) => {
      switch (action.type) {
        case 'addStrike': setStrikeEvents((s) => [...s, action.strike]); break;
        case 'addImpactShield': setImpactShields((s) => [...s, action.shield]); break;
        case 'removeImpactShield': setImpactShields((s) => s.filter((x) => x.id !== action.id)); break;
        case 'addKillFire': setKillFireEvents((e) => [...e, action.event]); break;
        case 'markDead': setDeathPending((s) => {
          if (!s.has(action.name)) return s;
          const next = new Set(s);
          next.delete(action.name);
          return next;
        }); break;
        case 'addKillBanner': setKillBanners((b) => [...b, action.banner]); break;
        case 'removeKillBanner': setKillBanners((b) => b.filter((x) => x.id !== action.id)); break;
        case 'addWellRewardEvents': setWellRewardEvents((ev) => [...ev, ...action.events]); break;
        case 'emitHpFx': emitHpFx(action.event); break;
        case 'addWellWinFx': setWellWinFx((fx) => [...fx, action.fx]); break;
        case 'removeWellWinFx': setWellWinFx((fx) => fx.filter((x) => x.id !== action.id)); break;
        case 'addHitFlash': setHitFlashEvents((ev) => [...ev, action.event]); break;
        case 'removeHitFlash': setHitFlashEvents((ev) => ev.filter((x) => x.id !== action.id)); break;
      }
    };

    for (const batch of plan) {
      const apply = () => batch.actions.forEach(applyAction);
      if (batch.delayMs <= 0) {
        apply();
      } else {
        staggerTimeoutsRef.current.push(setTimeout(apply, batch.delayMs));
      }
    }
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
      <CameraFlyIn flyIn={flyIn} />
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
        // Gate the actual "dead" visual (model tip-over + gray fade + skull
        // label) separately from isDead: buttons/targeting react to hp
        // instantly (you shouldn't be able to attack an already-dead player),
        // but the pose itself waits for deathPending to clear so it lands
        // together with the kill animation instead of snapping in first.
        const showDeadPose = isDead && !deathPending.has(player.name);
        const isWinner = winner === player.name;
        const isOpponent = player.name !== playerName;
        const isBoss = !!player.boss;
        const isOwnPlayer = player.name === playerName;
        // "info" Well reward badge: fresh the round it's captured, greyed
        // ("last round") the round after, then gone — see infoReveal above.
        let infoBadge: InfoRevealBadge | null = null;
        if (infoReveal && isOpponent && !isDead) {
          const s = infoReveal.stats.get(player.name);
          if (s && infoReveal.round === state?.round) infoBadge = { ...s, stale: false };
          else if (s && infoReveal.round === (state?.round ?? 0) - 1) infoBadge = { ...s, stale: true };
        }
        return (
          <PlayerWithName
            key={player.name}
            name={player.name}
            position={position}
            rotation={rotation}
            isAnimating={true}
            isDead={showDeadPose}
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
            infoReveal={infoBadge}
          />
        );
      })}

      {/* Lost soul names + attack buttons — immediate; mesh loads lazily inside LostSoulModel */}
      {lostSouls.map((soul, i) => {
        const pos = LOST_SOUL_POSITIONS[i % LOST_SOUL_POSITIONS.length];
        const isDead = (soul.hp ?? 0) <= 0;
        // Same fresh/stale/gone derivation as the main player loop above.
        // Souls share one server name, so — like their shared posMap entry —
        // every soul with that name shows the same captured snapshot.
        let infoBadge: InfoRevealBadge | null = null;
        if (infoReveal && !isDead) {
          const s = infoReveal.stats.get(soul.name);
          if (s && infoReveal.round === state?.round) infoBadge = { ...s, stale: false };
          else if (s && infoReveal.round === (state?.round ?? 0) - 1) infoBadge = { ...s, stale: true };
        }
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
            infoReveal={infoBadge}
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

      {/* Three red hoops dropping over a player denied their action by the Well */}
      {denyRingFx.map((fx) => (
        <DenyRingEffect
          key={fx.id}
          position={fx.pos}
          onDone={() => setDenyRingFx((e) => e.filter((x) => x.id !== fx.id))}
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
