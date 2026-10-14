'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { watchContextLoss } from '@/lib/webglRecovery';

/** Inside a <Canvas>: load the page again once a lost WebGL context comes
 *  back (lib/webglRecovery.ts). Draws nothing. */
export default function ContextLossRecovery() {
  const canvas = useThree((s) => s.gl.domElement);
  useEffect(() => watchContextLoss(canvas), [canvas]);
  return null;
}
