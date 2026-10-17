'use client';

import { useEffect } from 'react';
import { installIosZoomReset, isIosDevice } from '@/lib/iosZoomReset';

/** Zooms iOS back out after typing -- see lib/iosZoomReset.ts. */
export default function IosZoomReset() {
  useEffect(() => (isIosDevice() ? installIosZoomReset() : undefined), []);
  return null;
}
