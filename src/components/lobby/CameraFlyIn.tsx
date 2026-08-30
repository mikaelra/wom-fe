'use client';

import { useThree, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { usePanOffset } from '@/lib/usePanOffset';
import { SCENE_CENTER, atStandardCameraDistance, getCameraTargetPosition, getResponsiveFov } from '@/lib/sceneConstants';

const LOBBY_LOOKAT = new THREE.Vector3(...SCENE_CENTER);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
// Scratch vectors reused by CameraFlyIn's frame loop — allocating these per
// frame caused steady GC pressure (periodic hitches).
const camTarget = new THREE.Vector3();
const camArm    = new THREE.Vector3();
const camRight  = new THREE.Vector3();

const TWO_PI = Math.PI * 2;
// Ambient pre-game orbit: a full 360° lap roughly every ~35s -- slow enough to
// read as a lazy establishing shot, not a spinning-room effect.
const AMBIENT_ROTATE_SPEED = 0.18; // rad/sec
// When the round starts, the orbit doesn't just stop -- it keeps going for a
// bit (the "fast around" the player asked for) and eases into landing behind
// the local player's own seat (seat slot 0 is always on the near/z+ side --
// see sceneConstants' getPlayerPositions), offset by PLAYING_YAW below rather
// than dead-center.
const SETTLE_DURATION_S = 2.4;
// The settled "playing" view isn't yaw 0 (dead-center behind the local
// player) -- a small offset so the local player's own seat (and its floating
// DEFEND button) clears the fixed HP/Coins/ATK resource cards pinned to
// screen-bottom-center instead of overlapping them. -0.25 rad (~14° --
// stacked on top of the -30° the camera already carried) turned out to be
// too much on mobile: it pushed the DEFEND button off-screen entirely.
const PLAYING_YAW = -Math.PI / 12; // -15°
// Guarantees at least half a turn of visible motion before landing, even if
// the ambient orbit happened to already be near a landing point.
const MIN_EXTRA_SPIN = Math.PI;
// The settle transition always resets zoom to this, regardless of whatever
// the player had scrolled/pinched to during the wait -- otherwise a zoomed-in
// view can crop the DEFEND button right out of frame the moment the round
// starts, and worse, inconsistently from one game to the next.
const SETTLE_TARGET_ZOOM = 1;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type Phase = 'waiting' | 'settling' | 'playing' | 'resetting';

type CameraFlyInProps = {
  /** Current round -- 0 means still waiting in the lobby. */
  round: number;
  /** Pin the camera somewhere specific instead of the orbiting establishing
   *  shot -- a spectator watches from over their own model's shoulder. Pan
   *  and zoom still work from there; the ambient orbit and the settle
   *  animation are skipped, since both exist to arrive at a view this
   *  already is. */
  basePosition?: [number, number, number];
  /** How much the seat circle itself has grown (radiusGrowthFactor); the
   *  camera backs off by the same factor so a full table stays framed. */
  radiusFactor: number;
  /** Player-toggleable -- off pauses the ambient orbit in place (handy for
   *  lining up a kick/relic click without the table drifting under you). */
  spinEnabled: boolean;
  /** Bumped (any change in value) by the "Reset Camera" button to trigger an
   *  ease back to the settled start-of-match view. A counter rather than a
   *  boolean so clicking Reset twice in a row (e.g. after dragging again)
   *  still fires -- see SceneOverlay's Reset Camera button. */
  resetSignal?: number;
  /** Fired on genuine player-driven drag/scroll (not the ambient orbit or
   *  any programmatic settle/reset tween) -- lets the caller show the Reset
   *  Camera button only once the player has actually touched the camera. */
  onUserAdjust?: () => void;
};

// Camera controller — snaps to target immediately on mount so Html buttons appear in the
// correct screen position before any models load, then tracks resize / pan smoothly.
//
// Also owns the lobby-wait ambient orbit: while round is 0 the camera spins
// slowly around the table (yaw only -- pitch/zoom stay whatever the player
// left them at). The moment the round starts, it always eases into the
// settled view (never an instant jump, whether or not spin was on) -- also
// resetting zoom back to its default, so the local player's seat and DEFEND
// button end up framed the same way every game regardless of how zoomed in
// they'd gotten during the wait.
export default function CameraFlyIn({
  round, radiusFactor, spinEnabled, resetSignal, onUserAdjust, basePosition,
}: CameraFlyInProps) {
  const { camera, size } = useThree();
  // Start at the target position (not the Canvas default [33,26,33]) so there is no fly-in
  // delay and Html elements are projected correctly on the very first frame.
  // A fixed pose keeps its direction but is pushed out to the same distance
  // from the table as the ordinary camera -- see atStandardCameraDistance.
  const [tx, ty, tz] = basePosition
    ? atStandardCameraDistance(basePosition, size.width, size.height, radiusFactor)
    : getCameraTargetPosition(size.width, size.height, radiusFactor);
  const currentPosition = useRef(new THREE.Vector3(tx, ty, tz));
  const panOffset = usePanOffset(onUserAdjust);

  // A late joiner (round already > 0) skips straight to 'playing' -- no
  // spin-up for someone dropping into a game already in progress. Also
  // starts them at PLAYING_YAW directly (same resting view as everyone who
  // went through the settle transition), rather than usePanOffset's own
  // default. Guarded to run only once -- this component re-renders on every
  // state_update, and re-running this every time would stomp the player's
  // own manual pan mid-game.
  const didInitLateJoinRef = useRef(false);
  if (!didInitLateJoinRef.current) {
    didInitLateJoinRef.current = true;
    if (basePosition) {
      // A fixed pose is already pointed where it should be. PLAYING_YAW is
      // an offset measured from the local PLAYER's seat so their DEFEND
      // button clears the resource cards; applied to a shoulder camera it
      // would just swing the watcher off their own shoulder.
      panOffset.current.yaw = 0;
      panOffset.current.zoom = 1;
    } else if (round > 0) {
      panOffset.current.yaw = PLAYING_YAW;
      panOffset.current.zoom = SETTLE_TARGET_ZOOM;
    }
  }
  const phaseRef = useRef<Phase>(round > 0 ? 'playing' : 'waiting');
  const prevRoundRef = useRef(round);
  const prevResetSignalRef = useRef(resetSignal);
  const settleRef = useRef({ startYaw: 0, targetYaw: 0, startPitch: 0, startZoom: 1, elapsed: 0 });

  useFrame((_, delta) => {
    // A fixed pose skips the establishing orbit and the settle entirely: it
    // is somewhere specific for a reason, and swinging it around the room
    // first would undo the reason.
    if (basePosition) phaseRef.current = 'playing';
    else if (round === 0) {
      // Also covers a rematch in the same lobby: round drops back to 0, and
      // the ambient orbit (if still enabled) picks up again for the next wait.
      phaseRef.current = 'waiting';
    } else if (!basePosition && prevRoundRef.current === 0 && phaseRef.current === 'waiting') {
      // This edge always fires exactly once when the round starts, regardless
      // of spinEnabled -- so toggling spin off mid-wait can never leave the
      // camera stuck orbiting forever once play begins. Always animates into
      // place (never an instant jump) -- with the flourish of an extra spin
      // only if spin was actually on; spin off still eases smoothly to the
      // nearest equivalent of the landing angle, just without circling round.
      const startYaw = panOffset.current.yaw;
      const targetYaw = spinEnabled
        ? Math.ceil((startYaw + MIN_EXTRA_SPIN - PLAYING_YAW) / TWO_PI) * TWO_PI + PLAYING_YAW
        : Math.round((startYaw - PLAYING_YAW) / TWO_PI) * TWO_PI + PLAYING_YAW;
      settleRef.current = { startYaw, targetYaw, startPitch: panOffset.current.pitch, startZoom: panOffset.current.zoom, elapsed: 0 };
      phaseRef.current = 'settling';
    } else if (resetSignal !== prevResetSignalRef.current && phaseRef.current === 'playing') {
      // "Reset Camera" button: ease straight back to the same settled view a
      // fresh round lands on -- yaw/zoom via the same tween the round-start
      // settle uses, plus pitch (which that settle deliberately leaves alone,
      // since round-start never needs to touch it) back to its own default.
      const startYaw = panOffset.current.yaw;
      const targetYaw = Math.round((startYaw - PLAYING_YAW) / TWO_PI) * TWO_PI + PLAYING_YAW;
      settleRef.current = { startYaw, targetYaw, startPitch: panOffset.current.pitch, startZoom: panOffset.current.zoom, elapsed: 0 };
      phaseRef.current = 'resetting';
    }
    prevRoundRef.current = round;
    prevResetSignalRef.current = resetSignal;

    if (phaseRef.current === 'waiting' && spinEnabled) {
      panOffset.current.yaw += AMBIENT_ROTATE_SPEED * delta;
    } else if (phaseRef.current === 'settling') {
      const s = settleRef.current;
      s.elapsed += delta;
      const t = Math.min(1, s.elapsed / SETTLE_DURATION_S);
      const eased = easeOutCubic(t);
      panOffset.current.yaw = s.startYaw + (s.targetYaw - s.startYaw) * eased;
      panOffset.current.zoom = s.startZoom + (SETTLE_TARGET_ZOOM - s.startZoom) * eased;
      if (t >= 1) phaseRef.current = 'playing';
    } else if (phaseRef.current === 'resetting') {
      const s = settleRef.current;
      s.elapsed += delta;
      const t = Math.min(1, s.elapsed / SETTLE_DURATION_S);
      const eased = easeOutCubic(t);
      panOffset.current.yaw = s.startYaw + (s.targetYaw - s.startYaw) * eased;
      panOffset.current.pitch = s.startPitch + (0 - s.startPitch) * eased;
      panOffset.current.zoom = s.startZoom + (SETTLE_TARGET_ZOOM - s.startZoom) * eased;
      if (t >= 1) phaseRef.current = 'playing';
    }
    // 'playing': yaw/zoom are left alone from here -- back to fully player-controlled drag/zoom.

    const [x, y, z] = basePosition
      ? atStandardCameraDistance(basePosition, size.width, size.height, radiusFactor)
      : getCameraTargetPosition(size.width, size.height, radiusFactor);
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
