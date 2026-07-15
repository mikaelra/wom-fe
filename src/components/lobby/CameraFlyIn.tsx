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

// Camera controller — snaps to target immediately on mount so Html buttons appear in the
// correct screen position before any models load, then tracks resize / pan smoothly.
export default function CameraFlyIn() {
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
