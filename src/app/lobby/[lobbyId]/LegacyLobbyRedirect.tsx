'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacyLobbyRedirect({ lobbyId }: { lobbyId: string | undefined }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(lobbyId ? `/lobby?id=${lobbyId}` : '/lobby');
  }, [lobbyId, router]);

  return null;
}
