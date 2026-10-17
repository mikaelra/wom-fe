'use client';

import { Suspense, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Table from '@/components/Table';
import { skinUrl } from '@/lib/frogSkins';
import { getBossPosition, getBossPlayerPositions, PLAYER_Y, TABLE_POSITION } from '@/lib/sceneConstants';
import { TEMPLE_POSITION, LAND_LEVEL } from '@/lib/cityLayout';
import {
  CITY_TABLEAU_MAX_FIGURES, TABLEAU_ZOOM, LOBBY_FIGURE_SCALE, LOBBY_BOSS_SCALE,
  tableauGroupY,
} from '@/lib/templeTableau';
import type { BossfightRosterPlayer } from '@/lib/api';

const PlayerV1 = dynamic(() => import('@/components/Playerv1'), { ssr: false });

const HADES_URL = '/models/hades/hades_v4.glb';

/**
 * The live bossfight, seen from the street (docs/CITY_SCENE_PLAN.md §5.2).
 *
 * The temple is not scenery: the boss fight that is actually running is
 * staged inside it, with Hades across the Well and every player who has
 * joined standing where they stand in the lobby. Walk up to the city at a
 * quiet hour and the temple is empty; walk up while a fight is filling and
 * you can see who is waiting in there.
 *
 * The arrangement is not re-invented -- it reuses `getBossPosition` and
 * `getBossPlayerPositions`, the very functions LobbyScene seats people with,
 * so the tableau is the same composition rather than a drawing of one. That
 * also means it stays right for free when the lobby's own layout changes.
 *
 * The roster comes from the read-only backend route added for this
 * (`GET /get_bossfight_roster`): the socket only talks to connections that
 * have joined, and joining is the one thing a passer-by must not do.
 */
export default function TempleTableau({
  players,
  active,
}: {
  /** From useBossfightRoster. */
  players: BossfightRosterPlayer[];
  /** Whether there is a bossfight at all. */
  active: boolean;
}) {
  // Bots are filtered out, and that is not hypothetical tidiness: HADES
  // HIMSELF ARRIVES IN THE ROSTER as a player with bot: true (verified
  // against the live route -- create_boss sets bot on every boss, which
  // PlayerAvatars.tsx records having been caught by once already). He is
  // drawn separately below, at the seat getBossPosition gives him, so
  // without this filter he would stand in the temple twice.
  //
  // Capped as well: a bossfight can hold a couple of dozen people, and each
  // figure is its own GLTF clone with its own draw calls. Past a dozen at
  // 45 units they overlap into one crowd anyway, so the rest cost frames
  // and add nothing you can see.
  const shown = useMemo(
    () => players.filter((p) => !p.bot).slice(0, CITY_TABLEAU_MAX_FIGURES),
    [players],
  );
  const seats = useMemo(() => getBossPlayerPositions(Math.max(1, shown.length)), [shown.length]);
  const boss = useMemo(() => getBossPosition(), []);

  if (!active) return null;

  return (
    // The lobby's seat helpers return positions around its own origin with
    // y = PLAYER_Y, so the group is offset to put that plane on the temple's
    // floor and the whole composition drops into place unchanged.
    <group
      position={[TEMPLE_POSITION[0], tableauGroupY(LAND_LEVEL, PLAYER_Y), TEMPLE_POSITION[2]]}
      // Scaling the whole group rather than each figure keeps the lobby's
      // composition exactly -- seat spacing, the Well's size and the boss's
      // distance across it all grow together, so it is the same tableau seen
      // from closer rather than a differently-proportioned one.
      scale={TABLEAU_ZOOM}
    >
      <Suspense fallback={null}>
        <Table position={TABLE_POSITION} scale={1.2} />

        <PlayerV1
          url={HADES_URL}
          scale={LOBBY_BOSS_SCALE}
          position={boss.position}
          rotation={boss.rotation}
        />

        {shown.map((player, i) => (
          <PlayerV1
            key={player.name}
            url={skinUrl(player.skin ?? 'frog_green_v1')}
            scale={LOBBY_FIGURE_SCALE}
            position={seats[i].position}
            rotation={seats[i].rotation}
            // Deliberately not animated. These are 45 units away and a
            // couple of degrees tall; an AnimationMixer each buys nothing
            // the eye can resolve and costs a fight's worth of them.
            isAnimating={false}
            isDead={!player.alive}
          />
        ))}
      </Suspense>
    </group>
  );
}
