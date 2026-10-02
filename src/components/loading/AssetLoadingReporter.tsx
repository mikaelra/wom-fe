'use client';

import { useEffect } from 'react';
import { useProgress } from '@react-three/drei';
import { setAssetsLoading } from '@/lib/loadingTracker';

/**
 * Mirrors three's loading manager (models, textures -- drei's useProgress)
 * into the loading tracker, so the corner loading mark also covers a scene's
 * assets. Render it next to a scene's <Canvas>; it draws nothing. Kept out of
 * the root layout so pages without 3D never pull in three.
 */
export default function AssetLoadingReporter() {
  const active = useProgress((s) => s.active);
  useEffect(() => {
    setAssetsLoading(active);
  }, [active]);
  useEffect(() => () => setAssetsLoading(false), []);
  return null;
}
