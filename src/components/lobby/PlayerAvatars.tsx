'use client';

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { useRef, useMemo, memo, Suspense, type CSSProperties, type ReactNode } from 'react';
import * as THREE from 'three';
import PlayerV1 from '@/components/Playerv1';
import ActionImageButton from '@/components/lobby/ActionImageButton';
import ShieldEffect from '@/components/lobby/ShieldEffect';
import RelicSelectionPopover from '@/components/RelicSelectionPopover';
import { guideGlowClass, type GuideHighlights } from '@/lib/guideHighlights';
import { skinUrl } from '@/lib/frogSkins';
import { COIN_RELIC_ID } from '@/types/game';

// ── Per-player HTML stack ───────────────────────────────────────────────────
// Chat bubble, ATTACK, name and DEFEND used to be four separate drei <Html>
// mounts per player — each one is reprojected to screen space and written to
// the DOM every frame. They now share ONE <Html> root anchored at the name
// (world y 0.5, distanceFactor 3.45) with the other elements absolutely
// positioned around it in pre-scale pixels. ~230px ≈ 1 world unit here, so the
// bubble/defend offsets below mirror the old world-space anchors (bubble
// 1.3, defend −0.1). ATTACK was originally up at 0.9 (above the name, right
// where the chat bubble sits) but that hid the bubble whenever a targetable
// player was chatting, so it now shares DEFEND's spot below the name instead
// -- the two never appear on the same player (attack targets other players,
// defend only ever shows on your own).
// drei's Html only recomputes its CSS `scale()` when the object's projected
// 2D screen position moves by more than `eps` (default 0.001px) since the
// last update -- it never checks camera *distance* directly. A camera dolly
// (zoom) aimed roughly at an object near screen-center barely shifts that
// object's 2D projection even though the true distance -- and so the
// correct scale -- changes a lot; once CameraFlyIn's per-frame lerp fully
// converges (steady state, zero further 2D movement), whatever scale got
// computed on the last frame that *did* cross the threshold is frozen
// indefinitely. Confirmed live: name tags/action buttons/info badges
// occasionally render far too large right after a round starts (or a
// player joins mid-game) and only correct once the camera is dragged --
// which perturbs the 2D projection enough to force a recompute. Since this
// scene already renders continuously (frameloop="always"), forcing every
// frame to recompute (eps=0) costs nothing extra and removes the
// possibility of a stuck stale scale entirely.
export const HTML_EPS = 0;

const STACK_BUBBLE_Y = -70;
// Attack sits below the name now, at the same spot as DEFEND (the two never
// show on the same player -- attack targets other players, defend only ever
// shows on your own) -- moved down from above the name so it stops
// overlapping/hiding the chat bubble when a player is chatting.
const STACK_ATTACK_Y = 138;
const STACK_INFO_Y = 130;
const STACK_DEFEND_Y = 138;

// A player's stats as revealed by an opponent's "info" Well reward. `stale`
// marks the one extra round it's shown greyed-out with a "last round" label
// before disappearing (see LobbyScene's infoReveal state, which tracks the
// round it was captured in and derives fresh/stale/gone by comparing to
// state.round).
export interface InfoRevealBadge {
  hp: number;
  coins: number;
  attackDamage: number;
  stale: boolean;
}

function stackItem(dy: number, interactive = false): CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    top: dy,
    transform: 'translate(-50%, -50%)',
    whiteSpace: 'nowrap',
    pointerEvents: interactive ? 'auto' : 'none',
    userSelect: 'none',
  };
}

// Shared by PlayerWithName and LostSoulModel — both anchor it below their
// name tag via STACK_INFO_Y.
function InfoRevealContent({ badge }: { badge: InfoRevealBadge }) {
  return (
    <div style={{
      ...stackItem(STACK_INFO_Y),
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px',
      opacity: badge.stale ? 0.45 : 1,
      filter: badge.stale ? 'grayscale(1)' : 'none',
      transition: 'opacity 0.4s ease',
    }}>
      <div style={{
        display: 'flex',
        gap: '24px',
        padding: '9px 24px',
        background: 'rgba(0,0,0,0.75)',
        border: '3px solid rgba(96,165,250,0.5)',
        borderRadius: '18px',
        fontSize: '33px',
        fontWeight: 'bold',
        color: '#e5e7eb',
      }}>
        <span>❤ {badge.hp}</span>
        <span>💰 {badge.coins}</span>
        <span>⚔ {badge.attackDamage}</span>
      </div>
      {badge.stale && (
        <span style={{
          fontSize: '27px',
          fontWeight: 'bold',
          color: '#f87171',
          textShadow: '0 0 3px rgba(0,0,0,0.9)',
        }}>
          last round
        </span>
      )}
    </div>
  );
}

// Inner components mount only while a crown is visible, so the bobbing
// useFrame (and the GLB clone) costs nothing the rest of the game.
function BobbingCrown({ url, worldPosition, yOffset, bobAmp, scale, speed = 2.2, phase = 0 }: {
  url: string;
  worldPosition: [number, number, number];
  yOffset: number;
  bobAmp: number;
  scale: number;
  /** Radians/sec. Defaults to the crown's own original speed -- WellCrown
      overrides this to match CHERUB_HOVER_SPEED below so the two don't
      visibly drift out of sync when the well winner has Cherub equipped. */
  speed?: number;
  /** Phase offset (radians), same role as HoveringModel's -- WellCrown
      passes the well winner's own worldPosition[0], the same value used as
      that player's hoverPhase, so a synced crown+Cherub move in lockstep
      rather than merely sharing a frequency. */
  phase?: number;
}) {
  const { scene } = useGLTF(url);
  const crownScene = useMemo(() => scene.clone(), [scene]);
  const ref = useRef<THREE.Group>(null);

  useFrame((clockState) => {
    if (ref.current) {
      ref.current.position.y =
        worldPosition[1] + yOffset + Math.sin(clockState.clock.elapsedTime * speed + phase) * bobAmp;
      ref.current.rotation.y = clockState.clock.elapsedTime * 0.45;
    }
  });

  return (
    <group ref={ref} position={[worldPosition[0], worldPosition[1] + yOffset, worldPosition[2]]}>
      <primitive object={crownScene} scale={scale} />
    </group>
  );
}

export function WinnerCrown({ worldPosition }: { worldPosition: [number, number, number] | null }) {
  if (!worldPosition) return null;
  return <BobbingCrown url="/models/crowns/crown_ld_v1.glb" worldPosition={worldPosition} yOffset={1.05} bobAmp={0.06} scale={0.35} />;
}

export function WellCrown({ worldPosition }: { worldPosition: [number, number, number] | null }) {
  if (!worldPosition) return null;
  // Synced to the Cherub hover below (same speed, same phase source --
  // worldPosition[0], which is exactly what PlayerWithName passes as that
  // player's own hoverPhase) so the well winner's crown and their Cherub
  // (if equipped) bob together instead of drifting apart.
  return (
    <BobbingCrown
      url="/models/crowns/well_crown_v1.glb"
      worldPosition={worldPosition}
      yOffset={0.65}
      bobAmp={0.07}
      scale={0.2}
      speed={CHERUB_HOVER_SPEED}
      phase={worldPosition[0]}
    />
  );
}


// Cherub (2e, docs/MONETIZATION_PLAN.md §3.4/§8.3) hovers in place rather
// than standing flat on the ground like a frog -- an angel that doesn't fly
// reads wrong. A separate outer group (not a change to PlayerV1 itself) so
// this sinusoidal Y offset composes with PlayerV1's own attack-lunge/death
// positioning (it damps modelRef.current.position toward a local target)
// instead of fighting it -- same "wrap, don't modify" approach as
// LostSoulModel's bob above.
//
// Tunable while live-testing: amplitude (world units) and speed
// (radians/sec) are the two knobs, angelBob is the phase offset so several
// hovering players don't bob in lockstep.
const CHERUB_HOVER_AMPLITUDE = 0.08;
const CHERUB_HOVER_SPEED = 1.6;

function HoveringModel({ children, phase = 0 }: { children: ReactNode; phase?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y =
        Math.sin(state.clock.elapsedTime * CHERUB_HOVER_SPEED + phase) * CHERUB_HOVER_AMPLITUDE;
    }
  });
  return <group ref={ref}>{children}</group>;
}

// Holds only the GLB-dependent parts of a player slot so it can be Suspense-wrapped
// independently of the HTML UI (names / action buttons) rendered by PlayerWithName.
function PlayerModelLayer({ modelUrl, isBoss, isAnimating, isDead, showShield, hover, hoverPhase }: {
  modelUrl: string;
  isBoss: boolean;
  isAnimating: boolean;
  isDead?: boolean;
  showShield?: boolean;
  /** Cherub-only: bob gently in place instead of standing flat. */
  hover?: boolean;
  hoverPhase?: number;
}) {
  const model = (
    <PlayerV1
      url={modelUrl}
      scale={isBoss ? 1.44 : 0.6}
      position={[0, 0, 0]}
      rotation={[0, 0, 0]}
      isAnimating={isAnimating}
      isDead={isDead}
    />
  );
  return (
    <>
      {/* No hover once dead -- a defeated Cherub tips onto its side (PlayerV1's
          own isDead pose) rather than floating, same as every other skin. */}
      {hover && !isDead ? <HoveringModel phase={hoverPhase}>{model}</HoveringModel> : model}
      {showShield && <ShieldEffect />}
    </>
  );
}

export const PlayerWithName = memo(function PlayerWithName({
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
  frogSkinUrl,
  // own-player action UI
  showOwnActions,
  currentAction,
  onDefend,
  showShield,
  highlight,
  infoReveal,
  // Lobby-wait row (pre-game only)
  showLobbyControls,
  isOwnPlayer,
  isSpectator,
  isReady,
  isIdle,
  selectedRelicIds,
  viewerIsAdmin,
  onKick,
  onToggleRelicSelection,
}: {
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  isAnimating: boolean;
  isDead?: boolean;
  isWinner?: boolean;
  showAttackButton?: boolean;
  /** Called with this player's name — stable across renders so memo() holds. */
  onAttack?: (name: string) => void;
  isAttackSelected?: boolean;
  actionCue?: string;
  chatBubble?: string;
  isBoss?: boolean;
  bossHp?: number;
  bossMaxHp?: number;
  frogSkinUrl?: string;
  showOwnActions?: boolean;
  currentAction?: string;
  onDefend?: () => void;
  showShield?: boolean;
  highlight?: GuideHighlights;
  /** Stats revealed by the local player's "info" Well reward, or null when none is active. */
  infoReveal?: InfoRevealBadge | null;
  /** True pre-game (round 0) — renders the kick/relic/status row below the name. */
  showLobbyControls?: boolean;
  isOwnPlayer?: boolean;
  isSpectator?: boolean;
  isReady?: boolean;
  isIdle?: boolean;
  selectedRelicIds?: number[];
  /** Whether the *viewer* (not this player) is the lobby admin — gates the kick icon. */
  viewerIsAdmin?: boolean;
  onKick?: (name: string) => void;
  onToggleRelicSelection?: (relicId: number) => void;
}) {
  const modelUrl = name === 'TURTLE' ? '/models/turtlev01.glb' : isBoss ? '/models/hades/hades_v3-ld.glb' : (frogSkinUrl ?? skinUrl('frog_green_v1'));
  const isCherub = modelUrl === skinUrl('cherub_v1');
  // Welcome-tour highlights — glow the real button(s) the current slide points at.
  const hl = highlight ?? {};
  const hlAttack = guideGlowClass(hl.attack);
  const hlDefend = guideGlowClass(hl.defend);
  // Clicking the model itself selects the same action as its button --
  // attack this player if they're a legal target, or defend if this is your
  // own model. The two flags are never both true for the same player (an
  // opponent can't also be showOwnActions), so there's no ambiguity about
  // which action a click means.
  const clickSelectable = !!showAttackButton || !!showOwnActions;
  const handleModelClick = (e: ThreeEvent<MouseEvent>) => {
    if (!clickSelectable) return;
    e.stopPropagation();
    if (showAttackButton) onAttack?.(name);
    else onDefend?.();
  };
  const handleModelPointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (!clickSelectable) return;
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
  };
  const handleModelPointerOut = () => {
    if (clickSelectable) document.body.style.cursor = 'default';
  };

  return (
    <group
      position={position}
      rotation={[rotation[0], rotation[1] + Math.PI / 2, rotation[2]]}
      onClick={handleModelClick}
      onPointerOver={handleModelPointerOver}
      onPointerOut={handleModelPointerOut}
    >
      {/* 3D model — lazy; suspends until GLB is ready */}
      <Suspense fallback={null}>
        <PlayerModelLayer
          modelUrl={modelUrl}
          isBoss={!!isBoss}
          isAnimating={isAnimating}
          isDead={isDead}
          showShield={showShield}
          hover={isCherub}
          hoverPhase={position[0]}
        />
      </Suspense>

      {/* Single Html root per player: chat bubble + ATTACK + name + DEFEND
          (see stackItem above). The boss HP card below stays separate — it uses
          a different scale (4.2) and z-order. */}
      <Html position={[0, 0.5, 0]} center distanceFactor={3.45} zIndexRange={[0, 0]} eps={HTML_EPS}>
        <div style={{ position: 'relative', width: 0, height: 0, pointerEvents: 'none', userSelect: 'none' }}>
          {chatBubble && (
            <div style={{
              ...stackItem(STACK_BUBBLE_Y),
              maxWidth: '281px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              padding: '7px 13px',
              background: 'rgba(255,255,255,0.92)',
              color: '#111',
              fontSize: '20px',
              fontWeight: '500',
              borderRadius: '16px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              textAlign: 'center',
            }}>
              {chatBubble}
              <div style={{
                position: 'absolute',
                bottom: '-11px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '11px solid transparent',
                borderRight: '11px solid transparent',
                borderTop: '11px solid rgba(255,255,255,0.92)',
              }} />
            </div>
          )}

          {/* Name tag, plus (pre-game only) the kick/relic/status row -- laid out
              as one horizontal group so the lobby controls sit right next to the
              name instead of stacking underneath it. */}
          <div style={{ ...stackItem(0, showLobbyControls), display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              fontSize: '26px',
              fontWeight: 'bold',
              // Own player gets a distinct amber tint so it reads apart from
              // everyone else's white nametag at a glance.
              color: isDead ? '#888' : isWinner ? 'gold' : isOwnPlayer ? '#fbbf24' : 'white',
              textShadow: '0 0 4px rgba(0,0,0,0.8)',
              padding: '4px 10px',
              background: 'rgba(0,0,0,0.6)',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
            }}>
              {name}
              {isWinner && ' 👑'}
              {isDead && ' ☠️'}
            </div>

            {/* Lobby-wait controls: kick (admin, other players only), relic pick
                (self) or the selected-relic badge (others), and status icons --
                the replacement for the old "Players in Lobby" overlay list, now
                living next to each seated player instead of in a separate 2D panel. */}
            {showLobbyControls && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '40px' }}>
                {isSpectator && <span title="Spectator">👁</span>}
                {isReady && <span title="Ready">✅</span>}
                {isIdle && <span title="Idle">👻</span>}
                {isOwnPlayer ? (
                  onToggleRelicSelection && (
                    // Small upward nudge to level it with the status emoji next to
                    // it, whose glyphs render higher within their own line box.
                    <span style={{ display: 'inline-flex', transform: 'translateY(-3px)' }}>
                      <RelicSelectionPopover
                        playerName={name}
                        selectedRelicIds={selectedRelicIds ?? []}
                        onToggle={onToggleRelicSelection}
                      />
                    </span>
                  )
                ) : (
                  selectedRelicIds?.includes(COIN_RELIC_ID) && (
                    <span title="Selected: will start the match with +1 coin">🪙</span>
                  )
                )}
                {viewerIsAdmin && !isOwnPlayer && !isDead && (
                  <span
                    onClick={() => onKick?.(name)}
                    title="Kick player"
                    style={{ color: '#f87171', cursor: 'pointer' }}
                  >
                    ❌
                  </span>
                )}
              </div>
            )}
          </div>

          {showAttackButton && !isBoss && (
            <ActionImageButton
              src="/images/buttons/attack-ld.png"
              alt="Attack"
              onClick={() => onAttack?.(name)}
              selected={isAttackSelected}
              glowColor="rgba(239,68,68,0.7)"
              width={180}
              className={`${actionCue} ${hlAttack}`}
              style={stackItem(STACK_ATTACK_Y, true)}
            />
          )}

          {/* DEFEND button — own player only */}
          {showOwnActions && (
            <ActionImageButton
              src="/images/buttons/defend-ld.png"
              alt="Defend"
              onClick={onDefend}
              selected={currentAction === 'defend'}
              glowColor="rgba(59,130,246,0.7)"
              width={180}
              className={`${actionCue} ${hlDefend}`}
              style={stackItem(STACK_DEFEND_Y, true)}
            />
          )}
        </div>
      </Html>
      {/* Info-reward badge — its own Html mount (same anchor/scale as the stack
          above) so its zIndexRange can sit above the boss HP card ([5,5])
          instead of being drawn underneath it when the two overlap on Hades. */}
      {infoReveal && (
        <Html position={[0, 0.5, 0]} center distanceFactor={3.45} zIndexRange={[10, 10]} eps={HTML_EPS}>
          <div style={{ position: 'relative', width: 0, height: 0, pointerEvents: 'none', userSelect: 'none' }}>
            <InfoRevealContent badge={infoReveal} />
          </div>
        </Html>
      )}
      {/* Boss HP display — floats above the Hades model in world space, tracks with camera.
          No card/title/name (Hades already gets the standard name tag every
          player does, from the shared Html root above), just the life bar,
          left-aligned. zIndexRange sits above the lost-soul/action buttons
          ([0,0]) so clicks land here first, but stays below the CSS overlay
          panels (waiting lobby + round messages, which use Tailwind
          z-10/z-20) so it renders beneath them rather than covering them. */}
      {isBoss && bossHp !== undefined && bossMaxHp !== undefined && (
        <Html position={[0, -0.5, 0]} center distanceFactor={4.2} zIndexRange={[5, 5]} eps={HTML_EPS}>
          <div style={{
            pointerEvents: showAttackButton ? 'auto' : 'none',
            userSelect: 'none',
            textAlign: 'left',
            minWidth: '240px',
          }}>
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
              <ActionImageButton
                src="/images/buttons/attack-ld.png"
                alt="Attack"
                onClick={() => onAttack?.(name)}
                selected={isAttackSelected}
                glowColor="rgba(239,68,68,0.7)"
                width={170}
                className={actionCue}
                style={{ marginTop: '10px', pointerEvents: 'auto' }}
              />
            )}
          </div>
        </Html>
      )}
    </group>
  );
});


// Behind Hades who is fixed at [0, PLAYER_Y, -1.4] (far z- side)
export const LOST_SOUL_POSITIONS: [number, number, number][] = [
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

export const LostSoulModel = memo(function LostSoulModel({
  name,
  index,
  position,
  showAttackButton,
  onAttack,
  isAttackSelected,
  actionCue,
  infoReveal,
}: {
  name: string;
  /** Slot index — souls share one server name, so this disambiguates them. */
  index: number;
  position: [number, number, number];
  showAttackButton?: boolean;
  /** Called with (name, index) — stable across renders so memo() holds. */
  onAttack?: (name: string, index: number) => void;
  isAttackSelected?: boolean;
  actionCue?: string;
  /** Stats revealed by the local player's "info" Well reward, or null when none is active. */
  infoReveal?: InfoRevealBadge | null;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.8 + position[0]) * 0.1;
    }
  });

  return (
    <group
      ref={ref}
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!showAttackButton) return;
        e.stopPropagation();
        onAttack?.(name, index);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (!showAttackButton) return;
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => { if (showAttackButton) document.body.style.cursor = 'default'; }}
    >
      {/* 3D model — lazy; name label and attack button render immediately */}
      <Suspense fallback={null}>
        <LostSoulMesh />
      </Suspense>
      {/* Name + attack button share one Html root (was two per soul). The
          button sits ~0.15 world units (≈35px pre-scale) above the name. */}
      <Html position={[0, 0.6, 0]} center distanceFactor={3.45} zIndexRange={[0, 0]} eps={HTML_EPS}>
        <div style={{ position: 'relative', width: 0, height: 0, pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{
            ...stackItem(0),
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#a78bfa',
            textShadow: '0 0 6px rgba(100,0,200,0.8)',
            padding: '2px 6px',
            background: 'rgba(0,0,0,0.6)',
            borderRadius: '4px',
          }}>
            {name}
          </div>
          {showAttackButton && (
            <ActionImageButton
              src="/images/buttons/attack-ld.png"
              alt="Attack"
              onClick={() => onAttack?.(name, index)}
              selected={isAttackSelected}
              glowColor="rgba(239,68,68,0.7)"
              width={180}
              className={actionCue}
              style={stackItem(-35, true)}
            />
          )}
        </div>
      </Html>
      {infoReveal && (
        <Html position={[0, 0.6, 0]} center distanceFactor={3.45} zIndexRange={[10, 10]} eps={HTML_EPS}>
          <div style={{ position: 'relative', width: 0, height: 0, pointerEvents: 'none', userSelect: 'none' }}>
            <InfoRevealContent badge={infoReveal} />
          </div>
        </Html>
      )}
    </group>
  );
});

export const BOSS_MAX_HP = 8;

useGLTF.preload('/models/lost_soul_v2.glb');
useGLTF.preload('/models/hades/hades_v3-ld.glb');
useGLTF.preload('/models/turtlev01.glb');
useGLTF.preload('/models/crowns/crown_ld_v1.glb');
useGLTF.preload('/models/crowns/well_crown_v1.glb');
