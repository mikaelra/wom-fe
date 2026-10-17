'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { fitFontSize, seedFromText, seededRandom } from '@/lib/signpostCarving';

/**
 * The carved signpost: its post and planks, with the lettering burnt INTO
 * the wood and painted rather than floating over it as DOM.
 *
 * Two users: Signpost.tsx builds the city's posts from CarvedPost and
 * CarvedPlank (adding the hover/click wiring and the live sublabels), and
 * the default export stands one on /modelling (?model=signpost) with the
 * city's arms, for sculpting.
 *
 * Every proportion is a constant up here so an iteration is a one-line edit.
 *
 * The lettering is a canvas texture on a decal laid just proud of each face
 * of a plank, in four layers: a scorch halo where the iron singed the wood
 * round the letter, the charred groove itself, the paint laid into the
 * groove (worn through in specks), and a thin charred rim cut back over the
 * paint's edge. A bump map from the same letters sinks them into the board.
 */

// --- Proportions -----------------------------------------------------------

export const POST_HEIGHT = 6.5;
export const POST_RADIUS = 0.26;
/** Wider at the foot, as if the trunk tapered. */
const POST_FOOT_FLARE = 1.3;
const POST_SEGMENTS = 12;

export const ARM_LENGTH = 3.75;
export const ARM_HEIGHT = 0.78;
const ARM_THICK = 0.26;
/** Length of the pointed end, as a fraction of the arm's height. */
const ARM_TIP = 0.8;
/** The small diagonal cut off the two shoulder corners, where the point
 *  starts. The corners against the post are left square. */
const CORNER_CUT = 0.09;
/** One straight cut across the point, this far back from it: leaves a
 *  small upright face centred on the plank's height. */
const TIP_CUT = 0.09;
/** Every free edge of a plank is rounded in from both faces towards the
 *  middle of its thickness, like a blade's edge: the outline stays where
 *  it is at mid-thickness and each face is pulled in from it. */
const EDGE_ROUND_IN = 0.07;
/** How deep into the thickness that rounding reaches from each face (the
 *  plank is ARM_THICK; half of it would bring the two faces to an edge). */
const EDGE_ROUND_DEEP = 0.08;
const EDGE_ROUND_SEGMENTS = 3;
/** How far the plank runs back into the post. Buries its post-end edge, so
 *  the plank meets the stem square instead of rounded off against it. */
const STEM_BURY = EDGE_ROUND_IN + 0.06;
/** The cut round the top rim of the post. */
const POST_TOP_CUT = 0.09;
/** Arms hang just below the top so the post reads as a post, not a cross. */
export const ARM_Y = POST_HEIGHT - 1.1;
/** How far one full tier hangs below the one above it. */
export const ARM_TIER_DROP = 1.55;

// --- Wood and burn ---------------------------------------------------------

const WOOD = '#4a3519';
const WOOD_LIGHT = '#634a27';
const WOOD_DARK = '#2e200c';
/** The groove the iron left. */
const CHAR = '#1a0d05';
/** The singe round each letter. */
const SCORCH = 'rgba(40, 20, 6, 0.55)';
const LETTER_FONT = 'Georgia, "Times New Roman", serif';
const LETTER_WEIGHT = 900;
/** How much of the painted letter is worn back to char, 0..1. */
const PAINT_WEAR = 0.18;
/** Texture pixels per world unit on a plank face. */
const PX_PER_UNIT = 384;
const BUMP_SCALE = 0.03;

// --- Glow ------------------------------------------------------------------

/** How brightly the paint in the letters lights itself. */
const LETTER_EMISSIVE = 0.33;
/** The soft colour bloom just off the letters. */
const LETTER_GLOW_OPACITY = 0.27;
/** Blur of that bloom, as a fraction of the letter height. */
const LETTER_GLOW_BLUR = 0.18;
/** The letters' glow is multiplied by this while the sign is hovered. */
const HOVER_GLOW = 1.9;

export interface CarvedSignpostArm {
  side: 'left' | 'right';
  /** 0 is the top row; fractions sit between rows. */
  tier?: number;
  /** Fraction of the full arm length. */
  lengthScale?: number;
  label: string;
  /** The paint laid into the burnt letters. */
  color: string;
}

/** The city signpost's arms, so the sandbox starts from what is live. */
export const DEFAULT_CARVED_ARMS: CarvedSignpostArm[] = [
  { side: 'left', label: 'HADES', color: '#4da6ff' },
  { side: 'right', tier: 0.5, label: 'RANKED', color: '#ff6666' },
  { side: 'left', tier: 1, label: 'EARTH', color: '#5fd88a' },
  { side: 'right', tier: 1.5, label: 'MARKET', color: '#e8d9a0' },
];

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return { canvas, ctx: canvas.getContext('2d')! };
}

/** Grain running along the canvas's width. */
function paintGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rand = seededRandom(seed);
  ctx.fillStyle = WOOD;
  ctx.fillRect(0, 0, w, h);
  const lines = Math.round(h / 3);
  for (let i = 0; i < lines; i++) {
    const y0 = rand() * h;
    const amp = 1 + rand() * (h * 0.02);
    const freq = (Math.PI * 2 * (0.5 + rand() * 2)) / w;
    const phase = rand() * Math.PI * 2;
    ctx.strokeStyle = rand() < 0.55 ? WOOD_DARK : WOOD_LIGHT;
    ctx.globalAlpha = 0.12 + rand() * 0.25;
    ctx.lineWidth = 0.6 + rand() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function makeWoodTexture(seed: number, rotate = false) {
  const { canvas, ctx } = makeCanvas(512, 256);
  paintGrain(ctx, 512, 256, seed);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (rotate) {
    tex.center.set(0.5, 0.5);
    tex.rotation = Math.PI / 2;
  }
  return tex;
}

/** The burnt, painted lettering for one plank face: colour map + bump map. */
function makeLetterTextures(label: string, color: string, boardW: number) {
  const w = boardW * PX_PER_UNIT;
  const h = ARM_HEIGHT * PX_PER_UNIT;
  const seed = seedFromText(label);
  const rand = seededRandom(seed ^ 0x9e3779b9);

  const { canvas, ctx } = makeCanvas(w, h);
  ctx.font = `${LETTER_WEIGHT} 1px ${LETTER_FONT}`;
  const fs = fitFontSize(ctx.measureText(label).width, w, h);
  const font = `${LETTER_WEIGHT} ${fs}px ${LETTER_FONT}`;
  const cx = w / 2;
  // Optical centre: caps sit a touch high on the baseline-middle.
  const cy = h / 2 + fs * 0.04;
  const setText = (c: CanvasRenderingContext2D) => {
    c.font = font;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
  };

  // 1. Scorch: the singe the iron left round the letters.
  setText(ctx);
  ctx.save();
  ctx.filter = `blur(${Math.max(2, fs * 0.08)}px)`;
  ctx.strokeStyle = SCORCH;
  ctx.lineJoin = 'round';
  ctx.lineWidth = fs * 0.22;
  ctx.strokeText(label, cx, cy);
  ctx.restore();

  // 2. The charred groove.
  setText(ctx);
  ctx.fillStyle = CHAR;
  ctx.strokeStyle = CHAR;
  ctx.lineJoin = 'round';
  ctx.lineWidth = fs * 0.1;
  ctx.strokeText(label, cx, cy);
  ctx.fillText(label, cx, cy);

  // 3. Paint laid into the groove, worn through in specks.
  const paint = makeCanvas(w, h);
  setText(paint.ctx);
  paint.ctx.fillStyle = color;
  paint.ctx.fillText(label, cx, cy);
  paint.ctx.globalCompositeOperation = 'destination-out';
  const specks = Math.round((w * h * PAINT_WEAR) / 900);
  for (let i = 0; i < specks; i++) {
    paint.ctx.globalAlpha = 0.4 + rand() * 0.6;
    paint.ctx.beginPath();
    paint.ctx.arc(rand() * w, rand() * h, 0.6 + rand() * fs * 0.025, 0, Math.PI * 2);
    paint.ctx.fill();
  }
  ctx.globalAlpha = 0.92;
  ctx.drawImage(paint.canvas, 0, 0);
  ctx.globalAlpha = 1;
  // The worn paint alone, on black: what the letters light themselves with.
  const emit = makeCanvas(w, h);
  emit.ctx.fillStyle = '#000';
  emit.ctx.fillRect(0, 0, w, h);
  emit.ctx.drawImage(paint.canvas, 0, 0);

  // The bloom off the letters: their colour, blurred, on transparent.
  const glow = makeCanvas(w, h);
  setText(glow.ctx);
  glow.ctx.filter = `blur(${fs * LETTER_GLOW_BLUR}px)`;
  glow.ctx.fillStyle = color;
  glow.ctx.strokeStyle = color;
  glow.ctx.lineWidth = fs * 0.12;
  glow.ctx.strokeText(label, cx, cy);
  glow.ctx.fillText(label, cx, cy);

  // 4. A thin charred rim cut back over the paint's edge.
  setText(ctx);
  ctx.strokeStyle = CHAR;
  ctx.lineWidth = fs * 0.035;
  ctx.strokeText(label, cx, cy);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  // Bump: board high (white), groove low (black), soft-edged.
  const bump = makeCanvas(w, h);
  bump.ctx.fillStyle = '#fff';
  bump.ctx.fillRect(0, 0, w, h);
  setText(bump.ctx);
  bump.ctx.filter = `blur(${Math.max(1, fs * 0.02)}px)`;
  bump.ctx.fillStyle = '#000';
  bump.ctx.strokeStyle = '#000';
  bump.ctx.lineWidth = fs * 0.1;
  bump.ctx.strokeText(label, cx, cy);
  bump.ctx.fillText(label, cx, cy);
  const bumpMap = new THREE.CanvasTexture(bump.canvas);
  const emissiveMap = new THREE.CanvasTexture(emit.canvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const glowMap = new THREE.CanvasTexture(glow.canvas);
  glowMap.colorSpace = THREE.SRGBColorSpace;

  return { map, bumpMap, emissiveMap, glowMap };
}

// One grain for every plank and one for every post, made on first use.
// Shared and never disposed: they live as long as the page does.
let plankGrain: THREE.Texture | null = null;
let postGrain: THREE.Texture | null = null;
function getPlankGrain() {
  plankGrain ??= makeWoodTexture(7);
  return plankGrain;
}
function getPostGrain() {
  if (!postGrain) {
    postGrain = makeWoodTexture(11, true);
    postGrain.repeat.set(1, 3);
  }
  return postGrain;
}

/** Glow planes are light, not wood: they must not catch the pointer. */
const noRaycast = () => null;

export function CarvedPost() {
  const shaft = POST_HEIGHT - POST_TOP_CUT;
  return (
    <group>
      <mesh position={[0, shaft / 2, 0]}>
        <cylinderGeometry
          args={[POST_RADIUS, POST_RADIUS * POST_FOOT_FLARE, shaft, POST_SEGMENTS]}
        />
        <meshStandardMaterial map={getPostGrain()} roughness={0.9} />
      </mesh>
      {/* The top rim cut on the diagonal, like the planks' corners. */}
      <mesh position={[0, shaft + POST_TOP_CUT / 2, 0]}>
        <cylinderGeometry
          args={[POST_RADIUS - POST_TOP_CUT, POST_RADIUS, POST_TOP_CUT, POST_SEGMENTS]}
        />
        <meshStandardMaterial map={getPostGrain()} roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * One plank, growing out from the post's surface on its side, centred on
 * its group's origin vertically. The caller places it at its tier.
 */
export function CarvedPlank({
  side,
  label,
  color,
  lengthScale = 1,
  hovered = false,
}: {
  side: 'left' | 'right';
  label: string;
  /** The paint laid into the burnt letters, and the colour they glow. */
  color: string;
  /** Fraction of the full arm length. */
  lengthScale?: number;
  hovered?: boolean;
}) {
  const dir = side === 'left' ? -1 : 1;
  const length = ARM_LENGTH * lengthScale;
  const tip = ARM_HEIGHT * ARM_TIP;
  const boost = hovered ? HOVER_GLOW : 1;

  // The plank as one piece, pointed end and all, so the grain runs on
  // through the tip instead of stopping at a seam.
  const board = useMemo(() => {
    const s = new THREE.Shape();
    const h = ARM_HEIGHT / 2;
    const c = CORNER_CUT;
    // Along the shoulder edge, back from the shoulder towards the point.
    const edge = Math.hypot(tip, h);
    const sx = (c * tip) / edge;
    const sy = (c * h) / edge;
    // Where the cut across the point meets the two slopes.
    const ty = (h * TIP_CUT) / tip;
    // Shoulders cut on the diagonal, the point cut once straight across,
    // and the end in the post left square.
    s.moveTo(-STEM_BURY, -h);
    s.lineTo(length - c, -h);
    s.lineTo(length + sx, -h + sy);
    s.lineTo(length + tip - TIP_CUT, -ty);
    s.lineTo(length + tip - TIP_CUT, ty);
    s.lineTo(length + sx, h - sy);
    s.lineTo(length - c, h);
    s.lineTo(-STEM_BURY, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: ARM_THICK - EDGE_ROUND_DEEP * 2,
      bevelEnabled: true,
      bevelThickness: EDGE_ROUND_DEEP,
      bevelSize: EDGE_ROUND_IN,
      bevelOffset: -EDGE_ROUND_IN,
      bevelSegments: EDGE_ROUND_SEGMENTS,
    });
    g.translate(0, 0, -(ARM_THICK - EDGE_ROUND_DEEP * 2) / 2);
    return g;
  }, [length, tip]);

  const plankWood = useMemo(() => {
    const t = getPlankGrain().clone();
    // Cap UVs are the shape's own units, so this is "one tile per N units".
    t.repeat.set(1 / 2.2, 1 / 1.1);
    t.offset.set(seededRandom(seedFromText(label))(), 0);
    t.needsUpdate = true;
    return t;
  }, [label]);

  const letters = useMemo(
    () => makeLetterTextures(label, color, length),
    [label, color, length],
  );
  useEffect(() => () => {
    board.dispose();
    plankWood.dispose();
    letters.map.dispose();
    letters.bumpMap.dispose();
    letters.emissiveMap.dispose();
    letters.glowMap.dispose();
  }, [board, plankWood, letters]);

  const boardX = dir * POST_RADIUS;
  const faceX = dir * (POST_RADIUS + length / 2);
  // Just proud of the face, so it never z-fights.
  const faceZ = ARM_THICK / 2 + 0.004;

  return (
    <group>
      <mesh
        geometry={board}
        position={[boardX, 0, 0]}
        rotation={[0, side === 'left' ? Math.PI : 0, 0]}
      >
        <meshStandardMaterial map={plankWood} roughness={0.85} />
      </mesh>
      {/* Front and back: each face reads the right way round from its side. */}
      {[1, -1].map((s) => (
        <mesh
          key={s}
          position={[faceX, 0, s * faceZ]}
          rotation={[0, s === 1 ? 0 : Math.PI, 0]}
        >
          <planeGeometry args={[length, ARM_HEIGHT]} />
          <meshStandardMaterial
            map={letters.map}
            bumpMap={letters.bumpMap}
            bumpScale={BUMP_SCALE}
            transparent
            alphaTest={0.02}
            roughness={0.8}
            emissive="#ffffff"
            emissiveMap={letters.emissiveMap}
            emissiveIntensity={LETTER_EMISSIVE * boost}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      ))}
      {/* The bloom off the letters, a hair in front of each lettered face. */}
      {[1, -1].map((s) => (
        <mesh
          key={`glow${s}`}
          position={[faceX, 0, s * (faceZ + 0.01)]}
          rotation={[0, s === 1 ? 0 : Math.PI, 0]}
          renderOrder={2}
          raycast={noRaycast}
        >
          <planeGeometry args={[length, ARM_HEIGHT]} />
          <meshBasicMaterial
            map={letters.glowMap}
            transparent
            opacity={LETTER_GLOW_OPACITY * boost}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** The sandbox stand: a post with the city's arms on it, inert. */
export default function CarvedSignpost({
  position = [0, 0, 0],
  rotationY = 0,
  arms = DEFAULT_CARVED_ARMS,
}: {
  position?: [number, number, number];
  rotationY?: number;
  arms?: CarvedSignpostArm[];
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <CarvedPost />
      {arms.map((arm) => (
        <group
          key={`${arm.side}-${arm.tier ?? 0}`}
          position={[0, ARM_Y - (arm.tier ?? 0) * ARM_TIER_DROP, 0]}
        >
          <CarvedPlank
            side={arm.side}
            label={arm.label}
            color={arm.color}
            lengthScale={arm.lengthScale}
          />
        </group>
      ))}
    </group>
  );
}
