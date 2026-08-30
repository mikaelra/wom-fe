import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeSky } from '@/lib/astrology';
import { localFrame } from '@/lib/skyLocal';
import { CITIES } from '@/lib/cities';
import { horizonToScene, eqjToSceneMatrix, STAR_R } from '@/lib/citySkyGeometry';

const ATHENS = CITIES.find((c) => c.name === 'Athens')!;
const AT = new Date('2026-08-29T23:00:00Z'); // 02:00 Athens, EEST
const frame = localFrame(computeSky(AT), ATHENS.realLat, ATHENS.realLng);

const EYE: readonly [number, number, number] = [0, 5.2, 0];

describe('horizonToScene', () => {
  it('puts the zenith straight up', () => {
    const [x, y, z] = horizonToScene({ altitude: 90, azimuth: 0 }, 100, EYE);
    expect(x).toBeCloseTo(EYE[0], 6);
    expect(y).toBeCloseTo(EYE[1] + 100, 6);
    expect(z).toBeCloseTo(EYE[2], 6);
  });

  it('lays the compass out as -Z north, +X east', () => {
    // The scene's one arbitrary convention. Pinned so a later addition
    // cannot quietly adopt a different one.
    const at = (az: number) => horizonToScene({ altitude: 0, azimuth: az }, 100, [0, 0, 0]);
    const [nx, , nz] = at(0);
    expect(nx).toBeCloseTo(0, 6);
    expect(nz).toBeCloseTo(-100, 6);           // north
    const [ex, , ez] = at(90);
    expect(ex).toBeCloseTo(100, 6);            // east
    expect(ez).toBeCloseTo(0, 6);
    const [, , sz] = at(180);
    expect(sz).toBeCloseTo(100, 6);            // south
    const [wx] = at(270);
    expect(wx).toBeCloseTo(-100, 6);           // west
  });

  it('always lands on the sphere of the requested radius around the eye', () => {
    for (const alt of [-40, 0, 15, 60, 89]) {
      for (const az of [0, 47, 120, 200, 359]) {
        const [x, y, z] = horizonToScene({ altitude: alt, azimuth: az }, STAR_R, EYE);
        const d = Math.hypot(x - EYE[0], y - EYE[1], z - EYE[2]);
        expect(d).toBeCloseTo(STAR_R, 4);
      }
    }
  });

  it('puts anything below the horizon underneath the viewer', () => {
    const [, y] = horizonToScene({ altitude: -10, azimuth: 123 }, 100, EYE);
    expect(y).toBeLessThan(EYE[1]);
  });
});

describe('eqjToSceneMatrix', () => {
  const m = eqjToSceneMatrix(frame);
  const cols = () => {
    const e = m.elements; // column-major
    return [
      new THREE.Vector3(e[0], e[1], e[2]),
      new THREE.Vector3(e[4], e[5], e[6]),
      new THREE.Vector3(e[8], e[9], e[10]),
    ];
  };

  it('is orthonormal -- a rotation, not a squash', () => {
    const [cx, cy, cz] = cols();
    for (const c of [cx, cy, cz]) expect(c.length()).toBeCloseTo(1, 6);
    expect(cx.dot(cy)).toBeCloseTo(0, 6);
    expect(cy.dot(cz)).toBeCloseTo(0, 6);
    expect(cx.dot(cz)).toBeCloseTo(0, 6);
  });

  it('is a proper rotation, not a reflection', () => {
    // Determinant -1 would mirror the sky: constellations would come out
    // handed the wrong way round and the Milky Way would arc backwards.
    // Orthonormality alone does not catch that, which is why this is separate.
    const [cx, cy, cz] = cols();
    expect(cx.clone().cross(cy).dot(cz)).toBeCloseTo(1, 6);
    expect(m.determinant()).toBeCloseTo(1, 6);
  });

  it('sends the J2000 celestial pole almost due north, at almost the latitude', () => {
    // The same Polaris invariant skyLocal asserts, reached through the matrix
    // instead, so the matrix and the per-star path have to agree.
    //
    // "Almost" is the physics, not slack. The catalogue and the snapshot are
    // J2000, and the J2000 pole is not today's rotation pole -- precession
    // has carried it a fraction of a degree since 2000, so its altitude sits
    // ~0.15 deg off the latitude and it is a hair off the meridian. An
    // implementation that were actually wrong would be out by degrees or
    // pointing somewhere else entirely.
    const pole = new THREE.Vector3(0, 1, 0).applyMatrix4(m); // Dec +90, Y-up frame
    const altitude = THREE.MathUtils.radToDeg(Math.asin(pole.y));
    expect(Math.abs(altitude - ATHENS.realLat)).toBeLessThan(0.5);
    // Due north is -Z, with only a trace of east/west from that same offset.
    expect(pole.z).toBeLessThan(0);
    expect(Math.abs(pole.x)).toBeLessThan(0.02);   // ~1 deg of azimuth
  });

  it('turns with the sky: six hours later is a different orientation', () => {
    const later = eqjToSceneMatrix(
      localFrame(computeSky(new Date(AT.getTime() + 6 * 3600_000)), ATHENS.realLat, ATHENS.realLng),
    );
    const a = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    const b = new THREE.Vector3(1, 0, 0).applyMatrix4(later);
    expect(a.angleTo(b)).toBeGreaterThan(THREE.MathUtils.degToRad(60));
  });
});
