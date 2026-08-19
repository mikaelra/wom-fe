'use client';

import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Vector3, PerspectiveCamera, OrthographicCamera, type Camera, type Group } from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import type { ReactNode } from 'react';

function screenPosition(el: Group, camera: Camera, size: { width: number; height: number }): [number, number] {
  const objectPos = new Vector3().setFromMatrixPosition(el.matrixWorld);
  objectPos.project(camera);
  const widthHalf = size.width / 2;
  const heightHalf = size.height / 2;
  return [objectPos.x * widthHalf + widthHalf, -(objectPos.y * heightHalf) + heightHalf];
}

function isBehindCamera(el: Group, camera: Camera): boolean {
  const objectPos = new Vector3().setFromMatrixPosition(el.matrixWorld);
  const cameraPos = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const deltaCamObj = objectPos.sub(cameraPos);
  const camDir = camera.getWorldDirection(new Vector3());
  return deltaCamObj.angleTo(camDir) > Math.PI / 2;
}

function distanceScale(el: Group, camera: Camera): number {
  if (camera instanceof OrthographicCamera) return camera.zoom;
  if (camera instanceof PerspectiveCamera) {
    const objectPos = new Vector3().setFromMatrixPosition(el.matrixWorld);
    const cameraPos = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    const vFOV = (camera.fov * Math.PI) / 180;
    const dist = objectPos.distanceTo(cameraPos);
    return 1 / (2 * Math.tan(vFOV / 2) * dist);
  }
  return 1;
}

function zIndexFor(el: Group, camera: PerspectiveCamera | OrthographicCamera, zIndexRange: [number, number]): number {
  const objectPos = new Vector3().setFromMatrixPosition(el.matrixWorld);
  const cameraPos = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const dist = objectPos.distanceTo(cameraPos);
  const A = (zIndexRange[1] - zIndexRange[0]) / (camera.far - camera.near);
  const B = zIndexRange[1] - A * camera.far;
  return Math.round(A * dist + B);
}

/**
 * A trimmed fork of drei's <Html> (node_modules/@react-three/drei/web/Html.js),
 * scoped to exactly what this scene needs: a centered, distance-scaled CSS
 * overlay anchored to a 3D point (no transform/occlude/sprite/portal modes,
 * none of which any call site here uses).
 *
 * The one deliberate behavior change from upstream: upstream only
 * recomputes its translate+scale CSS when the object's projected 2D screen
 * position or camera.zoom moves by more than `eps` since the last frame --
 * it never checks camera.fov. This scene's FOV is responsive
 * (getResponsiveFov, see sceneConstants.ts) and can change while an
 * object's 2D screen position barely moves (anything near screen-center),
 * which leaves upstream's gate permanently closed and the CSS scale stuck
 * at whatever it was on the last frame that *did* cross the threshold --
 * confirmed live as buttons/HP cards freezing oversized after a round
 * starts or a viewport resize settles.
 *
 * An earlier attempt fixed that by remounting the Html whenever the
 * underlying size changed, which traded it for a worse bug: a freshly
 * mounted Html has no scale applied until the *next* animation frame (drei
 * sets the initial CSS with no transform:scale(), only adding it inside
 * useFrame), so remounting mid-game paints one full-native-size unscaled
 * frame first -- confirmed live as buttons visibly "ballooning" on the
 * first hit of a match, since a hit's DamageNumberEffect popping in is
 * exactly the kind of layout shift that changes the canvas's reported size.
 *
 * This fork removes the recompute gate entirely: translate+scale+z-index
 * are recalculated every single frame, unconditionally. The scene already
 * runs frameloop="always", so this costs the same handful of trig ops drei
 * was already doing most frames anyway -- there's no stale state left to
 * get stuck, and nothing ever remounts mid-game, so there's nothing left to
 * flash either.
 */
export function FreshHtml({
  children,
  position,
  center = false,
  distanceFactor,
  zIndexRange = [16777271, 0],
}: {
  children: ReactNode;
  position?: [number, number, number];
  center?: boolean;
  distanceFactor?: number;
  zIndexRange?: [number, number];
}) {
  const { gl, camera: rawCamera, size, events } = useThree();
  // This scene only ever renders through CameraFlyIn's PerspectiveCamera --
  // R3F's useThree() types camera as the loose base `Camera` (no fov/far/
  // near), same as drei's own Html, which relies on the same assumption
  // without a TS-visible cast (it's plain JS).
  const camera = rawCamera as PerspectiveCamera | OrthographicCamera;
  const [el] = React.useState(() => document.createElement('div'));
  const root = React.useRef<ReactDOM.Root | null>(null);
  const group = React.useRef<Group>(null);
  const target = events.connected || gl.domElement.parentNode;

  React.useLayoutEffect(() => {
    if (!target || !group.current) return;
    const currentRoot = (root.current = ReactDOM.createRoot(el));
    const [x, y] = screenPosition(group.current, camera, size);
    el.style.cssText = `position:absolute;top:0;left:0;transform:translate3d(${x}px,${y}px,0);transform-origin:0 0;`;
    target.appendChild(el);
    return () => {
      target.removeChild(el);
      currentRoot.unmount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, el]);

  React.useLayoutEffect(() => {
    root.current?.render(
      <div style={{ position: 'absolute', transform: center ? 'translate3d(-50%,-50%,0)' : 'none' }}>
        {children}
      </div>,
    );
  });

  useFrame(() => {
    if (!group.current) return;
    camera.updateMatrixWorld();
    group.current.updateWorldMatrix(true, false);
    const [x, y] = screenPosition(group.current, camera, size);
    el.style.display = isBehindCamera(group.current, camera) ? 'none' : 'block';
    el.style.zIndex = `${zIndexFor(group.current, camera, zIndexRange)}`;
    const scale = distanceFactor === undefined ? 1 : distanceScale(group.current, camera) * distanceFactor;
    el.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
  });

  return <group ref={group} position={position} />;
}
