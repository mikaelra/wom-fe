'use client';

import { useEffect } from 'react';
import { suppressLoadingOverlay } from '@/lib/loadingTracker';

/** Switches the loading overlay off while mounted -- for live lobbies, where
 *  it would get in the way of play. Draws nothing. */
export default function NoLoadingOverlay() {
  useEffect(() => suppressLoadingOverlay(), []);
  return null;
}
