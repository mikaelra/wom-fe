'use client';

import SceneTopBar from '@/components/hud/SceneTopBar';

/**
 * DOM chrome over the city scene (docs/CITY_SCENE_PLAN.md §5.1).
 *
 * Deliberately NOT create/join lobby -- those stay on the world map
 * (locked decision 3). Rules, the music toggle and the player's menu come
 * from the shared <SceneTopBar/>, so the chrome is identical to the world
 * map's rather than a second implementation that drifts. What is left here
 * is what only the city has: which sky you are looking at.
 */
export default function CityOverlay({
  /** Athens wall-clock time being viewed, when ?t= overrode the real one.
   *  Null while the sky is live -- there is nothing to say then. */
  skyClock,
}: {
  skyClock?: string | null;
}) {
  return (
    <>
      {/* Exactly the world map's chrome -- Rules, music, and the player's own
          menu -- from one shared component, so the top bar does not shift as
          you walk between scenes (locked decision 4).

          The way back to Earth is NOT here: it is a sign on the signpost,
          under the Bossfight arm, so leaving the city is a thing in the
          world rather than a button floating over it. */}
      <SceneTopBar />

      {/* No city nameplate. The scene says where you are far better than a
          caption does -- the temple, the signpost and the sky over Greece
          are the identity.

          The NOW / 02:00 tuning buttons that used to sit here are gone too,
          along with the +1h/-1h pair before them: they were scaffolding for
          checking the night rendering, and the scene is past needing them
          parked on screen. `?t=` still works (§6.6) -- when it is set, the
          readout below says so, which is the part that is not scaffolding.
          It renders nothing at all on the live sky. */}
      {skyClock && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none">
          <p className="text-xs text-amber-300/90 mt-1 tracking-widest drop-shadow font-mono">
            SKY AT {skyClock} ATHENS
          </p>
        </div>
      )}
    </>
  );
}
