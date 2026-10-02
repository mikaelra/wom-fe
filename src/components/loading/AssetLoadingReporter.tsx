'use client';

import { useEffect } from 'react';
import { useProgress } from '@react-three/drei';
import { setAssetsLoading } from '@/lib/loadingTracker';

/**
 * Mirrors three's loading manager (models, textures -- drei's useProgress)
 * into the loading tracker: whether the scene's assets are loading and how
 * much of them has loaded, which the loading overlay raises itself for and
 * fades its grey by. Render it next to a scene's <Canvas>; it draws nothing.
 * Kept out of the root layout so pages without 3D never pull in three.
 */
export default function AssetLoadingReporter({
  gradual = false,
}: {
  /** The loading screen fades as this scene renders (the earth scene),
   *  instead of the default grey (see useLoadingBackdrop). */
  gradual?: boolean;
}) {
  const active = useProgress((s) => s.active);
  const progress = useProgress((s) => s.progress);
  useEffect(() => {
    setAssetsLoading(active, active ? progress / 100 : 1, gradual);
  }, [active, progress, gradual]);
  useEffect(() => () => setAssetsLoading(false), []);
  return null;
}
