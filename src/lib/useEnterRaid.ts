'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBossfightLobby } from '@/lib/api';
import { useAuthFlow } from '@/lib/useAuthFlow';
import { useToast } from '@/components/Toast';

/**
 * Entering the Hades raid, name gate and all (docs/CITY_SCENE_PLAN.md §5.2).
 *
 * Lifted verbatim out of `app/page.tsx`, where it hung off the Athens sword,
 * so the city scene can own it instead. Behaviour is unchanged: a player with
 * a stored name goes straight in; anyone else gets the name -> email -> code
 * gate first, and their name is stored on the way through.
 *
 * `loading` deliberately stays true after a successful call: the next thing
 * that happens is a route change, and flicking the overlay off first would
 * show a bare scene for a frame.
 */
export function useEnterRaid() {
  const router = useRouter();
  const { showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  const go = useCallback(async (name: string) => {
    setLoading(true);
    try {
      const data = await getBossfightLobby(name);
      router.push(`/lobby?id=${data.lobby_id}`);
    } catch (err) {
      setLoading(false);
      showError(err instanceof Error ? err.message : 'Failed to enter raid.');
    }
  }, [router, showError]);

  const authFlow = useAuthFlow({
    submitErrorFallback: 'Failed to enter raid.',
    onAuthenticated: async (name, email) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('playerName', name);
        if (email) localStorage.setItem('playerEmail', email);
      }
      setGateOpen(false);
      await go(name);
    },
  });
  // authFlow is a fresh object every render, but .reset is a stable
  // useCallback(..., []) inside the hook -- pull it out so enterRaid's own
  // dependency list stays stable.
  const resetAuthFlow = authFlow.reset;

  const enterRaid = useCallback(() => {
    const name = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!name) {
      resetAuthFlow();
      setGateOpen(true);
      return;
    }
    go(name);
  }, [go, resetAuthFlow]);

  const closeGate = useCallback(() => setGateOpen(false), []);

  return { enterRaid, loading, gateOpen, closeGate, authFlow };
}
