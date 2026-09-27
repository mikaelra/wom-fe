'use client';

import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { timewarpFxState } from '@/lib/timewarpFx';

type Faded = { opacity?: number; intensity?: number; transparent?: boolean };

/**
 * Fades what it wraps -- a pin on the globe -- out while a timewarp spins
 * the sky and back in at the end (timewarpFxState.markers), and leaves it
 * alone the rest of the time.
 *
 * Works on whatever is inside: every material's opacity and every light's
 * intensity, scaled from the value it had before the fade began. Runs
 * after the wrapped component's own per-frame animation (a parent's
 * useFrame is subscribed after its children's), so a pulsing ring is
 * simply held at its faded value until the fade is over. The DOM labels
 * are out of its reach and fade through a CSS variable instead
 * (lib/timewarpFx.ts applyMarkerLabelFade).
 */
export default function TimewarpFade({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const fading = useRef(false);

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const m = timewarpFxState.markers;
    if (m >= 1 && !fading.current) return;

    group.visible = m > 0.01;
    group.traverse((obj) => {
      const targets: Faded[] = [];
      const light = obj as THREE.Light;
      if (light.isLight) targets.push(light as unknown as Faded);
      const mesh = obj as THREE.Mesh;
      if (mesh.material) {
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) targets.push(mat as unknown as Faded);
      }
      for (const t of targets) {
        const key = 'intensity' in t && typeof t.intensity === 'number' ? 'intensity' : 'opacity';
        const store = (t as { userData?: Record<string, unknown> }).userData ?? {};
        if (m < 1) {
          if (store.timewarpBase === undefined) {
            store.timewarpBase = t[key];
            store.timewarpTransparent = t.transparent;
          }
          if (key === 'opacity') t.transparent = true;
          t[key] = (store.timewarpBase as number) * m;
        } else if (store.timewarpBase !== undefined) {
          t[key] = store.timewarpBase as number;
          if (key === 'opacity') t.transparent = store.timewarpTransparent as boolean;
          delete store.timewarpBase;
          delete store.timewarpTransparent;
        }
      }
    });
    fading.current = m < 1;
  });

  return <group ref={ref}>{children}</group>;
}
