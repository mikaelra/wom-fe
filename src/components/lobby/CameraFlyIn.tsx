'use client';

import { useThree, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { usePanOffset } from '@/lib/usePanOffset';
import { SCENE_CENTER, getCameraTargetPosition, getResponsiveFov } from '@/lib/sceneConstants';

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
// bit (the "fast around" the player asked for) and eases into landing exactly
// behind the local player's own seat (yaw's equivalent of 0, seat slot 0 is
// always on the near/z+ side -- see sceneConstants' getPlayerPositions).
const SETTLE_DURATION_S = 2.4;
// Guarantees at least half a turn of visible motion before landing, even if
// the ambient orbit happened to already be near a landing point.
const MIN_EXTRA_SPIN = Math.PI;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type Phase = 'waiting' | 'settling' | 'playing';

type CameraFlyInProps = {
  /** Current round -- 0 means still waiting in the lobby. */
  round: number;
  /** How much the seat circle itself has grown (radiusGrowthFactor); the
   *  camera backs off by the same factor so a full table stays framed. */
  radiusFactor: number;
  /** Player-toggleable -- off pauses the ambient orbit in place (handy for
   *  lining up a kick/relic click without the table drifting under you). */
  spinEnabled: boolean;
};

// Camera controller — snaps to target immediately on mount so Html buttons appear in the
// correct screen position before any models load, then tracks resize / pan smoothly.
//
// Also owns the lobby-wait ambient orbit: while round is 0 the camera spins
// slowly around the table (yaw only -- pitch/zoom stay whatever the player
// left them at), and the moment the round starts it keeps spinning briefly
// before easing to a stop directly behind the local player's own seat, with
// every other seat in frame.
export default function CameraFlyIn({ round, radiusFactor, spinEnabled }: CameraFlyInProps) {
  const { camera, size } = useThree();
  // Start at the target position (not the Canvas default [33,26,33]) so there is no fly-in
  // delay and Html elements are projected correctly on the very first frame.
  const [tx, ty, tz] = getCameraTargetPosition(size.width, size.height, radiusFactor);
  const currentPosition = useRef(new THREE.Vector3(tx, ty, tz));
  const panOffset = usePanOffset();

  // A late joiner (round already > 0) skips straight to 'playing' -- no
  // spin-up for someone dropping into a game already in progress.
  const phaseRef = useRef<Phase>(round > 0 ? 'playing' : 'waiting');
  const prevRoundRef = useRef(round);
  const settleRef = useRef({ startYaw: 0, targetYaw: 0, elapsed: 0 });

  useFrame((_, delta) => {
    if (round === 0) {
      // Also covers a rematch in the same lobby: round drops back to 0, and
      // the ambient orbit (if still enabled) picks up again for the next wait.
      phaseRef.current = 'waiting';
    } else if (prevRoundRef.current === 0 && phaseRef.current === 'waiting') {
      // This edge always fires exactly once when the round starts, regardless
      // of spinEnabled -- so toggling spin off mid-wait can never leave the
      // camera stuck orbiting forever once play begins.
      const startYaw = panOffset.current.yaw;
      if (spinEnabled) {
        const targetYaw = Math.ceil((startYaw + MIN_EXTRA_SPIN) / TWO_PI) * TWO_PI;
        settleRef.current = { startYaw, targetYaw, elapsed: 0 };
        phaseRef.current = 'settling';
      } else {
        // Spin was off for the whole wait -- snap straight to the settled
        // view instead of flourishing through an animation nobody asked for.
        panOffset.current.yaw = Math.round(startYaw / TWO_PI) * TWO_PI;
        phaseRef.current = 'playing';
      }
    }
    prevRoundRef.current = round;

    if (phaseRef.current === 'waiting' && spinEnabled) {
      panOffset.current.yaw += AMBIENT_ROTATE_SPEED * delta;
    } else if (phaseRef.current === 'settling') {
      const s = settleRef.current;
      s.elapsed += delta;
      const t = Math.min(1, s.elapsed / SETTLE_DURATION_S);
      panOffset.current.yaw = s.startYaw + (s.targetYaw - s.startYaw) * easeOutCubic(t);
      if (t >= 1) phaseRef.current = 'playing';
    }
    // 'playing': yaw is left alone from here -- back to fully player-controlled drag/zoom.

    const [x, y, z] = getCameraTargetPosition(size.width, size.height, radiusFactor);
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
