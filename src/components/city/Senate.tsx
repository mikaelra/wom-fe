'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { senateColumns } from '@/lib/senateGeometry';

/**
 * The Senate -- procedural placeholder (docs/CITY_SCENE_PLAN.md §9).
 *
 * There is no Senate model yet; §9 lists one as art still to be made. This
 * is a deliberately plain classical portico built from primitives: stepped
 * base, a colonnade, an architrave ring and a domed roof with an oculus in
 * it, Pantheon-fashion. Obviously provisional, which is the point -- a
 * stock model would quietly become permanent.
 *
 * Its dimensions are props, with the city's own as the defaults. The lobby
 * builds a much larger version of the SAME building to play ranked matches
 * in, and it has to be a different size rather than a scaled copy: uniform
 * scaling would take the step height and column thickness up with it, and
 * more importantly the lobby camera sits 3.7-6.4 units back depending on
 * aspect and player count, so the arena has to be deep enough to put that
 * camera INSIDE the colonnade. Scaled to that depth, everything else is
 * cartoonishly thick. Swap the whole body for a <primitive> once the model
 * exists; neither caller cares what is inside.
 *
 * **It is hollow.** It used to have a solid cella filling the middle -- a
 * wall behind the front columns so it read as a building rather than a
 * fence. That block is gone and the colonnade now runs the full perimeter,
 * because the Senate is becoming the arena ranked matches are played in and
 * players have to fit inside it and be visible from outside. An open
 * peristyle does both: it is still unmistakably a building from the street,
 * and you can see who is in it.
 */

/** The Pantheon's oculus is 8.2m across in a 43.3m dome. */
const OCULUS_RATIO = 0.19;

/**
 * A red light in the oculus, lighting the dome from its own hole.
 *
 * Red to match RANKED_COLOR on the signpost's right arm, the way the
 * temple's blue matches the left one: each building says from a distance
 * what it sends you to.
 *
 * The strength is expressed as the illuminance it lands on the wall rather
 * than as a raw candela figure, because this component is built at two very
 * different sizes -- the city's Senate is about 8 units across and the
 * ranked arena 28. A fixed intensity would be a hot spot in one and
 * invisible in the other. Working back from the wall means the two read the
 * same: intensity = strength x reach^decay, so at reach the illuminance is
 * exactly `strength`. For scale, the city's campfire lands about 5 on the
 * signpost it lights.
 */
const OCULUS_LIGHT_COLOR = '#ff4d4d';
const OCULUS_LIGHT_STRENGTH = 8;
const OCULUS_LIGHT_DECAY = 1.6;
/** Dome height as a fraction of the building's SHORT half-axis. */
const DOME_RISE = 0.9;
/**
 * Radial segments in the dome. Named rather than inlined because the
 * corner plate's hole has to be sized against it -- see SPANDREL_TUCK.
 */
const DOME_RADIAL_SEGMENTS = 48;
/**
 * How far the corner plate's hole is pulled inside the dome's radius, as a
 * fraction of it: twice the sagitta of one of the dome's chords. A polygon
 * of N sides inscribed in a circle of radius r falls r*(1-cos(pi/N)) short
 * of it at the middle of each side, so tucking the plate twice that far
 * under guarantees an overlap rather than a seam, however big the building
 * is.
 */
const SPANDREL_TUCK = 2 * (1 - Math.cos(Math.PI / DOME_RADIAL_SEGMENTS));
const ARCHITRAVE_THICK = 0.5;

export interface SenateProps {
  position?: [number, number, number];
  color?: THREE.ColorRepresentation;
  width?: number;
  depth?: number;
  columnHeight?: number;
  columnRadius?: number;
  stepHeight?: number;
  /** Columns along the long faces. */
  columnCount?: number;
  /** Along the shorter sides. Fewer, so the long views into the open middle
   *  stay open and the building does not read as a cage. */
  sideColumnCount?: number;
  /**
   * Roofed (dome + the corner plate that fills what the dome leaves) or
   * open to the sky.
   *
   * The Market is this same building with the roof taken off -- an open
   * colonnade around a square, which is what an agora is. Both roof pieces
   * go together on purpose: the corner plate exists only to fill the
   * corners the dome leaves over, so keeping it without the dome would be
   * a rectangular collar around nothing.
   */
  roof?: boolean;
  /**
   * The colour of the light the building carries, matching the signpost arm
   * that sends you to it -- red for the Senate, green for the Market.
   *
   * Under a dome it hangs in the oculus; with the roof off there is no
   * oculus to hang it in, so it sits at the springing level and washes down
   * the colonnade instead.
   */
  accentLight?: THREE.ColorRepresentation;
}

export default function Senate({
  position = [0, 0, 0],
  color = '#D6D6D6',
  width = 8.4,
  depth = 5.0,
  columnHeight = 4.2,
  columnRadius = 0.32,
  stepHeight = 0.34,
  columnCount = 6,
  sideColumnCount = 4,
  roof = true,
  accentLight = OCULUS_LIGHT_COLOR,
}: SenateProps) {
  const WIDTH = width;
  const DEPTH = depth;
  const COLUMN_HEIGHT = columnHeight;
  const COLUMN_RADIUS = columnRadius;
  const STEP_HEIGHT = stepHeight;

  // Built as a ring in lib/senateGeometry.ts rather than four hard-coded
  // rows: placed per-side, every corner gets a column twice, which shows up
  // as z-fighting that flickers as the camera moves. A test holds that.
  const { positions: columns } = useMemo(
    () => senateColumns(WIDTH, DEPTH, COLUMN_RADIUS, columnCount, sideColumnCount),
    [WIDTH, DEPTH, COLUMN_RADIUS, columnCount, sideColumnCount],
  );

  /**
   * A dome with an oculus, in place of the pediment and the solid roof slab.
   *
   * A sphere segment whose top is simply never generated: starting theta
   * below the pole leaves a circular hole there. The proportion is the
   * Pantheon's own -- its oculus is 8.2m across in a 43.3m dome, a ratio of
   * 0.19 -- so the hole reads as an oculus rather than as missing geometry.
   *
   * Unit-sized, and scaled by ONE radius on both horizontal axes (see
   * domeRadius) rather than stretched to the building's rectangle: this is
   * a circular dome sitting on a rectangular ring, touching the middle of
   * the nearest pair of sides. The corners that leaves over are filled
   * flat -- see the spandrel plate below.
   *
   * It was briefly a square-plan cloister vault instead, which sprang from
   * the whole ring and needed no corner fill. That was wrong: a circle on
   * a square, with the leftovers flattened, is the shape being sculpted.
   */
  const dome = useMemo(() => {
    const thetaStart = Math.asin(OCULUS_RATIO / 2);
    return new THREE.SphereGeometry(
      1, DOME_RADIAL_SEGMENTS, 24,
      0, Math.PI * 2,
      thetaStart, Math.PI / 2 - thetaStart,
    );
  }, []);

  const baseTop = STEP_HEIGHT * 3;
  const halfW = (WIDTH - COLUMN_RADIUS * 4) / 2;
  const halfD = (DEPTH - COLUMN_RADIUS * 4) / 2;
  // A shallow dome rather than a true hemisphere: over a rectangle the
  // short axis sets how tall it can be before it looks like a balloon.
  const domeHeight = Math.min(halfW, halfD) * DOME_RISE;
  // How far the oculus light has to throw: the far corner of the floor it
  // stands over. Scaling the intensity by this is what lets the same
  // building read the same at the city's size and the arena's.
  const oculusReach = Math.hypot(halfW, halfD);
  /**
   * The dome's plan radius -- ONE number, not one per axis, which is what
   * makes it a circle rather than an ellipse stretched to the footprint.
   *
   * The smaller half-extent, so the circle is the largest one that still
   * sits within the architrave ring: it then touches the middle of the two
   * nearest sides exactly. On a square plan -- which the ranked arena now
   * has -- that is all four sides at once.
   */
  const domeRadius = Math.min(halfW, halfD) + ARCHITRAVE_THICK;

  /**
   * The corners between the architrave's rectangle and the dome's circle,
   * filled flat.
   *
   * One plate -- the ring's rectangle with the dome's own circle punched
   * out of it -- rather than four corner pieces. Four would be four things
   * to keep in register with a dome whose proportions are still being
   * tuned; one hole driven by the same domeRadius cannot drift out of
   * register with the dome above it.
   *
   * Built in the shape's own XY plane and laid down by the mesh's rotation.
   */
  const spandrels = useMemo(() => {
    const ox = halfW + ARCHITRAVE_THICK;
    const oz = halfD + ARCHITRAVE_THICK;
    const plate = new THREE.Shape();
    plate.moveTo(-ox, -oz);
    plate.lineTo(ox, -oz);
    plate.lineTo(ox, oz);
    plate.lineTo(-ox, oz);
    plate.closePath();
    const opening = new THREE.Path();
    // Wound the opposite way from the outline, which is how three.js tells
    // a hole from a second solid island.
    //
    // Cut SMALLER than the dome, so the plate runs on under it. Punching it
    // at exactly domeRadius is the obvious thing and it leaves a hairline
    // gap you can see as a dark seam all the way round: both curves are
    // tessellated, and the dome's base is a 48-gon inscribed in the circle
    // while the hole is a 64-gon, so between their chords the dome's edge
    // sits further in than the plate's does and daylight shows between the
    // two. SPANDREL_TUCK is twice the dome's own chord sag, which covers
    // that difference with margin at any size the building is built at --
    // it is derived from the segment count rather than being a number that
    // happened to look right on the ranked arena.
    opening.absarc(0, 0, domeRadius - domeRadius * SPANDREL_TUCK, 0, Math.PI * 2, true);
    plate.holes.push(opening);
    return new THREE.ShapeGeometry(plate, 64);
  }, [halfW, halfD, domeRadius]);


  return (
    <group position={position}>
      {/* Stepped base */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, STEP_HEIGHT * i + STEP_HEIGHT / 2, 0]}>
          <boxGeometry args={[WIDTH + 1.2 - i * 0.4, STEP_HEIGHT, DEPTH + 1.2 - i * 0.4]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}

      {/* Peristyle. No cella: the middle is deliberately empty, so a ranked
          match can be played in there and watched from outside. */}
      {columns.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, baseTop + COLUMN_HEIGHT / 2, z]}>
          <cylinderGeometry args={[COLUMN_RADIUS, COLUMN_RADIUS * 1.1, COLUMN_HEIGHT, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}

      {/* Architrave: a RING the columns carry and the dome springs from, not
          the solid slab that used to sit here. The slab would cap the
          interior, and an oculus opening onto a closed ceiling is just a
          hole in a dome nobody can see through.

          All four beams are measured off halfW/halfD -- the COLUMN RING's
          half-extents -- rather than off WIDTH/DEPTH, so the ring closes as
          a flush rectangle. The east-west pair used to span WIDTH + 2T, and
          WIDTH is not that span: halfW is (WIDTH - 4R)/2, so WIDTH + 2T
          overshot the north-south beams' outer faces by 2R at each end and
          the corners visibly spilled past the frame (1.1 units each side at
          the ranked arena's column radius). The north-south pair was always
          written in the halfD form below and never had the fault, which is
          why only one axis overhung. The dome is scaled to halfW/halfD + T
          as well, so it now springs exactly from the frame's outer edge. */}
      {([
        [0, halfD + ARCHITRAVE_THICK / 2, halfW * 2 + ARCHITRAVE_THICK * 2, ARCHITRAVE_THICK],
        [0, -halfD - ARCHITRAVE_THICK / 2, halfW * 2 + ARCHITRAVE_THICK * 2, ARCHITRAVE_THICK],
      ] as const).map(([x, z, w, d], i) => (
        <mesh key={`ew${i}`} position={[x, baseTop + COLUMN_HEIGHT + 0.3, z]}>
          <boxGeometry args={[w, 0.6, d]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      {([halfW + ARCHITRAVE_THICK / 2, -halfW - ARCHITRAVE_THICK / 2]).map((x, i) => (
        <mesh key={`ns${i}`} position={[x, baseTop + COLUMN_HEIGHT + 0.3, 0]}>
          <boxGeometry args={[ARCHITRAVE_THICK, 0.6, halfD * 2 + ARCHITRAVE_THICK * 2]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}

      {/* A red light hanging in the oculus, so the dome is lit from its own
          hole and the opening reads as an eye rather than as a gap. Sitting
          at the apex rather than below it: from here it washes the whole
          inner shell, which is the surface anyone under the dome is looking
          at. */}
      <pointLight
        position={[0, baseTop + COLUMN_HEIGHT + 0.6 + (roof ? domeHeight : 0), 0]}
        color={accentLight}
        intensity={OCULUS_LIGHT_STRENGTH * Math.pow(oculusReach, OCULUS_LIGHT_DECAY)}
        distance={oculusReach * 6}
        decay={OCULUS_LIGHT_DECAY}
      />

      {/* The roof, both pieces together: the dome and the plate that fills
          the corners it leaves over. Absent on the Market, which is this
          building open to the sky. */}
      {roof && (
        <>
        {/* The corner fill, at the dome's springing level -- the same height
            the architrave's top face reaches. DoubleSide because it is a
            zero-thickness plate and is looked up at from inside the building
            as often as down at from outside. */}
        <mesh
          geometry={spandrels}
          position={[0, baseTop + COLUMN_HEIGHT + 0.6, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial color={color} side={THREE.DoubleSide} />
        </mesh>

        {/* The dome. DoubleSide because you stand under it as often as you
            look at it -- a ranked match is played beneath this thing. */}
        <mesh
          geometry={dome}
          position={[0, baseTop + COLUMN_HEIGHT + 0.6, 0]}
          scale={[domeRadius, domeHeight, domeRadius]}
        >
          <meshStandardMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
        </>
      )}

    </group>
  );
}
