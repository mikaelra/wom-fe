'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { takeReloadReturn } from '@/lib/reloadPage';

/** Back to the page a reload left (lib/reloadPage.ts) -- in the apps a
 *  reload lands on the start page first. Mounted once, in the root layout. */
export default function RestoreAfterReload() {
  const router = useRouter();
  useEffect(() => {
    const path = takeReloadReturn();
    if (path && window.location.pathname === '/') router.replace(path);
  }, [router]);
  return null;
}
