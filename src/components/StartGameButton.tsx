'use client';

import { useEffect, useRef, useState } from 'react';
import type { LobbyState } from '@/types/game';
import RelicCooldownOverlay from '@/components/RelicCooldownOverlay';
import RopedButton from '@/components/hud/RopedButton';

const GRACE_MS = 5_000;

// Bots are excluded: the admin adds them deliberately, in the same action
// they're about to click Start Game from, and no other real player's
// awareness is at stake the way it is for a human join/kick or a relic
// pick -- blocking the button right after "Add Bot" would just be in the
// admin's own way for no benefit.
const fingerprint = (state: LobbyState) =>
  state.players
    .filter((p) => !p.bot)
    .map((p) => `${p.name}:${(p.selected_relic_ids ?? []).join(',')}`)
    .join('|');

type StartGameButtonProps = {
  state: LobbyState;
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
// relic selection, but also a real player joining or being kicked, since
// `fingerprint` maps over the (non-bot) player list and a different set
// of players is a different string. Gives everyone a moment to notice who
// just showed up or left, same spirit as the relic-selection grace
// window. Bots don't count (see fingerprint's own comment).
export default function StartGameButton({ state, onStartGame }: StartGameButtonProps) {
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
    <RopedButton
      onClick={onStartGame}
      disabled={blocked}
      title={blocked ? 'Wait a moment — the lobby just changed.' : undefined}
      width={180}
      height={54}
      fillColor="#d97706"
      overlay={blocked && <RelicCooldownOverlay untilMs={blockedUntil!} totalMs={GRACE_MS} />}
    >
      Start Game
    </RopedButton>
  );
}
