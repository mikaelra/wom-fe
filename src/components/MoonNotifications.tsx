'use client';

import { useEffect } from 'react';
import { isIosApp } from '@/lib/appleShop';
import { syncMoonNotifications } from '@/lib/moonNotifications';

// Schedules the merchants' notifications (lib/moonNotifications.ts) once
// per launch of the iOS app. Draws nothing. Mounted once, in the root layout.
export default function MoonNotifications() {
  useEffect(() => {
    if (!isIosApp()) return;
    syncMoonNotifications().catch(() => undefined);
  }, []);
  return null;
}
