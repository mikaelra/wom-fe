'use client';

import { useEffect, useRef, useState } from 'react';
import type { LobbyState } from '@/types/game';
import RelicCooldownOverlay from '@/components/RelicCooldownOverlay';

const GRACE_MS = 5_000;

const fingerprint = (state: LobbyState) =>
  state.players.map((p) => `${p.name}:${(p.selected_relic_ids ?? []).join(',')}`).join('|');

type StartGameButtonProps = {
  state: LobbyState;
  btn: string;
  onStartGame: () => void;
};

// Mirrors the backend's own 5s grace window (sockets/lobby.py's
// handle_start_game): if it can start, clicking Start Game just works and
// the backend is the real gate anyway. This is client-only best-effort UX
// -- it can only react to a change this client has actually observed
// since mounting, so a fresh page load right after someone else's change
// won't show the overlay even though the backend would still (correctly)
// reject an immediate start attempt.
//
// Triggered by any change to the roster fingerprint above -- not just a
// relic selection, but also a join or a kick, since `fingerprint` maps
// over the full player list (a different set of players is a different
// string) even though it was written to track selected_relic_ids. Gives
// everyone a moment to notice who just showed up or left, same spirit as
// the relic-selection grace window.
export default function StartGameButton({ state, btn, onStartGame }: StartGameButtonProps) {
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const prevFingerprint = useRef<string | null>(null);
  const current = fingerprint(state);

  useEffect(() => {
    if (prevFingerprint.current !== null && prevFingerprint.current !== current) {
      setBlockedUntil(Date.now() + GRACE_MS);
      setTimeout(() => setBlockedUntil(null), GRACE_MS);
    }
    prevFingerprint.current = current;
  }, [current]);

  const blocked = blockedUntil !== null && blockedUntil > Date.now();

  return (
    <button
      type="button"
      onClick={onStartGame}
      disabled={blocked}
      title={blocked ? 'Wait a moment — the lobby just changed.' : undefined}
      className={`relative overflow-hidden ${btn} bg-amber-600 text-white border-amber-700 ${
        blocked ? 'opacity-70 cursor-not-allowed' : ''
      }`}
    >
      Start Game
      {blocked && <RelicCooldownOverlay untilMs={blockedUntil!} totalMs={GRACE_MS} rounded="rounded-lg" />}
    </button>
  );
}
