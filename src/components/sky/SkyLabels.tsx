'use client';

import { useCallback, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FreshHtml } from '@/components/hud/FreshHtml';
import { focusOpacity, viewAngleDeg, occludedBySphere, FOCUS_INNER_DEG } from '@/lib/gazeFocus';

/**
 * Gaze labels (docs/CITY_SCENE_PLAN.md §7).
 *
 * There is no always-on legend. A body is named only while it drifts near
 * the centre of the view; pan away and the name fades out. The sky stays
 * clean, identification becomes an act of attention, and adding an eighth
 * body needs no panel redesign.
 *
 * One `useFrame` drives every label and writes opacity imperatively, rather
 * than one hook and one piece of React state per body -- the same
 * allocation-free discipline CityMarker's SwordPinFigure and WorldMap's
 * AuraLayers already follow. Every scratch vector is module-scope.
 *
 * Built on FreshHtml, never drei's <Html>: see hud/FreshHtml.tsx for the two
 * drei bugs a per-frame label on a responsive-FOV camera would otherwise hit,
 * and §7.2 for why occlusion is a manual ray/sphere test.
 */

export interface SkyLabelBody {
  key: string;
  /** Position in the PARENT group's space -- put this component inside
   *  whatever group the bodies themselves live in and drift comes free. */
  position: THREE.Vector3;
  glyph: string;
  name: string;
  /** Usually the body's own BodyAspect.color, so label, glow shell and aura
   *  all agree by construction. */
  color: string;
  /** Second line, revealed only at full focus. Null when there is nothing
   *  to add. */
  detail?: string | null;
}

export interface SkyLabelsProps {
  bodies: SkyLabelBody[];
  /** A sphere that can hide a body -- the globe, on the world map. The city
   *  needs none: below the horizon is behind the Earth by definition. */
  occluder?: { center: THREE.Vector3; radius: number };
  /** Tunes label size against camera distance (FreshHtml's own scaling). */
  distanceFactor?: number;
}

interface LabelNode {
  group: THREE.Group;
  root: HTMLDivElement;
  detail: HTMLDivElement | null;
}

const _forward = new THREE.Vector3();
const _world = new THREE.Vector3();

export default function SkyLabels({ bodies, occluder, distanceFactor = 24 }: SkyLabelsProps) {
  const nodes = useRef(new Map<string, LabelNode>());

  const register = useCallback((key: string, node: LabelNode | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  }, []);

  useFrame(({ camera }) => {
    camera.getWorldDirection(_forward);
    for (const node of nodes.current.values()) {
      node.group.getWorldPosition(_world);

      const angle = viewAngleDeg(camera.position, _forward, _world);
      let opacity = focusOpacity(angle);
      if (opacity > 0 && occluder && occludedBySphere(camera.position, _world, occluder.center, occluder.radius)) {
        opacity = 0;
      }

      // display:none rather than opacity:0 alone -- a hidden label should
      // cost no paint, and there are seven of them every frame.
      node.root.style.display = opacity > 0 ? 'block' : 'none';
      node.root.style.opacity = String(opacity);

      // The detail line fades in only as the body approaches dead centre,
      // so a glancing pass gives you the name and a deliberate look gives
      // you the rest.
      if (node.detail) {
        node.detail.style.opacity = String(focusOpacity(angle, 0, FOCUS_INNER_DEG));
      }
    }
  });

  return (
    <>
      {bodies.map((body) => (
        <GazeLabel key={body.key} body={body} register={register} distanceFactor={distanceFactor} />
      ))}
    </>
  );
}

function GazeLabel({
  body,
  register,
  distanceFactor,
}: {
  body: SkyLabelBody;
  register: (key: string, node: LabelNode | null) => void;
  distanceFactor: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // Registration has to wait for BOTH the 3D group and the DOM node, and
  // FreshHtml renders its children into a separate React root, so they do
  // not necessarily commit in the same pass. Deregistering when either goes
  // away matters as much as registering: a stale entry would leave the frame
  // loop reading getWorldPosition off a detached group every frame.
  const sync = useCallback(() => {
    if (groupRef.current && rootRef.current) {
      register(body.key, { group: groupRef.current, root: rootRef.current, detail: detailRef.current });
    } else {
      register(body.key, null);
    }
  }, [body.key, register]);

  return (
    <group ref={(g) => { groupRef.current = g; sync(); }} position={body.position}>
      <FreshHtml center distanceFactor={distanceFactor} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div
          ref={(el) => { rootRef.current = el; sync(); }}
          // Starts hidden: the frame loop decides, and a label must never
          // flash on for one frame before it does.
          style={{ display: 'none', opacity: 0, textAlign: 'center', whiteSpace: 'nowrap' }}
        >
          <div
            style={{
              color: body.color,
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: '0.12em',
              textShadow: '0 0 8px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,1)',
            }}
          >
            {body.glyph} {body.name}
          </div>
          {body.detail && (
            <div
              ref={detailRef}
              style={{
                color: '#fff',
                opacity: 0,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textShadow: '0 0 8px rgba(0,0,0,0.95)',
                marginTop: 2,
              }}
            >
              {body.detail}
            </div>
          )}
        </div>
      </FreshHtml>
    </group>
  );
}
