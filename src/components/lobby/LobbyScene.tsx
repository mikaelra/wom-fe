'use client';

import { useFrame } from '@react-three/fiber';
import { Environment, useGLTF } from '@react-three/drei';
import { useRef, useMemo, useState, useEffect, useCallback, Suspense } from 'react';
import * as THREE from 'three';
import Temple from '@/components/temple';
import SeaAndSky from '@/components/lobby/SeaAndSky';
import Table from '@/components/Table';
import CameraFlyIn from '@/components/lobby/CameraFlyIn';
import ShieldEffect from '@/components/lobby/ShieldEffect';
import SwordEffect, { STRIKE_DUR, HOLD_DUR, BOUNCE_DUR } from '@/components/lobby/SwordEffect';
import WellRewardEffect, { preloadWellRewardModels, WELL_REWARD_FLIGHT_DUR, type WellRewardType } from '@/components/lobby/WellRewardEffect';
import ResourceGainEffect, { isGainedResource, RESOURCE_GAIN_DUR, type GainedResource } from '@/components/lobby/ResourceGainEffect';
import WellSplashEffect from '@/components/lobby/WellSplashEffect';
import WellGlowEffect, { WellGlowLight } from '@/components/lobby/WellGlowEffect';
import SelectionGlow from '@/components/lobby/SelectionGlow';
import KillFireEffect from '@/components/lobby/KillFireEffect';
import DamageNumberEffect from '@/components/lobby/DamageNumberEffect';
import DenyRingEffect from '@/components/lobby/DenyRingEffect';
import InstakillBurstEffect, { INSTAKILL_KILL_COLOR, INSTAKILL_BLOCK_COLOR } from '@/components/lobby/InstakillBurstEffect';
import { PlayerWithName, LostSoulModel, WinnerCrown, WellCrown, LOST_SOUL_POSITIONS, BOSS_MAX_HP, type InfoRevealBadge } from '@/components/lobby/PlayerAvatars';
import { FreshHtml } from '@/components/lobby/FreshHtml';
import ActionImageButton from '@/components/lobby/ActionImageButton';
import { getSocket } from '@/lib/socket';
import { useGameEvents } from '@/lib/useGameEvents';
import { emitHpFx } from '@/lib/resourceFx';
import { playCombatSound } from '@/lib/sounds';
import { glowForReward, type WellRewardComponent } from '@/lib/gameEvents';
import { skinUrl } from '@/lib/frogSkins';
import {
  buildCombatAnimationPlan,
  buildWellRewardEvents,
  buildHadesCoinEvents,
  WELL_LOSS_GLOW_RADIUS,
  WELL_LOSS_GLOW_INTENSITY,
  WELL_FX_DURATION,
  WELL_REWARD_STAGGER,
  type StrikeEvent,
  type HitFlashEvent,
  type BlockGlowEvent,
  type WellRewardEvent,
  type KillFireEvent,
  type DamageNumberEvent,
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
  radiusGrowthFactor,
  BOSS_Y_LIFT,
} from '@/lib/sceneConstants';
import { useLobbyGame } from '@/lib/useLobbyGame';
import type { LobbyState } from '@/types/game';


// ── Sea & sky tuning ────────────────────────────────────────────────────────
// Single source of truth — edit these to move the water / sun. (Don't also set
// the same props on <SeaAndSky/> below, or the prop would override these.)
const SEA_LEVEL = 2;                       // water height; lower = sea drops
const SUN_POSITION: [number, number, number] = [100, 20, 100]; // sun direction

const CHAT_BUBBLE_DURATION_MS = 4000;
// Resource-gain (ResourceGainEffect) plays first, at t=0 of round-resolution;
// combat/well are held back to start after it finishes instead of landing on
// top of it, so the two read as two separate beats, not one jumbled effect.
// RESOURCE_GAIN_DUR (rise+hang+descend) is 0.5s -- a bit of buffer on top.
const RESOURCE_GAIN_START_DELAY_MS = RESOURCE_GAIN_DUR * 1000 + 50;
// Safety net for the death-pose delay below: if a player's HP hits 0 but the
// combat plan never sends a matching 'markDead' (e.g. events fetch hiccup),
// force their dead pose to show after this long rather than leaving them
// looking alive indefinitely.
const DEATH_POSE_FALLBACK_MS = 4000;
// Poisoned Dagger visual cues (green ground glow, Attack-button/ATK-card
// flame) fire this much before the dagger's WellRewardEffect model actually
// finishes landing -- a beat ahead of the full reveal, not simultaneous
// with it. Tuned by eye; bump it up for an earlier cue, down for later.
const INSTAKILL_GLOW_LEAD_MS = 300;
// Deny prompt (floating model + Attack block) fires this much before the
// deny reward's WellRewardEffect model finishes landing -- see
// INSTAKILL_GLOW_LEAD_MS above, same idea. Tuned by eye.
const DENY_REVEAL_LEAD_MS = 600;

useGLTF.preload('/models/shields/shield_animation-ld.glb');

useGLTF.preload('/models/swords/sword_animation-ld.glb');
preloadWellRewardModels();
// Frog skins are preloaded on-demand per lobby (see usePreloadLobbySkins below).
// Previously we eagerly preloaded all 13 skins (~92 MB) on app start.

// Where the splash erupts (well mouth) and where the rarity glow lies (under it).
const WELL_SPLASH_POSITION: [number, number, number] = [0, 2.4, 0];
const WELL_GLOW_POSITION:   [number, number, number] = [0, 2.3, 0];

// Persistent selection-glow colours -- each matches the same action's button
// glow (ActionImageButton's glowColor) so the 3D cue and the 2D button read
// as the same accent. Defend's blue is also literally WellGlowEffect's
// reward-rarity blue (WELL_GLOW_HEX.blue) -- same hex, different fixture.
const WELL_SELECT_GLOW_COLOR   = '#a78bfa';
const ATTACK_SELECT_GLOW_COLOR = '#ef4444';
const DEFEND_SELECT_GLOW_COLOR = '#3b82f6';
const DEFEND_SELECT_GLOW_INTENSITY = 2;
// Gold, matching WellGlowEffect's WELL_GLOW_HEX.gold -- pulses once at the
// well winner's own seat, every time someone wins (including a repeat
// winner), distinct from the well's own fixed-position glow above (that
// one's keyed to reward rarity; this one's purely "who won").
const WELL_WINNER_GLOW_COLOR = '#fcd34d';
const WELL_WINNER_GLOW_RADIUS = 1.1;
const WELL_WINNER_GLOW_INTENSITY = 3;
// Deny prompt: an orange ground glow under every eligible target at once
// (unlike the other SelectionGlow uses below, which each track a single
// current choice) -- see the players.map/lostSouls.map loops, which each
// render one of these per eligible player/soul.
const DENY_TARGET_GLOW_COLOR = '#f97316';
const DENY_TARGET_GLOW_RADIUS = 1.1;
const DENY_TARGET_GLOW_INTENSITY = 2.5;
// Poisoned Dagger (instakill) cue -- a larger, slower-breathing green glow
// layered under the red attack-target glow when picking who to attack. Same
// "always on" WIP status as the instakill-flame CSS cue on the ATK card/
// Attack buttons -- not yet gated on an actual dagger charge.
const ATTACK_TARGET_POISON_GLOW_COLOR = '#22c55e';
const ATTACK_TARGET_POISON_GLOW_RADIUS = 2;
const ATTACK_TARGET_POISON_GLOW_PULSE_SPEED = 0.5; // much slower than SelectionGlow's default breathing
// Same blue as the defend-selection glow above, but for the moment of an
// actual block landing (either side of it) rather than the pre-round choice.
// Half the strength so it reads as a smaller "impact" beat, not a repeat of
// the steadier selection glow.
const BLOCK_GLOW_INTENSITY = DEFEND_SELECT_GLOW_INTENSITY / 2;
// Quick to peak on the hit (SelectionGlow's default fade-in rate), but
// noticeably slower to fade back out than that -- an impact should land
// sharp and linger a moment, not snap off. Doesn't touch the other
// SelectionGlow instances, which keep the default rate both ways.
const BLOCK_GLOW_FADE_OUT_RATE = 0.5;
// Parked off-scene when a selection glow has no live target this render, so
// the (inactive, intensity-0) light/disc still has somewhere valid to sit.
const GLOW_PARK_POSITION: [number, number, number] = [0, -10, 0];
// Selection glows sit at a character's feet, same offset KillFireEffect uses
// to line its splash up with the base of the model rather than its center.
const SELECTION_GLOW_Y_OFFSET = -0.5;
// Hades' model is scaled 1.44x vs a frog's 0.6x (PlayerAvatars.tsx) -- even
// after undoing getBossPosition()'s BOSS_Y_LIFT seat boost, its visual feet
// still sit lower than a frog's relative to that shared seat coordinate, so
// the attack-target glow needs this extra drop on top to land level with a
// frog's. Tuned by eye against the live scene, not derived from the model.
const BOSS_ATTACK_GLOW_EXTRA_DROP = 0.2;

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
  /** The local player's chosen resource this round (gain_hp/gain_coin/
   *  gain_attack), lifted from SceneOverlay the same way currentAction is --
   *  drives ResourceGainEffect at round-resolution. */
  chosenResource?: string;
  /** Player-toggleable (button lives in the pre-game overlay) -- off pauses
   *  CameraFlyIn's ambient pre-round orbit so kick/relic clicks are easier
   *  to land. Defaults on. */
  spinEnabled?: boolean;
  /** Bumped by the in-round "Reset Camera" button -- see CameraFlyIn. */
  resetCameraSignal?: number;
  /** Fired on genuine player camera drag/scroll -- see CameraFlyIn. */
  onCameraUserAdjust?: () => void;
  /** Fired whenever instakillVisualActive changes -- lets SceneOverlay (a
   *  sibling render tree; see its own onGameOverRevealed) sync the ATK
   *  card's Poisoned Dagger cue to the same "model has landed" timing as
   *  this component's own ground glow/Attack button cues, instead of
   *  re-deriving it independently. */
  onInstakillActiveChange?: (active: boolean) => void;
};

export default function LobbyScene({ state, playerName, lobbyId, currentAction, attackTarget, onAttackSelect, onActionChange, chosenResource, spinEnabled = true, resetCameraSignal, onCameraUserAdjust, onInstakillActiveChange }: LobbySceneProps) {
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
  const [blockGlowEvents, setBlockGlowEvents] = useState<BlockGlowEvent[]>([]);
  const [impactShields, setImpactShields] = useState<ImpactShield[]>([]);
  const [wellRewardEvents, setWellRewardEvents] = useState<WellRewardEvent[]>([]);
  const [resourceGainEvents, setResourceGainEvents] = useState<
    { id: string; resource: GainedResource; pos: [number, number, number] }[]
  >([]);
  const [wellWinFx, setWellWinFx] = useState<WellWinFx[]>([]);
  const [killFireEvents, setKillFireEvents] = useState<KillFireEvent[]>([]);
  const [damageNumberEvents, setDamageNumberEvents] = useState<DamageNumberEvent[]>([]);
  const [denyRingFx, setDenyRingFx] = useState<{ id: string; pos: [number, number, number] }[]>([]);
  // Denier glow: only shown to the denied player themself, under whoever
  // denied them -- see the same trigger effect as denyRingFx below. A
  // single persistent SelectionGlow (position parked, active toggled) like
  // the attack/defend/well glows below, not a one-shot mounted effect, so
  // it fades in/out with the same gradual SelectionGlow envelope those use
  // instead of a sharper hand-timed blink.
  const [denierGlowPos, setDenierGlowPos] = useState<[number, number, number]>(GLOW_PARK_POSITION);
  const [denierGlowActive, setDenierGlowActive] = useState(false);
  const denierGlowTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prevDenyTargetRef = useRef<string | null>(null);
  // Golden glow under whoever just won the Well -- same persistent-
  // SelectionGlow-with-toggled-active pattern as denierGlow above (gradient,
  // ground-anchored, single gentle pulse), not the fixed-at-the-well
  // WellGlowEffect below it (that one's keyed to reward rarity; this one's
  // purely "who won", and needs to re-fire even when the same player wins
  // again -- see the round-marker scan in the trigger effect).
  const [wellWinnerGlowPos, setWellWinnerGlowPos] = useState<[number, number, number]>(GLOW_PARK_POSITION);
  const [wellWinnerGlowActive, setWellWinnerGlowActive] = useState(false);
  const wellWinnerGlowTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastWellGlowRoundRef = useRef<number | null>(null);
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
  // Whether the Poisoned Dagger's (instakill Well reward) visual cues
  // (green ground glow, instakill-flame on Attack buttons/ATK card) should
  // be showing. Deliberately NOT sourced from state_update -- who holds the
  // charge is private (see routes/lobby.py's get_player_messages), not
  // broadcast to the whole lobby room, so this is driven entirely by the
  // per-player useGameEvents fetch below (gameEvents.instakill) rather than
  // any `state` field. It also flips true the instant that fetch resolves,
  // well before the dagger's WellRewardEffect model has even started its
  // arc, so the round-resolution effect below holds it false and delays the
  // reveal until a beat before the model actually lands, whenever this
  // round's fetch shows the charge as newly won (see addWellRewardEvents'
  // 'instakill' case and INSTAKILL_GLOW_LEAD_MS) -- already holding it
  // entering the round (nothing new landing to wait for) sets it true
  // immediately instead.
  const [instakillVisualActive, setInstakillVisualActive] = useState(false);
  useEffect(() => {
    onInstakillActiveChange?.(instakillVisualActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instakillVisualActive]);
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
  // Same "capture on every render, read the ref inside the async
  // round-transition effect" trick as currentActionRef above -- the parent
  // clears chosenResource on the new round too.
  const chosenResourceRef = useRef(chosenResource);
  chosenResourceRef.current = chosenResource;

  // "Ready" sword/shield previews (shown while choosing a target / choosing
  // defend) used to vanish the instant the parent's per-round reset cleared
  // currentAction/attackTarget -- well before the round's own combat
  // animations even start fetching -- then reappear later when the actual
  // strike/block animation mounted a wholly separate instance. These sticky
  // copies persist across that reset (only ever SET by the effects below,
  // never cleared by a currentAction/attackTarget prop change) so the same
  // visual instance carries through to the moment it hands off to the real
  // animation. Cleared by the round-resolution effect below, at the exact
  // moment that handoff happens (or immediately/at round-end when there's
  // nothing to hand off to -- see combatAnimationPlan's clearDefendShield
  // and the addStrike case in applyAction).
  const [stickyAttackTarget, setStickyAttackTarget] = useState<string | null>(null);
  const [defendShieldActive, setDefendShieldActive] = useState(false);
  // Read inside the async round-resolution effect below -- same "capture on
  // every render" reasoning as currentActionRef/chosenResourceRef above,
  // since that effect can't safely depend on defendShieldActive directly
  // (it would either read a stale closure value or re-run on every toggle).
  const defendShieldActiveRef = useRef(defendShieldActive);
  defendShieldActiveRef.current = defendShieldActive;
  useEffect(() => {
    if (currentAction === 'attack' && attackTarget) setStickyAttackTarget(attackTarget);
  }, [currentAction, attackTarget]);
  useEffect(() => {
    if (currentAction === 'defend') setDefendShieldActive(true);
  }, [currentAction]);


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

  const { winner: gameWinner, wellWinner, canAct: showAttackButtons, phase, isAdmin, isPendingDenyChooser } = useLobbyGame(state, playerName);
  // Whether the deny prompt (floating model + Attack block, see the
  // players.map loop below) should actually be showing. Deliberately NOT
  // just isPendingDenyChooser -- that flips true the instant the round
  // resolves, well before the deny reward's WellRewardEffect model has
  // even started its arc. A forfeited-if-unused pending deny (see wom-be's
  // engine/phases/well.py) is always freshly won the round it's live for,
  // so unlike instakillVisualActive there's no "already held entering this
  // round" case to short-circuit -- every activation waits for that
  // round's addWellRewardEvents 'deny' case (below) to reveal it a beat
  // before the model lands. Cleared immediately (no delay) the moment
  // pending_deny stops being mine -- used, forfeited, or round moved on.
  const [pendingDenyActive, setPendingDenyActive] = useState(false);
  useEffect(() => {
    if (!isPendingDenyChooser) setPendingDenyActive(false);
  }, [isPendingDenyChooser]);
  // showAttackButtons flips false the instant canAct's isAlive check does --
  // well before the kill animation (deathPending, see above) has revealed my
  // own death, instantly giving it away. While my own dead pose is still
  // being held back, keep my action buttons (Well/Defend/Attack-target
  // selection) showing as if I could still act -- same reasoning as the
  // resource cards' canActLook (SceneOverlay.tsx). Any OTHER reason canAct
  // is false (denied/game-over/round 0/spectator) never puts my own name in
  // deathPending, so this only ever relaxes the "just died" case. The real,
  // immediate showAttackButtons still gates the actual socket emits (see
  // handleWell/handleDefend/handleAttack below), so a click landing in this
  // window can't actually submit anything.
  const showActionButtonsLook = showAttackButtons || deathPending.has(playerName);
  const showLobbyControls = state?.round === 0;
  const gameOver = phase === 'gameover';
  const isBossFight = !!state?.boss_fight;
  const gameEvents = useGameEvents(lobbyId, playerName, state?.round, state?.deny_target);

  // Skins are owned items now, not a per-lobby hash: the server freezes
  // each player's equipped skin at join time (players.equipped_skin) and
  // sends it as part of their public payload -- see
  // docs/MONETIZATION_PLAN.md §3.1. Guests/unclaimed names have no
  // equipped skin server-side (skin: null) and fall back to green here.
  const skinMap = useMemo(() => {
    const frogPlayers = allPlayers.filter((p) => !p.boss && !p.lost_soul && !p.bot);
    const map = new Map<string, string>();
    for (const p of frogPlayers) {
      map.set(p.name, skinUrl(p.skin ?? 'frog_green_v1'));
    }
    return map;
  }, [allPlayers]);

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
  // Once the game is over, trust ONLY the declared winner -- never fall
  // back to wellWinner (who most recently won The Well, a live in-game
  // indicator with no bearing on who actually won the match). Without
  // this, a "no contest" ending (all humans dead, a bot survives --
  // engine.boss_ai.players_defeated deliberately leaves gameWinner null
  // there, see its own docstring) could still crown whoever's stale
  // wellWinner value happened to be sitting around, on a screen that's
  // supposed to show no winner at all. Mid-game, the fallback still
  // applies -- that's wellCrownHolder's whole purpose below.
  const winner = gameOver ? gameWinner : (gameWinner ?? wellWinner);

  // Compute seat positions. In boss fights the boss is pinned to the far side and players
  // spread across the near half, so adding a player never moves Hades.
  const PLAYER_POSITIONS = useMemo(() => {
    if (!isBossFight) return getPlayerPositions(players.length);
    const bossSlot = getBossPosition();
    const nonBossSlots = getBossPlayerPositions(players.filter((p) => !p.boss).length);
    let nbi = 0;
    return players.map((p) => (p.boss ? bossSlot : nonBossSlots[nbi++]));
  }, [players, isBossFight]);

  // Boss-fight seating never grows past its fixed base radius (getBossPlayerPositions
  // doesn't scale with count), so only back the camera off for the regular circle.
  const cameraRadiusFactor = isBossFight ? 1 : radiusGrowthFactor(players.length);

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

  // Live targets for the persistent selection glows below -- undefined when
  // that action isn't the current choice, in which case the glow just fades
  // out rather than unmounting (see SelectionGlow's comment on why).
  const bossName = allPlayers.find((p) => p.boss)?.name;
  // Hades' seat sits far higher than a regular player's (getBossPosition's
  // BOSS_Y_LIFT) and, since the hades_v4 model swap, renders ~2x wider/taller
  // too -- the flat +1.1 head-clearance below left the damage number clipped
  // inside his (much bigger) head/torso, and even after raising it the
  // number was still swallowed by his own geometry depth-wise. Detected by
  // y-position rather than name since StrikeEvent carries no target
  // identity, only toPos. BOSS_DAMAGE_NUMBER_Z_OFFSET additionally pulls it
  // toward the camera (players sit at z+, Hades at the far z- side -- see
  // getPlayerPositions' comment) so it clears his now much thicker model
  // instead of rendering inside it.
  //
  // bossStrikeY (not just getBossPosition()'s raw seat y) -- every strike's
  // fromPos/toPos in combatAnimationPlan.ts bakes in a further +0.3 lift
  // (see its baseToPos/fromPos), so comparing against the raw seat y never
  // matched and this whole boss-specific offset silently never applied.
  const bossStrikeY = getBossPosition().position[1] + 0.3;
  // 2.2/3.0 (double-ish the regular +1.1) read as "in the sky, nowhere near
  // Hades" once the bossStrikeY fix above actually made these apply for the
  // first time -- dialed back to a modest bump over the regular offsets.
  const BOSS_DAMAGE_NUMBER_Y_OFFSET = 1.3;
  const BOSS_DAMAGE_NUMBER_Z_OFFSET = 0.8;
  const defendGlowPos: [number, number, number] | undefined =
    currentAction === 'defend' ? posMapRef.current.get(playerName) : undefined;
  // Block-glow position comes from the event itself (buildCombatAnimationPlan
  // stamps in the shield-holder's seat -- the local player's own when they
  // blocked, the target's when the local player's own attack got blocked),
  // not from any live selection state. Only one blink plays at a time in
  // practice (a single outgoing attack, or incoming attacks staggered apart),
  // so the most recent event's position is what's live.
  //
  // Deliberately NOT `?? GLOW_PARK_POSITION` the way defendGlowPos/
  // attackTargetGlowPos are -- those glows fade in and out at the same
  // (short, symmetric) rate, so snapping their position underground the
  // instant they go inactive is imperceptible. The block glow's fade-out is
  // intentionally much slower than its fade-in (see BLOCK_GLOW_FADE_OUT_RATE
  // below): if position snapped to GLOW_PARK_POSITION the moment the event
  // is removed (which happens right as the blink turns off, at the hit),
  // the still-fading-out light would teleport 10 units underground before
  // any of that fade-out was ever visible. Remembered instead, so the light
  // keeps shining from wherever it last blinked while it fades.
  const lastBlockGlowPosRef = useRef<[number, number, number]>(GLOW_PARK_POSITION);
  if (blockGlowEvents.length > 0) {
    lastBlockGlowPosRef.current = blockGlowEvents[blockGlowEvents.length - 1].pos;
  }
  const blockGlowPos = lastBlockGlowPosRef.current;
  const attackTargetGlowPos: [number, number, number] | undefined = (() => {
    if (currentAction !== 'attack' || !attackTarget) return undefined;
    if (selectedSoulIdx !== null && lostSouls[selectedSoulIdx]?.name === attackTarget) {
      return LOST_SOUL_POSITIONS[selectedSoulIdx % LOST_SOUL_POSITIONS.length];
    }
    const pos = posMapRef.current.get(attackTarget);
    if (!pos) return undefined;
    // getBossPosition() lifts Hades' seat PLAYER_Y + BOSS_Y_LIFT above the
    // regular player ground level (composition for its much larger model)
    // -- correct for that here, plus BOSS_ATTACK_GLOW_EXTRA_DROP for the
    // model's own larger visual footprint, so the ground glow reads at the
    // same floor level under Hades as it does under a frog, instead of
    // floating partway up its body.
    if (attackTarget === bossName) {
      return [pos[0], pos[1] - BOSS_Y_LIFT - BOSS_ATTACK_GLOW_EXTRA_DROP, pos[2]] as [number, number, number];
    }
    return pos;
  })();

  // Same red glow as attackTargetGlowPos above, but from the other side: lit
  // under whoever is attacking ME, for as long as their strike against me is
  // playing out. strikeEvents already only holds an incoming entry for its
  // animation's exact lifetime (added on 'addStrike', removed in SwordEffect's
  // onDone -- see the strikeEvents.map render below), so "an incoming strike
  // with a known attacker exists" is itself the correct on/off window; no
  // separate timer needed. attackerName is unset for anonymised attackers
  // (deception mechanic) -- nothing to glow under in that case.
  const attackedByName = strikeEvents.find((s) => s.isIncoming && s.attackerName)?.attackerName;
  const attackedByGlowPos: [number, number, number] | undefined = (() => {
    if (!attackedByName) return undefined;
    const pos = posMapRef.current.get(attackedByName);
    if (!pos) return undefined;
    if (attackedByName === bossName) {
      return [pos[0], pos[1] - BOSS_Y_LIFT - BOSS_ATTACK_GLOW_EXTRA_DROP, pos[2]] as [number, number, number];
    }
    return pos;
  })();

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

  const actionCue  = !currentAction && showActionButtonsLook
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
    setDenyRingFx([]);
    // A blocked shield's own removeImpactShield is scheduled for whenever that
    // round's combat finishes playing out (buildCombatAnimationPlan's "stays
    // up through the rest of the round" logic) -- if that's later than this
    // round's real-world duration (a short round timer, or several staggered
    // attackers), its timeout above gets cancelled before it ever fires,
    // orphaning the shield in this array forever. A new block next round then
    // adds a second one on top of it. No shield legitimately belongs to a
    // round that has already ended, so drop them all here unconditionally.
    setImpactShields([]);
    denierGlowTimeoutsRef.current.forEach(clearTimeout);
    denierGlowTimeoutsRef.current = [];
    setDenierGlowActive(false);
    setDeathPending(new Set());

    // Safety net for the sticky ready-sword/defend-shield above: the
    // round-resolution effect below (gated on the async useGameEvents fetch)
    // is what normally clears these, right when the real animation takes
    // over. If that fetch ever hiccups and the effect never runs for this
    // round, this guarantees they don't stay stuck forever.
    staggerTimeoutsRef.current.push(
      setTimeout(() => {
        setStickyAttackTarget(null);
        setDefendShieldActive(false);
      }, DEATH_POSE_FALLBACK_MS),
    );

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

    // Boss fight just won → Hades' coin: a giant golden coin arcs out of the
    // boss and lands on every surviving human (mirrors the relic-award loop
    // in engine/boss_ai.py's boss_defeated, which credits the same set).
    if (state.boss_fight && !prev.gameover && state.gameover && state.winner === 'Players') {
      const boss = state.players.find((p) => p.boss);
      const bossPos = boss ? posMapRef.current.get(boss.name) : undefined;
      if (bossPos) {
        const winnerPositions = state.players
          .filter((p) => !p.boss && !p.bot && p.hp > 0)
          .map((p) => posMapRef.current.get(p.name))
          .filter((pos): pos is [number, number, number] => !!pos);
        if (winnerPositions.length) {
          setWellRewardEvents((ev) => [...ev, ...buildHadesCoinEvents(bossPos, winnerPositions)]);
        }
      }
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

  // Drives denierGlowActive through two on/off blinks, letting
  // SelectionGlow's own gradual FADE_RATE lerp handle each transition
  // (same envelope the attack/defend/well glows use) rather than a sharper
  // hand-timed one. Stable identity (only depends on the ref) so it's safe
  // in both the real trigger effect below and the debug-preview interval.
  const triggerDenierGlow = useCallback((pos: [number, number, number]) => {
    denierGlowTimeoutsRef.current.forEach(clearTimeout);
    denierGlowTimeoutsRef.current = [];
    setDenierGlowPos(pos);
    setDenierGlowActive(true);
    const BLINK_ON_MS = 350;
    const BLINK_GAP_MS = 200;
    denierGlowTimeoutsRef.current.push(setTimeout(() => setDenierGlowActive(false), BLINK_ON_MS));
    denierGlowTimeoutsRef.current.push(setTimeout(() => setDenierGlowActive(true), BLINK_ON_MS + BLINK_GAP_MS));
    denierGlowTimeoutsRef.current.push(
      setTimeout(() => setDenierGlowActive(false), BLINK_ON_MS * 2 + BLINK_GAP_MS),
    );
  }, []);

  // Same pattern as triggerDenierGlow above, but a single on/off pulse
  // instead of two.
  const triggerWellWinnerGlow = useCallback((pos: [number, number, number]) => {
    wellWinnerGlowTimeoutsRef.current.forEach(clearTimeout);
    wellWinnerGlowTimeoutsRef.current = [];
    setWellWinnerGlowPos(pos);
    setWellWinnerGlowActive(true);
    wellWinnerGlowTimeoutsRef.current.push(setTimeout(() => setWellWinnerGlowActive(false), 350));
  }, []);

  // Deny-ring drop: fires the moment `deny_target` newly names someone (set
  // synchronously server-side on submit_deny_target, see lobby.py). Still
  // rides the shared state_update broadcast every client receives, but the
  // animation itself is private -- only rendered for the denier and the
  // denied player (deny_denier is broadcast alongside deny_target for
  // exactly this check), not for bystanders/spectators in the lobby. Own ref
  // (not prevStateRef) so ordering vs. the effect above doesn't matter.
  useEffect(() => {
    const target = state?.deny_target ?? null;
    const prevTarget = prevDenyTargetRef.current;
    prevDenyTargetRef.current = target;
    if (!target || target === prevTarget) return;
    const denier = state?.deny_denier ?? null;
    if (playerName !== target && playerName !== denier) return;
    const pos = posMapRef.current.get(target);
    if (pos) {
      const id = `deny-${target}-${Date.now()}`;
      setDenyRingFx((fx) => [...fx, { id, pos }]);
    }
    // Denier glow: only the denied player themself sees this one, under
    // whoever denied them.
    if (playerName === target && denier) {
      const denierPos = posMapRef.current.get(denier);
      if (denierPos) triggerDenierGlow(denierPos);
    }
  }, [state?.deny_target, state?.deny_denier, playerName, triggerDenierGlow]);

  // Well-winner glow: fires every time someone wins the Well, including the
  // same player winning again -- so this can't just watch "did wellwinner
  // change" (a repeat winner leaves the value identical, and the field
  // itself never resets between rounds nobody visits the well in, so it can
  // sit stale for a long stretch either way). Instead scans back to the most
  // recent "🛎 Round N 🛎" marker in the public history log and looks for
  // that round's own "X won The Well." line -- robust to state.history
  // being capped/sliced server-side (HISTORY_CAP), where array length alone
  // would silently stop signalling "new content" once the cap kicks in.
  // Visible to everyone in the lobby (unlike the deny-ring above, this isn't
  // private). WellCrown (PlayerAvatars.tsx) separately handles the crown
  // itself flying over.
  useEffect(() => {
    const history = state?.history ?? [];
    let markerIdx = -1;
    let markerRound: number | null = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const m = /🛎 Round (\d+) 🛎/.exec(history[i]);
      if (m) {
        markerIdx = i;
        markerRound = Number(m[1]);
        break;
      }
    }
    if (markerIdx === -1 || markerRound === null || markerRound === lastWellGlowRoundRef.current) return;

    for (let i = markerIdx; i < history.length; i++) {
      const wm = /^👑 (.+) won The Well\.$/.exec(history[i]);
      if (!wm) continue;
      lastWellGlowRoundRef.current = markerRound;
      const pos = posMapRef.current.get(wm[1]);
      if (pos) triggerWellWinnerGlow(pos);
      break;
    }
  }, [state?.history, triggerWellWinnerGlow]);

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
      iChoseDefend: defendShieldActiveRef.current,
    });

    // Poisoned Dagger charge (see instakillVisualActive's own comment):
    // immediately false whenever the private per-round fetch says it's not
    // held, immediately true when it's held but nothing new landed this
    // round (already had it entering the round). Newly won this round is
    // deliberately left alone here -- the addWellRewardEvents case below
    // flips it once the dagger model actually lands.
    const wonInstakillThisRound = plan.some((b) =>
      b.actions.some((a) => a.type === 'addWellRewardEvents' && a.events.some((e) => e.type === 'instakill')),
    );
    if (!gameEvents.instakill) {
      setInstakillVisualActive(false);
    } else if (!wonInstakillThisRound) {
      setInstakillVisualActive(true);
    }

    // Resource-gain flask/coin/sword rise-and-absorb -- fires first, at t=0,
    // with combat/well (below) held back to start after it finishes instead
    // of the other way around, so the two never land on top of each other.
    // chosenResourceRef (not the chosenResource prop): the page deliberately
    // never resets chosenResource itself (see its own comment on why an
    // "action"-style parent-side reset would clobber this ref before this
    // async-gated effect ever gets to read it). processedEventsRoundRef
    // above already stops this from firing twice for the same round; the
    // one accepted tradeoff of never resetting is that a round the player
    // goes fully idle in (submits nothing at all) replays their last actual
    // choice's animation rather than showing none -- a harmless cosmetic
    // edge case, not worth the added complexity to close.
    const myPosForGain = posMapRef.current.get(playerName);
    const chosen = chosenResourceRef.current;
    const playingResourceGain = !!(myPosForGain && chosen && isGainedResource(chosen));
    if (playingResourceGain) {
      const gainId = `resgain-${chosen}-${state.round}`;
      setResourceGainEvents((ev) => [...ev, { id: gainId, resource: chosen as GainedResource, pos: myPosForGain! }]);
    }
    // Only combat/well need pushing back, and only on rounds where the
    // resource-gain effect is actually going to play -- a round without one
    // (e.g. the player was denied, or picked well/attack has no matching
    // gained resource) shouldn't gain a dead pause for nothing to precede.
    const combatStartOffsetMs = playingResourceGain ? RESOURCE_GAIN_START_DELAY_MS : 0;

    // Ready-sword fallback: if this round's plan has no outgoing strike for
    // me at all (denied, target's position vanished, etc.), there's nothing
    // for the sticky preview to hand off to -- clear it now rather than
    // leaving it stuck. The normal case (an outgoing strike does play) is
    // handled by applyAction's addStrike case below, right as that strike
    // takes over.
    const hasOutgoingStrike = plan.some((b) => b.actions.some((a) => a.type === 'addStrike' && !a.strike.isIncoming));
    if (!hasOutgoingStrike) {
      if (combatStartOffsetMs <= 0) setStickyAttackTarget(null);
      else staggerTimeoutsRef.current.push(setTimeout(() => setStickyAttackTarget(null), combatStartOffsetMs));
    }

    const applyAction = (action: CombatAnimationAction) => {
      switch (action.type) {
        case 'addStrike':
          setStrikeEvents((s) => [...s, action.strike]);
          // My own outgoing strike is taking over from the sticky ready-sword
          // preview right now -- hand off in the same tick, no gap.
          if (!action.strike.isIncoming) setStickyAttackTarget(null);
          break;
        case 'addImpactShield': setImpactShields((s) => [...s, action.shield]); break;
        case 'removeImpactShield': setImpactShields((s) => s.filter((x) => x.id !== action.id)); break;
        case 'addKillFire': setKillFireEvents((e) => [...e, action.event]); break;
        case 'markDead': setDeathPending((s) => {
          if (!s.has(action.name)) return s;
          const next = new Set(s);
          next.delete(action.name);
          return next;
        }); break;
        case 'addWellRewardEvents': {
          setWellRewardEvents((ev) => [...ev, ...action.events]);
          // "info" Well reward: snapshot every other player's current stats
          // so PlayerAvatars can badge them for this round (then one more,
          // greyed) -- held back until the magnifying-glass model this same
          // action just scheduled has actually landed (its own delay, e.g.
          // staggered behind other rewards won the same round, plus the
          // full travel+hold flight before it disappears into the player),
          // rather than revealing the stats the instant the round resolves.
          const infoEvent = action.events.find((e) => e.type === 'info');
          if (infoEvent) {
            const stats = new Map<string, { hp: number; coins: number; attackDamage: number }>();
            state.players.forEach((p) => {
              if (p.name !== playerName) stats.set(p.name, { hp: p.hp, coins: p.coins, attackDamage: p.attackDamage });
            });
            const revealDelayMs = (infoEvent.delay + WELL_REWARD_FLIGHT_DUR) * 1000;
            const revealRound = state.round;
            staggerTimeoutsRef.current.push(
              setTimeout(() => setInfoReveal((prev) => {
                // Never let this go backward/sideways -- a badge should only
                // ever move forward through fresh -> stale -> gone. If
                // something (a stray reprocess, a stale gameEvents refetch)
                // ever handed this the same round again, blindly overwriting
                // would reset an already-stale badge back to freshly-won.
                if (prev && revealRound <= prev.round) return prev;
                return { round: revealRound, stats };
              }), revealDelayMs),
            );
          }
          // Poisoned Dagger: same "wait for the model to land" reveal --
          // only fires when this round's well reward actually included one
          // (i.e. exactly the round it's newly won; see instakillVisualActive's
          // own comment for why the round-transition effect above leaves that
          // case alone for this handler to pick up).
          const instakillEvent = action.events.find((e) => e.type === 'instakill');
          if (instakillEvent) {
            const revealDelayMs = Math.max(
              0,
              (instakillEvent.delay + WELL_REWARD_FLIGHT_DUR) * 1000 - INSTAKILL_GLOW_LEAD_MS,
            );
            staggerTimeoutsRef.current.push(
              setTimeout(() => setInstakillVisualActive(true), revealDelayMs),
            );
          }
          // Deny reward: same "wait for the model to land" reveal -- see
          // pendingDenyActive's own comment.
          const denyEvent = action.events.find((e) => e.type === 'deny');
          if (denyEvent) {
            const revealDelayMs = Math.max(
              0,
              (denyEvent.delay + WELL_REWARD_FLIGHT_DUR) * 1000 - DENY_REVEAL_LEAD_MS,
            );
            staggerTimeoutsRef.current.push(
              setTimeout(() => setPendingDenyActive(true), revealDelayMs),
            );
          }
          break;
        }
        case 'emitHpFx': emitHpFx(action.event); break;
        case 'addWellWinFx': setWellWinFx((fx) => [...fx, action.fx]); break;
        case 'removeWellWinFx': setWellWinFx((fx) => fx.filter((x) => x.id !== action.id)); break;
        case 'addHitFlash': setHitFlashEvents((ev) => [...ev, action.event]); break;
        case 'removeHitFlash': setHitFlashEvents((ev) => ev.filter((x) => x.id !== action.id)); break;
        case 'addBlockGlow': setBlockGlowEvents((ev) => [...ev, action.event]); break;
        case 'removeBlockGlow': setBlockGlowEvents((ev) => ev.filter((x) => x.id !== action.id)); break;
        case 'clearDefendShield': setDefendShieldActive(false); break;
      }
    };

    for (const batch of plan) {
      const apply = () => batch.actions.forEach(applyAction);
      const delayMs = batch.delayMs + combatStartOffsetMs;
      if (delayMs <= 0) {
        apply();
      } else {
        staggerTimeoutsRef.current.push(setTimeout(apply, delayMs));
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
  //   witness — fiery glow under the killer
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
      for (const role of roles) {
        const [kind, countStr] = role.split(':');
        if (kind === 'witness') {
          spawnFire(otherPos, SWORD_IMPACT_MS);
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

  // ── Debug: preview Hades' coin without actually beating a boss ─────────────
  // Append `?hadestest=1` to a lobby URL to loop the golden-coin-from-Hades
  // animation onto every currently seated player every 4s.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.search.includes('hadestest')) return;

    const fire = () => {
      const bossPos = getBossPosition().position;
      const winnerPositions = Array.from(posMapRef.current.values());
      if (!winnerPositions.length) return;
      setWellRewardEvents((ev) => [...ev, ...buildHadesCoinEvents(bossPos, winnerPositions)]);
    };
    fire();
    const interval = setInterval(fire, 4000);
    return () => clearInterval(interval);
  }, []);

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
  // The buttons that call these stay showing (showActionButtonsLook) a beat
  // past the real death reveal so the kill animation gets to play before the
  // UI gives it away -- guard the actual submission on the real, immediate
  // showAttackButtons so a click landing in that window can't submit
  // anything for an already-dead player.
  const handleAttack = useCallback((targetName: string) => {
    if (!showAttackButtons || pendingDenyActive) return;
    getSocket().emit('submit_choice', { lobby_id: lobbyId, action: 'attack', target: targetName, resource: '' });
    setSelectedSoulIdx(null);
    onAttackSelect?.(targetName);
  }, [lobbyId, onAttackSelect, showAttackButtons, pendingDenyActive]);

  // Lost souls all share one server name, so the emitted target is the shared
  // name while the clicked index is remembered locally for selection UI.
  const handleSoulAttack = useCallback((targetName: string, index: number) => {
    if (!showAttackButtons || pendingDenyActive) return;
    getSocket().emit('submit_choice', { lobby_id: lobbyId, action: 'attack', target: targetName, resource: '' });
    setSelectedSoulIdx(index);
    onAttackSelect?.(targetName);
  }, [lobbyId, onAttackSelect, showAttackButtons, pendingDenyActive]);

  // Clicking a Deny symbol immediately resolves the pending deny -- the
  // symbol disappears (pendingDenyActive flips false once the server
  // confirms) and Attack becomes available again the same round.
  const handleDeny = useCallback((targetName: string) => {
    if (!pendingDenyActive) return;
    getSocket().emit('submit_deny_target', { lobby_id: lobbyId, target: targetName });
  }, [lobbyId, pendingDenyActive]);

  const handleDefend = useCallback(() => {
    if (!showAttackButtons) return;
    getSocket().emit('submit_choice', { lobby_id: lobbyId, action: 'defend', resource: '' });
    onActionChange?.('defend');
  }, [lobbyId, onActionChange, showAttackButtons]);

  const handleWell = useCallback(() => {
    if (!showAttackButtons) return;
    getSocket().emit('submit_choice', { lobby_id: lobbyId, action: 'well', resource: '' });
    onActionChange?.('well');
  }, [lobbyId, onActionChange, showAttackButtons]);

  // Lobby-wait controls (pre-game only) — kicking and relic selection used to
  // live in the 2D "Players in Lobby" overlay list; that list is gone, so
  // they're wired up here instead, next to each player's name.
  const handleKick = useCallback((targetName: string) => {
    getSocket().emit('kick_player', { lobby_id: lobbyId, target: targetName });
  }, [lobbyId]);

  const handleToggleRelicSelection = useCallback((relicId: number) => {
    getSocket().emit('toggle_relic_selection', { lobby_id: lobbyId, relic_id: relicId });
  }, [lobbyId]);

  return (
    <>
      <CameraFlyIn
        round={state?.round ?? 0}
        radiusFactor={cameraRadiusFactor}
        spinEnabled={spinEnabled}
        resetSignal={resetCameraSignal}
        onUserAdjust={onCameraUserAdjust}
      />
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
        // !gameOver: this decay is derived purely from state.round advancing,
        // which stops happening once the game ends -- without this guard a
        // badge captured on the final round (or the one before it) would sit
        // stuck on the Game Over screen forever instead of ever reaching
        // "gone".
        let infoBadge: InfoRevealBadge | null = null;
        if (infoReveal && isOpponent && !isDead && !gameOver) {
          const s = infoReveal.stats.get(player.name);
          if (s && infoReveal.round === state?.round) infoBadge = { ...s, stale: false };
          else if (s && infoReveal.round === (state?.round ?? 0) - 1) infoBadge = { ...s, stale: true };
        }
        const showDenyForThisPlayer = pendingDenyActive && isOpponent && !isDead && (!isBossFight || isBoss);
        return (
          <group key={player.name}>
            <PlayerWithName
              name={player.name}
              position={position}
              rotation={rotation}
              isAnimating={true}
              isDead={showDeadPose}
              isWinner={!!isWinner}
              isBot={!!player.bot}
              botType={player.bot_type}
              isBoss={isBoss}
              bossHp={isBoss ? player.hp : undefined}
              bossMaxHp={isBoss ? BOSS_MAX_HP : undefined}
              frogSkinUrl={skinMap.get(player.name)}
              showAttackButton={showActionButtonsLook && !pendingDenyActive && isOpponent && !isDead && (!isBossFight || isBoss)}
              onAttack={handleAttack}
              showDenyButton={showDenyForThisPlayer}
              onDeny={handleDeny}
              isAttackSelected={currentAction === 'attack' && attackTarget === player.name}
              actionCue={actionCue}
              instakillActive={instakillVisualActive}
              chatBubble={chatBubbles.get(player.name)}
              showOwnActions={isOwnPlayer && showActionButtonsLook && !showDeadPose}
              currentAction={currentAction}
              onDefend={handleDefend}
              showShield={isOwnPlayer && defendShieldActive}
              infoReveal={infoBadge}
              showLobbyControls={showLobbyControls}
              isOwnPlayer={isOwnPlayer}
              isSpectator={player.spectator}
              isReady={state?.readyPlayers?.includes(player.name) ?? false}
              isIdle={(player.idle_rounds ?? 0) >= 2}
              selectedRelicIds={player.selected_relic_ids}
              viewerIsAdmin={isAdmin}
              onKick={handleKick}
              onToggleRelicSelection={handleToggleRelicSelection}
            />
            <SelectionGlow
              // Exact same BOSS_Y_LIFT + BOSS_ATTACK_GLOW_EXTRA_DROP
              // correction the attack-target glow applies (attackTargetGlowPos
              // above) -- several rounds of independent tuning here never
              // clearly beat just matching that one, so back to matching it.
              position={isBoss ? [position[0], position[1] - BOSS_Y_LIFT - BOSS_ATTACK_GLOW_EXTRA_DROP, position[2]] : position}
              yOffset={SELECTION_GLOW_Y_OFFSET}
              color={DENY_TARGET_GLOW_COLOR}
              active={showDenyForThisPlayer}
              radius={DENY_TARGET_GLOW_RADIUS}
              intensity={isBoss ? DENY_TARGET_GLOW_INTENSITY * 1.5 : DENY_TARGET_GLOW_INTENSITY}
              gradient
            />
          </group>
        );
      })}

      {/* Lost soul names + attack buttons — immediate; mesh loads lazily inside LostSoulModel */}
      {lostSouls.map((soul, i) => {
        const pos = LOST_SOUL_POSITIONS[i % LOST_SOUL_POSITIONS.length];
        const isDead = (soul.hp ?? 0) <= 0;
        // Same fresh/stale/gone derivation as the main player loop above
        // (including the !gameOver guard -- see its comment there). Souls
        // share one server name, so — like their shared posMap entry —
        // every soul with that name shows the same captured snapshot.
        let infoBadge: InfoRevealBadge | null = null;
        if (infoReveal && !isDead && !gameOver) {
          const s = infoReveal.stats.get(soul.name);
          if (s && infoReveal.round === state?.round) infoBadge = { ...s, stale: false };
          else if (s && infoReveal.round === (state?.round ?? 0) - 1) infoBadge = { ...s, stale: true };
        }
        const showDenyForThisSoul = pendingDenyActive && !isDead;
        return (
          // All souls share the same server name, so the name alone is
          // neither a unique key nor a unique attack target (clicking one
          // used to light up every soul's button).
          <group key={`${soul.name}-${i}`}>
            <LostSoulModel
              name={soul.name}
              index={i}
              position={pos}
              showAttackButton={showActionButtonsLook && !pendingDenyActive && !isDead}
              onAttack={handleSoulAttack}
              showDenyButton={showDenyForThisSoul}
              onDeny={handleDeny}
              isAttackSelected={currentAction === 'attack' && attackTarget === soul.name && selectedSoulIdx === i}
              actionCue={actionCue}
              infoReveal={infoBadge}
              instakillActive={instakillVisualActive}
            />
            <SelectionGlow
              position={pos}
              yOffset={SELECTION_GLOW_Y_OFFSET}
              color={DENY_TARGET_GLOW_COLOR}
              active={showDenyForThisSoul}
              radius={DENY_TARGET_GLOW_RADIUS * 0.6}
              intensity={DENY_TARGET_GLOW_INTENSITY * 0.7}
              gradient
            />
          </group>
        );
      })}

      {/* Well button — immediate; the Table GLB loads separately below.
          Uses FreshHtml, not drei's Html -- see PlayerAvatars.tsx's
          FreshHtml import comment for why. */}
      {showActionButtonsLook && (
        <FreshHtml position={[0, 3.3, 0]} center distanceFactor={3.45} zIndexRange={[0, 0]}>
          <ActionImageButton
            src="/images/buttons/well-ld.png"
            alt="The Well"
            onClick={handleWell}
            selected={currentAction === 'well'}
            glowColor="rgba(167,139,250,0.7)"
            width={180}
            className={actionCue}
            style={{ pointerEvents: 'auto' }}
          />
        </FreshHtml>
      )}

      {/* Stage 2: Well/Table model -- also clickable, same as its 2D button */}
      <Suspense fallback={null}>
        <Table position={TABLE_POSITION} scale={1.2} onClick={showActionButtonsLook ? handleWell : undefined} />
      </Suspense>

      {/* Stage 4: Well/lobby crown (floats above current well winner) */}
      <Suspense fallback={null}>
        <WellCrown worldPosition={wellCrownPosition} />
      </Suspense>

      {/* Stage 5: Sword and shield combat effects */}
      <Suspense fallback={null}>
        {stickyAttackTarget && (() => {
          const myPos  = posMapRef.current.get(playerName);
          // Souls share one name (the posMap entry is whichever came last), so
          // aim at the specific soul the player clicked instead.
          const tgtPos = selectedSoulIdx !== null && lostSouls[selectedSoulIdx]?.name === stickyAttackTarget
            ? LOST_SOUL_POSITIONS[selectedSoulIdx % LOST_SOUL_POSITIONS.length]
            : posMapRef.current.get(stickyAttackTarget);
          if (!myPos || !tgtPos) return null;
          const fp: [number, number, number] = [myPos[0],  myPos[1]  + 0.3, myPos[2]];
          const tp: [number, number, number] = [tgtPos[0], tgtPos[1] + 0.3, tgtPos[2]];
          return (
            <SwordEffect
              key={`ready-${stickyAttackTarget}`}
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
              if (ev.isIncoming) {
                // Defender's own perspective: reuse the same two outcome
                // sounds the attacker hears (attack_blocked/attacked), not
                // one blanket "something hit me" cue regardless of whether
                // it actually landed or got blocked -- targetDefended/
                // targetHit are already populated correctly for incoming
                // events (combatAnimationPlan.ts), this just wasn't
                // checking them.
                playCombatSound(ev.targetDefended ? 'attack_blocked' : 'attacked');
              } else if (ev.targetHit) {
                playCombatSound('attack_hit');
              } else if (ev.targetDefended) {
                playCombatSound('attack_blocked');
              }
              if (ev.targetDefended && !ev.isIncoming) {
                const rotY = Math.atan2(ev.fromPos[0] - ev.toPos[0], ev.fromPos[2] - ev.toPos[2]);
                const sid  = `shield-${ev.id}`;
                setImpactShields((s) => [...s, { id: sid, pos: ev.toPos, rotY, instakill: ev.instakill }]);
                const postDurSec = ev.postImpact === 'bounce' ? BOUNCE_DUR : 0;
                const holdMs = (HOLD_DUR + postDurSec) * 1000 + 242; // buffer scaled to 0.8x
                setTimeout(() => setImpactShields((s) => s.filter((x) => x.id !== sid)), holdMs);
              }
              if (ev.flashPosition) {
                const fid = `fl-sword-${ev.id}`;
                setHitFlashEvents((s) => [...s, { id: fid, position: ev.flashPosition!, instakill: ev.instakill }]);
                setTimeout(() => setHitFlashEvents((s) => s.filter((x) => x.id !== fid)), 788); // scaled to 0.8x
              }
              // Signal the HP card to react at the exact impact moment (drop +
              // shake on a hit, blue aura on a block) — incoming attacks only.
              if (ev.isIncoming && ev.incomingFx) {
                emitHpFx(ev.incomingFx);
              }
              // Floating "-X"/"0" over the struck player -- both directions
              // (my attack landing on someone else; someone else's attack
              // landing on me), unlike incomingFx above.
              if (ev.damageNumber) {
                const did = `dmg-${ev.id}`;
                setDamageNumberEvents((s) => [
                  ...s,
                  {
                    id: did,
                    position: [
                      ev.toPos[0],
                      ev.toPos[1] + (Math.abs(ev.toPos[1] - bossStrikeY) < 0.05 ? BOSS_DAMAGE_NUMBER_Y_OFFSET : 1.1),
                      ev.toPos[2] + (Math.abs(ev.toPos[1] - bossStrikeY) < 0.05 ? BOSS_DAMAGE_NUMBER_Z_OFFSET : 0),
                    ],
                    ...ev.damageNumber!,
                  },
                ]);
              }
            }}
            onDone={() => {
              if (ev.postImpact === 'bounce') {
                // The reflected sword just landed back on the attacker --
                // an attack connecting, same cue as any other incoming
                // impact, not a fresh successful hit of my own. Plays on
                // both ends: this fires identically whether `ev` came from
                // the outgoing branch (I attacked, got blocked + reflected
                // -- I hear the attack land back on me) or the incoming
                // branch (I blocked + reflected -- I hear it land on my
                // attacker), since both flow through this same
                // strikeEvents/SwordEffect rendering path.
                playCombatSound('attacked');
                if (ev.bounceFlashPos) {
                  const fid = `fl-bounce-${ev.id}`;
                  setHitFlashEvents((s) => [...s, { id: fid, position: ev.bounceFlashPos! }]);
                  setTimeout(() => setHitFlashEvents((s) => s.filter((x) => x.id !== fid)), 788); // scaled to 0.8x
                  // The reflection's own real hit -- the "-X" for HP the
                  // original attacker actually lost when it bounced back,
                  // separate from the "0" already shown at the initial
                  // block (LobbyScene's onStrike, above).
                  if (ev.bounceDamageNumber) {
                    const did = `dmg-bounce-${ev.id}`;
                    setDamageNumberEvents((s) => [
                      ...s,
                      {
                        id: did,
                        position: [
                          ev.bounceFlashPos![0],
                          ev.bounceFlashPos![1] + (Math.abs(ev.bounceFlashPos![1] - bossStrikeY) < 0.05 ? BOSS_DAMAGE_NUMBER_Y_OFFSET : 1.1),
                          ev.bounceFlashPos![2] + (Math.abs(ev.bounceFlashPos![1] - bossStrikeY) < 0.05 ? BOSS_DAMAGE_NUMBER_Z_OFFSET : 0),
                        ],
                        ...ev.bounceDamageNumber!,
                      },
                    ]);
                  }
                }
              }
              setStrikeEvents((s) => s.filter((x) => x.id !== ev.id));
            }}
          />
        ))}

        {impactShields.map((s) => (
          <group key={s.id}>
            <ShieldEffect localSpace={false} worldPosition={s.pos} worldRotationY={s.rotY} />
            {s.instakill && (
              <InstakillBurstEffect
                position={[
                  s.pos[0] + Math.sin(s.rotY) * 0.15,
                  s.pos[1],
                  s.pos[2] + Math.cos(s.rotY) * 0.15,
                ]}
                color={INSTAKILL_BLOCK_COLOR}
              />
            )}
          </group>
        ))}

        {/* Well rewards arching out of the well onto the winner (also reused for
            Hades' coin, which arcs out of the boss instead — see ev.scale) */}
        {wellRewardEvents.map((ev) => (
          <WellRewardEffect
            key={ev.id}
            type={ev.type}
            fromPosition={ev.fromPos}
            toPosition={ev.toPos}
            delay={ev.delay}
            scale={ev.scale}
            orbit={ev.orbit}
            onDone={() => setWellRewardEvents((s) => s.filter((x) => x.id !== ev.id))}
          />
        ))}

        {/* Flask/coin/sword rising above and falling back into the player at
            round-start, for whichever resource they chose that round. */}
        {resourceGainEvents.map((ev) => (
          <ResourceGainEffect
            key={ev.id}
            resource={ev.resource}
            position={ev.pos}
            onDone={() => setResourceGainEvents((s) => s.filter((x) => x.id !== ev.id))}
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

      {/* Persistent selection glows -- one steady light per action, always
          mounted and just faded via `active` (see SelectionGlow) so picking
          well/attack-target/defend lights up the 3D scene under it, not just
          the 2D button. */}
      <SelectionGlow
        position={WELL_GLOW_POSITION}
        color={WELL_SELECT_GLOW_COLOR}
        active={currentAction === 'well'}
        radius={1.2}
        intensity={4.5}
      />
      <SelectionGlow
        position={defendGlowPos ?? GLOW_PARK_POSITION}
        yOffset={SELECTION_GLOW_Y_OFFSET}
        color={DEFEND_SELECT_GLOW_COLOR}
        active={!!defendGlowPos}
        radius={1.1}
        intensity={DEFEND_SELECT_GLOW_INTENSITY}
        gradient
      />
      {/* Denier glow -- only the player who was just denied sees this one,
          under whoever denied them. Blinked twice via triggerDenierGlow
          toggling `active`, so it fades in/out gradually each time (same
          envelope as this Defend glow above) instead of a sharper blink. */}
      <SelectionGlow
        position={denierGlowPos}
        yOffset={SELECTION_GLOW_Y_OFFSET}
        color={DENY_TARGET_GLOW_COLOR}
        active={denierGlowActive}
        radius={DENY_TARGET_GLOW_RADIUS * 1.5}
        intensity={DENY_TARGET_GLOW_INTENSITY}
        gradient
      />
      {/* Well-winner glow -- visible to everyone, under whoever just won the
          Well. Single blink via triggerWellWinnerGlow toggling `active`, same
          envelope as the denier glow above. */}
      <SelectionGlow
        position={wellWinnerGlowPos}
        yOffset={SELECTION_GLOW_Y_OFFSET}
        color={WELL_WINNER_GLOW_COLOR}
        active={wellWinnerGlowActive}
        radius={WELL_WINNER_GLOW_RADIUS}
        intensity={WELL_WINNER_GLOW_INTENSITY}
        gradient
      />
      {/* Block glow -- same blue, half the defend-selection glow's strength.
          buildCombatAnimationPlan's scheduleBlockGlow switches it on shortly
          before impact and off right on impact -- SelectionGlow's own
          fade envelope turns that into a rise that peaks on the hit and
          decays after, rather than a flat-on blink. Shows up under whoever
          actually held the shield -- the local player's own seat when they
          blocked, the target's seat when the local player's own attack got
          blocked. */}
      <SelectionGlow
        position={blockGlowPos}
        yOffset={SELECTION_GLOW_Y_OFFSET}
        color={DEFEND_SELECT_GLOW_COLOR}
        active={blockGlowEvents.length > 0}
        radius={1.1}
        intensity={BLOCK_GLOW_INTENSITY}
        fadeOutRate={BLOCK_GLOW_FADE_OUT_RATE}
        gradient
      />
      {/* Poisoned Dagger cue: a larger, much slower-pulsing green glow
          layered under the red attack-target one below (rendered first so
          it sits underneath). Twice the red glow's intensity. */}
      <SelectionGlow
        position={attackTargetGlowPos ?? GLOW_PARK_POSITION}
        yOffset={SELECTION_GLOW_Y_OFFSET}
        color={ATTACK_TARGET_POISON_GLOW_COLOR}
        active={!!attackTargetGlowPos && instakillVisualActive}
        radius={ATTACK_TARGET_POISON_GLOW_RADIUS}
        intensity={(attackTarget === bossName ? 2 * 1.5 : 2) * 2}
        pulseSpeed={ATTACK_TARGET_POISON_GLOW_PULSE_SPEED}
        gradient
      />
      <SelectionGlow
        position={attackTargetGlowPos ?? GLOW_PARK_POSITION}
        yOffset={SELECTION_GLOW_Y_OFFSET}
        color={ATTACK_SELECT_GLOW_COLOR}
        active={!!attackTargetGlowPos}
        radius={1.1}
        // Hades' much larger model makes the same-strength glow read as
        // visibly weaker under it than under a frog -- boosted 1.5x
        // (tuned by eye) specifically for that target, not globally.
        intensity={attackTarget === bossName ? 2 * 1.5 : 2}
        // Additive blending (the poison glow above) just sums colour, so the
        // much larger/stronger green washed the red out to a muddy blend
        // instead of reading as "red on top". Normal blending + a higher
        // draw order makes this one visually composite over the green
        // instead, covering it (by its own gradient falloff) within its
        // radius while the green aura still shows past that edge.
        blending="normal"
        discRenderOrder={19}
        gradient
      />
      {/* Same red glow as the attack-target one above, but under whoever is
          attacking ME, while their strike animation plays. */}
      <SelectionGlow
        position={attackedByGlowPos ?? GLOW_PARK_POSITION}
        yOffset={SELECTION_GLOW_Y_OFFSET}
        color={ATTACK_SELECT_GLOW_COLOR}
        active={!!attackedByGlowPos}
        radius={1.1}
        intensity={attackedByName === bossName ? 2 * 1.5 : 2}
        gradient
      />

      {/* Red aura — pure geometry, no model; renders immediately */}
      {hitFlashEvents.map((f) => (
        <group key={f.id}>
          <AuraFlash position={f.position} />
          {f.instakill && (
            <InstakillBurstEffect
              position={[f.position[0], f.position[1] + 0.45, f.position[2]]}
              color={INSTAKILL_KILL_COLOR}
            />
          )}
        </group>
      ))}

      {/* Fiery red glow under a character when a kill is made (ATK surge) */}
      {killFireEvents.map((k) => (
        <KillFireEffect
          key={k.id}
          position={k.pos}
          onDone={() => setKillFireEvents((e) => e.filter((x) => x.id !== k.id))}
        />
      ))}

      {/* Floating "-X" (hit) / "0" (blocked) over whoever just got struck.
          Wrapped in its own Suspense: drei's <Text> (used inside
          DamageNumberEffect) suspends on its first-ever mount while
          troika's font atlas loads (see DamageNumberEffect's own preload
          comment). With no local boundary here, that suspension has
          nothing to catch it before it reaches the R3F canvas root -- which
          hides and then remounts this scene's *entire* tree, not just the
          number. Confirmed live: a black flash and every player model
          vanishing/reappearing on the very first hit of a session's first
          match, never again after (the font, once loaded, is cached for
          the rest of the session). */}
      <Suspense fallback={null}>
        {damageNumberEvents.map((d) => (
          <DamageNumberEffect
            key={d.id}
            position={d.position}
            text={d.text}
            color={d.color}
            onDone={() => setDamageNumberEvents((e) => e.filter((x) => x.id !== d.id))}
          />
        ))}
      </Suspense>

      {/* Three red hoops dropping over a player denied their action by the Well */}
      {denyRingFx.map((fx) => (
        <DenyRingEffect
          key={fx.id}
          position={fx.pos}
          onDone={() => setDenyRingFx((e) => e.filter((x) => x.id !== fx.id))}
        />
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
