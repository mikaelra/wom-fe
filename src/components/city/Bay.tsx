'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LAND_LEVEL, SEA_LEVEL } from '@/lib/cityLayout';
import {
  BAY_BED, BAY_BANK, BAY_DOCK_WIDTH, BAY_FLARE, BAY_HALF_WIDTH, bayDockLength,
} from '@/lib/cityTerrain';

/**
 * The Bay -- procedural first pass, built in /modelling.
 *
 * A stone quay at the head of the inlet lib/cityTerrain.ts carves into the
 * city's south-west corner, a timber pier running out over the water, a
 * boat under sail leaving it for the open sea, and a yellow board on the
 * quay saying the rest is still being built. Nothing here is clickable yet:
 * it is a promise, not a doorway.
 *
 * Model frame: the origin is the head of the inlet at ground level -- the
 * line where the quay wall drops into the water. **+Z is out to sea**, -Z is
 * inland, which is where the viewer stands and so the side the sign faces.
 * CityScene turns +Z onto the south-west bearing (BAY_ROTATION_Y).
 */

/** The water's surface, in the model's frame (its y = 0 is the ground). */
const WATER_Y = SEA_LEVEL - LAND_LEVEL;
/** The channel's floor, where the quay wall and the pilings stand. */
const BED_Y = BAY_BED - LAND_LEVEL;

const STONE = '#c9c0ae';
const STONE_DARK = '#a79d89';
const TIMBER = '#8a6a45';
const TIMBER_ALT = '#7d5f3d';
const PILING = '#5b4430';
const HULL = '#6b4a2b';
const HULL_BAND = '#2f5f8a';
const SAIL = '#efe4c8';
const SIGN_YELLOW = '#f2c230';
const SIGN_BROWN = '#5a3a1a';

/** The quay across the head spans the channel and both side docks, and is
 *  deeper than lib/cityTerrain.ts BAY_BANK so it hides the slope. */
const QUAY_WIDTH = 2 * (BAY_HALF_WIDTH + BAY_DOCK_WIDTH);
const QUAY_DEPTH = BAY_BANK + 1;
const QUAY_TOP = 0.3;
/** Spacing of the bollards along the side docks. */
const BOLLARD_SPACING = 9;

const PIER_LENGTH = 13;
const PIER_WIDTH = 2.2;
const DECK_TOP = 0.35;
const PLANK = 0.36;
const PLANK_GAP = 0.05;

export interface BayProps {
  position?: [number, number, number];
  rotationY?: number;
}

export default function Bay({ position = [0, 0, 0], rotationY = 0 }: BayProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Quay />
      <SideDock side={-1} />
      <SideDock side={1} />
      <Pier />
      <Boat />
      <WorkInProgressSign position={[-3.6, QUAY_TOP, -2.4]} />
    </group>
  );
}

function Quay() {
  const height = QUAY_TOP - BED_Y;
  return (
    <group>
      {/* One block from the bed up, so the wall face shows below the
          waterline through the water rather than stopping at it. */}
      <mesh position={[0, BED_Y + height / 2, -QUAY_DEPTH / 2]} castShadow receiveShadow>
        <boxGeometry args={[QUAY_WIDTH, height, QUAY_DEPTH]} />
        <meshStandardMaterial color={STONE} roughness={0.9} />
      </mesh>
      {/* Coping along the water's edge, a shade darker and proud of the
          wall, so the edge reads from across the city. */}
      <mesh position={[0, QUAY_TOP + 0.08, -0.25]} castShadow receiveShadow>
        <boxGeometry args={[QUAY_WIDTH + 0.2, 0.16, 0.6]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * The dock down one bank of the inlet, from the head quay to where the bank
 * meets the open sea (bayDockLength). The channel's edge is a straight line
 * flaring out at BAY_FLARE, so each side is one straight run of wall turned
 * onto it. It starts a quay-depth behind the head so its corner is buried in
 * the head quay rather than meeting it at a seam.
 */
function SideDock({ side }: { side: -1 | 1 }) {
  const angle = Math.atan(BAY_FLARE);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const z0 = -QUAY_DEPTH;
  const z1 = bayDockLength();
  const length = (z1 - z0) / cos;
  const height = QUAY_TOP - BED_Y;

  /** Point on the water's edge `t` out along the channel. */
  const edge = (t: number): [number, number] => [side * (BAY_HALF_WIDTH + BAY_FLARE * t), t];
  // The run's centre, pushed half a dock-width in off the water, square to
  // the edge: the outward normal of an edge heading (side·sin, cos) is
  // (side·cos, -sin).
  const [mx, mz] = edge((z0 + z1) / 2);
  const cx = mx + side * cos * (BAY_DOCK_WIDTH / 2);
  const cz = mz - sin * (BAY_DOCK_WIDTH / 2);

  const bollards: [number, number][] = [];
  for (let t = BOLLARD_SPACING / 2; t < z1 - 1; t += BOLLARD_SPACING) {
    const [x, z] = edge(t);
    bollards.push([x + side * cos * 0.45, z - sin * 0.45]);
  }

  return (
    <group>
      <group position={[cx, 0, cz]} rotation={[0, side * angle, 0]}>
        <mesh position={[0, BED_Y + height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[BAY_DOCK_WIDTH, height, length]} />
          <meshStandardMaterial color={STONE} roughness={0.9} />
        </mesh>
        {/* Coping on the water side, matching the head quay's. */}
        <mesh
          position={[-side * (BAY_DOCK_WIDTH / 2 - 0.25), QUAY_TOP + 0.08, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.6, 0.16, length]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.9} />
        </mesh>
      </group>
      {bollards.map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, QUAY_TOP + 0.36, z]} castShadow>
          <cylinderGeometry args={[0.14, 0.18, 0.4, 10]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Pier() {
  const planks = useMemo(() => {
    const out: number[] = [];
    for (let z = PLANK / 2; z < PIER_LENGTH; z += PLANK + PLANK_GAP) out.push(z);
    return out;
  }, []);
  const pilingZ = [1.4, 4.4, 7.4, 10.4, PIER_LENGTH - 0.3];
  const pilingTop = DECK_TOP + 0.3;
  const pilingHeight = pilingTop - BED_Y;

  return (
    <group>
      {planks.map((z, i) => (
        <mesh key={z} position={[0, DECK_TOP - 0.06, z]} castShadow receiveShadow>
          <boxGeometry args={[PIER_WIDTH, 0.12, PLANK]} />
          <meshStandardMaterial color={i % 2 ? TIMBER_ALT : TIMBER} roughness={0.85} />
        </mesh>
      ))}
      {/* Stringers under the planks, along each side. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (PIER_WIDTH / 2 - 0.12), DECK_TOP - 0.22, PIER_LENGTH / 2]} castShadow>
          <boxGeometry args={[0.18, 0.2, PIER_LENGTH]} />
          <meshStandardMaterial color={PILING} roughness={0.9} />
        </mesh>
      ))}
      {pilingZ.flatMap((z) =>
        [-1, 1].map((side) => (
          <mesh
            key={`${z}:${side}`}
            position={[side * (PIER_WIDTH / 2 + 0.05), BED_Y + pilingHeight / 2, z]}
            castShadow
          >
            <cylinderGeometry args={[0.15, 0.17, pilingHeight, 10]} />
            <meshStandardMaterial color={PILING} roughness={0.95} />
          </mesh>
        )),
      )}
      {/* Bollards at the end, where the boat was tied until it left. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.7, DECK_TOP + 0.2, PIER_LENGTH - 0.6]} castShadow>
          <cylinderGeometry args={[0.13, 0.16, 0.4, 10]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** Hull length, beam and depth (keel to gunwale). */
const HULL_LENGTH = 7;
const HULL_BEAM = 2.2;
const HULL_DEPTH = 1.0;
/** How much of the hull sits under the water. */
const DRAFT = 0.4;

/** The hull's plan: a pointed bow at +Z, a rounded stern at -Z. */
function hullShape(scale = 1): THREE.Shape {
  const l = (HULL_LENGTH / 2) * scale;
  const b = (HULL_BEAM / 2) * scale;
  const shape = new THREE.Shape();
  shape.moveTo(0, -l);
  shape.quadraticCurveTo(b, -l, b, -l * 0.45);
  shape.quadraticCurveTo(b, l * 0.45, 0, l);
  shape.quadraticCurveTo(-b, l * 0.45, -b, -l * 0.45);
  shape.quadraticCurveTo(-b, -l, 0, -l);
  return shape;
}

function Boat() {
  const ref = useRef<THREE.Group>(null);

  const hull = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(hullShape(), {
      depth: HULL_DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.25,
      bevelSize: 0.18,
      bevelSegments: 3,
      curveSegments: 16,
    });
    // Shape x/y is the plan; turn it so the extrusion goes up and the shape's
    // +y (the bow) points down +Z.
    geo.rotateX(Math.PI / 2);
    geo.translate(0, HULL_DEPTH, 0);
    return geo;
  }, []);

  const band = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(hullShape(1.035), {
      depth: 0.14,
      bevelEnabled: false,
      curveSegments: 16,
    });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, HULL_DEPTH - 0.05, 0);
    return geo;
  }, []);

  const sail = useMemo(() => {
    const geo = new THREE.PlaneGeometry(3.4, 2.7, 8, 6);
    // Bellied forward, the way a sail with wind in it is.
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / 1.7;
      const v = pos.getY(i) / 1.35;
      pos.setZ(i, 0.45 * (1 - u * u) * (1 - 0.5 * v * v));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useEffect(() => () => {
    hull.dispose();
    band.dispose();
    sail.dispose();
  }, [hull, band, sail]);

  // Riding the swell. Small enough to read as water, not as weather.
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.y = WATER_Y - DRAFT + 0.05 * Math.sin(t * 1.3);
    g.rotation.z = 0.035 * Math.sin(t * 0.9);
    g.rotation.x = 0.02 * Math.sin(t * 1.1 + 0.8);
  });

  const mastHeight = 5.2;

  return (
    // Clear of the pier's end and turned a touch off the channel's line, so
    // it reads as having just cast off rather than being parked.
    <group position={[3.2, 0, PIER_LENGTH + 4]} rotation={[0, 0.12, 0]}>
      <group ref={ref} position={[0, WATER_Y - DRAFT, 0]}>
        <mesh geometry={hull} castShadow receiveShadow>
          <meshStandardMaterial color={HULL} roughness={0.8} />
        </mesh>
        <mesh geometry={band}>
          <meshStandardMaterial color={HULL_BAND} roughness={0.6} />
        </mesh>
        {/* Deck, set just under the gunwale. */}
        <mesh position={[0, HULL_DEPTH - 0.12, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.86, 0.9, 1]} receiveShadow>
          <shapeGeometry args={[hullShape()]} />
          <meshStandardMaterial color={TIMBER} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, HULL_DEPTH + mastHeight / 2, 0.4]} castShadow>
          <cylinderGeometry args={[0.07, 0.1, mastHeight, 8]} />
          <meshStandardMaterial color={PILING} roughness={0.9} />
        </mesh>
        {/* Yard, across the top of the mast. */}
        <mesh position={[0, HULL_DEPTH + mastHeight - 0.45, 0.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 3.8, 6]} />
          <meshStandardMaterial color={PILING} roughness={0.9} />
        </mesh>
        <mesh geometry={sail} position={[0, HULL_DEPTH + mastHeight - 1.85, 0.55]} castShadow>
          <meshStandardMaterial color={SAIL} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <Wake />
    </group>
  );
}

/** Two pale streaks fanning back from the stern -- the one thing that says
 *  the boat is under way rather than anchored. */
function Wake() {
  return (
    <group position={[0, WATER_Y + 0.02, -HULL_LENGTH / 2 - 2.6]}>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.9, 0, 0]}
          // Plane's +Y lies sternward once flat; tilt each streak outboard.
          rotation={[-Math.PI / 2, 0, -side * 0.28]}
        >
          <planeGeometry args={[0.35, 5.5]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

const SIGN_WIDTH = 3.4;
const SIGN_HEIGHT = 1.15;
const SIGN_LIFT = 1.3;

/** Yellow board, brown lettering, painted once to a canvas. A texture
 *  rather than FreshHtml text because it is paint on a board -- it should
 *  turn, shade and fall away with the board, not float in front of it. */
function useSignTexture(text: string): THREE.CanvasTexture | null {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.round((1024 * SIGN_HEIGHT) / SIGN_WIDTH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = SIGN_YELLOW;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = SIGN_BROWN;
    ctx.lineWidth = 18;
    ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
    ctx.fillStyle = SIGN_BROWN;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 118px Georgia, "Times New Roman", serif';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [text]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function WorkInProgressSign({ position }: { position: [number, number, number] }) {
  const texture = useSignTexture('Work in progress');
  const postHeight = SIGN_LIFT + SIGN_HEIGHT;

  return (
    // Faces -Z, inland, toward the viewer; a slight lean so it looks
    // put up by hand.
    <group position={position} rotation={[0, Math.PI, 0.03]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (SIGN_WIDTH / 2 - 0.25), postHeight / 2, -0.09]} castShadow>
          <boxGeometry args={[0.14, postHeight, 0.14]} />
          <meshStandardMaterial color={SIGN_BROWN} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, SIGN_LIFT + SIGN_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[SIGN_WIDTH, SIGN_HEIGHT, 0.08]} />
        <meshStandardMaterial attach="material-0" color={SIGN_YELLOW} roughness={0.7} />
        <meshStandardMaterial attach="material-1" color={SIGN_YELLOW} roughness={0.7} />
        <meshStandardMaterial attach="material-2" color={SIGN_YELLOW} roughness={0.7} />
        <meshStandardMaterial attach="material-3" color={SIGN_YELLOW} roughness={0.7} />
        {/* +Z face of the board, which the group's half-turn points inland. */}
        <meshStandardMaterial attach="material-4" map={texture} roughness={0.7} />
        <meshStandardMaterial attach="material-5" color={SIGN_YELLOW} roughness={0.7} />
      </mesh>
    </group>
  );
}
