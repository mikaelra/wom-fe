'use client';

import { useCallback, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FreshHtml } from '@/components/hud/FreshHtml';
import { viewAngleDeg } from '@/lib/gazeFocus';
import {
  compassPlacements, horizontalHalfFovDeg, edgeOpacity, type CompassPlacement,
} from '@/lib/cityCompass';

/**
 * N, NE, E, SE, S, SW, W, NW standing on the horizon where they belong.
 *
 * World-anchored rather than a fixed HUD strip, which is what makes them a
 * compass at all: turn on the spot and the letters slide past exactly as the
 * horizon does, so the scene tells you which way you are facing instead of
 * an overlay asserting it.
 *
 * They are shown only while in frame. Because they sit in the world that is
 * already almost true -- an off-screen mark projects outside the viewport --
 * but only almost: a mark would otherwise pop in at the edge as you pan.
 * The frame edge is computed per frame from the camera's own FOV and aspect
 * so the fade is right on a phone and a desktop alike (lib/cityCompass.ts).
 *
 * One useFrame drives all eight and writes opacity imperatively, the same
 * allocation-free discipline SkyLabels follows.
 */

interface MarkNode {
  group: THREE.Group;
  root: HTMLDivElement;
}

const _forward = new THREE.Vector3();
const _world = new THREE.Vector3();

export default function CompassMarks({
  eye,
  radius,
  distanceFactor,
}: {
  eye: readonly [number, number, number];
  radius: number;
  distanceFactor: number;
}) {
  const nodes = useRef(new Map<string, MarkNode>());
  const placements = useRef<CompassPlacement[]>(compassPlacements(eye, radius));

  const register = useCallback((key: string, node: MarkNode | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  }, []);

  useFrame(({ camera, size }) => {
    camera.getWorldDirection(_forward);
    // Vertical FOV widened by the aspect ratio is what actually decides
    // whether something off to the side is on screen.
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 70;
    const halfFov = horizontalHalfFovDeg(fov, size.width / Math.max(1, size.height));

    for (const node of nodes.current.values()) {
      node.group.getWorldPosition(_world);
      const opacity = edgeOpacity(viewAngleDeg(camera.position, _forward, _world), halfFov);
      // display:none rather than opacity alone -- an off-screen mark should
      // cost no paint, and most of the eight are off-screen at any moment.
      node.root.style.display = opacity > 0 ? 'block' : 'none';
      node.root.style.opacity = String(opacity);
    }
  });

  return (
    <>
      {placements.current.map((mark) => (
        <Mark key={mark.label} mark={mark} register={register} distanceFactor={distanceFactor} />
      ))}
    </>
  );
}

function Mark({
  mark,
  register,
  distanceFactor,
}: {
  mark: CompassPlacement;
  register: (key: string, node: MarkNode | null) => void;
  distanceFactor: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Registration waits for both the 3D group and the DOM node, which do not
  // necessarily commit in the same pass -- FreshHtml renders its children
  // into a separate React root. Deregistering matters as much: a stale entry
  // would read getWorldPosition off a detached group every frame.
  const sync = useCallback(() => {
    if (groupRef.current && rootRef.current) {
      register(mark.label, { group: groupRef.current, root: rootRef.current });
    } else {
      register(mark.label, null);
    }
  }, [mark.label, register]);

  return (
    <group ref={(g) => { groupRef.current = g; sync(); }} position={mark.position}>
      <FreshHtml center distanceFactor={distanceFactor} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div
          ref={(el) => { rootRef.current = el; sync(); }}
          // Starts hidden: the frame loop decides, and a mark must never
          // flash on for one frame before it does.
          style={{
            display: 'none',
            opacity: 0,
            whiteSpace: 'nowrap',
            // The quarter points are what you navigate by, so they carry
            // more weight than the ordinals between them.
            color: mark.cardinal ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.62)',
            fontSize: mark.cardinal ? 17 : 13,
            fontWeight: mark.cardinal ? 800 : 700,
            letterSpacing: '0.18em',
            textShadow: '0 0 8px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,1)',
          }}
        >
          {mark.label}
        </div>
      </FreshHtml>
    </group>
  );
}
