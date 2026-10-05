'use client';

import { useEffect, useState } from 'react';
import ConfirmModal from '@/components/market/ConfirmModal';
import { isSteamClient, quitGame, shouldOpenExitPrompt } from '@/lib/steamShell';

/**
 * Steam client only: Escape opens an "exit the game" prompt, and Escape
 * again closes it. Renders nothing on the web or in the mobile build.
 * `disabled` keeps it shut while the page has its own full-screen layer up.
 */
export default function ExitGamePrompt({ disabled = false }: { disabled?: boolean }) {
  const [steam] = useState(() => isSteamClient());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!steam) return;
    const onKey = (e: KeyboardEvent) => {
      if (open) {
        if (e.key === 'Escape') setOpen(false);
        return;
      }
      if (!disabled && shouldOpenExitPrompt(e, document)) setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steam, open, disabled]);

  if (!steam || !open) return null;

  return (
    <ConfirmModal
      title="Exit the game?"
      confirmLabel="Exit"
      onConfirm={() => quitGame()}
      onClose={() => setOpen(false)}
    >
      <p>World of Mythos will close.</p>
    </ConfirmModal>
  );
}
