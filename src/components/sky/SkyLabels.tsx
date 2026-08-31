'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FreshHtml } from '@/components/hud/FreshHtml';
import {
  focusOpacity, hoverOpacity, viewAngleDeg, occludedBySphere, FOCUS_INNER_DEG,
} from '@/lib/gazeFocus';

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
 *
 * On a pointing device a body also names itself when the cursor is ON it, at
 * a much tighter angle than the gaze. Gated on the pointer actually being a
 * hovering one: a touchscreen leaves `pointer` wherever it was last tapped,
 * which would strand a label on screen with nothing hovering anything.
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
  /** Nudge the label off the body it names, in ems of its own text: x is
   *  rightward, y is downward. Screen-space on purpose -- a world-space
   *  offset would swing around the body as the camera orbits, so "under and
   *  to the side" would only be true from one angle. Because FreshHtml
   *  scales the whole label with distance, an em offset behaves like a fixed
   *  world-size gap: it clears a body by the same visible margin near or
   *  far.
   *
   *  Default is dead centre, which is right where a body is a point of light
   *  (the city's sky) and wrong where it is a model with a radius (the world
   *  map's planets), where the name lands on top of the thing it names. */
  offset?: { x: number; y: number };
}

interface LabelNode {
  group: THREE.Group;
  root: HTMLDivElement;
  detail: HTMLDivElement | null;
}

const _forward = new THREE.Vector3();
const _world = new THREE.Vector3();
const _pointerDir = new THREE.Vector3();

const NO_OFFSET = { x: 0, y: 0 };

export default function SkyLabels({
  bodies, occluder, distanceFactor = 24, offset = NO_OFFSET,
}: SkyLabelsProps) {
  const nodes = useRef(new Map<string, LabelNode>());
  // A mouse or trackpad, as opposed to a finger. Read once, since it cannot
  // change without a new pointing device being plugged in.
  const canHover = useRef(false);
  useEffect(() => {
    canHover.current = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, []);

  const register = useCallback((key: string, node: LabelNode | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  }, []);

  useFrame(({ camera, pointer }) => {
    camera.getWorldDirection(_forward);

    // The direction the cursor points into the scene, unprojected straight
    // from the pointer rather than borrowed from R3F's raycaster: that one
    // is shared with click-picking (the signpost arms, the buildings), and
    // re-aiming it every frame is not something to do to state someone else
    // owns. Recomputed per frame on purpose -- the sky drifts under a
    // stationary cursor, so the label has to follow the body, not the mouse.
    const hovering = canHover.current;
    if (hovering) {
      _pointerDir.set(pointer.x, pointer.y, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize();
    }

    for (const node of nodes.current.values()) {
      node.group.getWorldPosition(_world);

      const angle = viewAngleDeg(camera.position, _forward, _world);
      // Whichever of the two intents is stronger. Looking at a body still
      // names it with no cursor involved; putting the cursor on one names it
      // wherever the camera happens to point.
      const hoverAngle = hovering
        ? viewAngleDeg(camera.position, _pointerDir, _world)
        : Infinity;
      const hover = hoverOpacity(hoverAngle);
      let opacity = Math.max(focusOpacity(angle), hover);
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
      // Hovering is a deliberate act, so it earns the detail line outright
      // rather than only at dead centre.
      if (node.detail) {
        node.detail.style.opacity = String(
          Math.max(focusOpacity(angle, 0, FOCUS_INNER_DEG), hover),
        );
      }
    }
  });

  return (
    <>
      {bodies.map((body) => (
        <GazeLabel
          key={body.key}
          body={body}
          register={register}
          distanceFactor={distanceFactor}
          offset={offset}
        />
      ))}
    </>
  );
}

function GazeLabel({
  body,
  register,
  distanceFactor,
  offset,
}: {
  body: SkyLabelBody;
  register: (key: string, node: LabelNode | null) => void;
  distanceFactor: number;
  offset: { x: number; y: number };
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
          // The offset rides here rather than on the group's position: the
          // group is what the frame loop measures the gaze and the occluder
          // against, and it has to stay ON the body. You still point at the
          // planet, the name just steps aside to be read.
          style={{
            display: 'none',
            opacity: 0,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            transform: `translate(${offset.x}em, ${offset.y}em)`,
          }}
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
