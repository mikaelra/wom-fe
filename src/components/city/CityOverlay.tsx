'use client';

import { useRouter } from 'next/navigation';
import SceneTopBar from '@/components/hud/SceneTopBar';
import type { City } from '@/lib/cities';

/**
 * DOM chrome over the city scene (docs/CITY_SCENE_PLAN.md §5.1).
 *
 * Deliberately NOT create/join lobby -- those stay on the world map
 * (locked decision 3). Rules, the music toggle and the player's menu come
 * from the shared <SceneTopBar/>, so the chrome is identical to the world
 * map's rather than a second implementation that drifts. What is left here
 * is what only the city has: which city you are in, and which sky you are
 * looking at.
 */
export default function CityOverlay({
  city,
  /** Athens wall-clock time being viewed, when ?t= overrode the real one.
   *  Null while the sky is live -- there is nothing to say then. */
  skyClock,
}: {
  city: City;
  skyClock?: string | null;
}) {
  const router = useRouter();

  // TEMPORARY tuning control, like CitySky's red ecliptic band.
  //
  // The city sky is the REAL sky over Greece (locked decision 5), so in an
  // Athens afternoon it is correctly, stubbornly daylight -- and checking
  // the night rendering meant hand-typing `&t=02:00` onto the URL, which on
  // a phone is miserable and easy to lose (the bare host is the world map,
  // which has no ?t= at all). These make night one tap away without
  // changing what the scene shows by default.
  // A null `t` drops the parameter entirely and returns the sky to live.
  const gotoTime = (t: string | null) => {
    const base = `/city?id=${city.id}`;
    router.push(t ? `${base}&t=${t}` : base);
  };

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
          are the identity -- and the heading sat between the shared top
          bar's two chips, which is the worst place on a phone for text
          nobody needs to read twice.

          What stays is the sky's own clock and the time controls: those are
          not decoration, they are how the night rendering gets checked
          without hand-typing ?t= onto the URL (§6.6). */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none">
        {skyClock && (
          <p className="text-xs text-amber-300/90 mt-1 tracking-widest drop-shadow font-mono">
            SKY AT {skyClock} ATHENS
          </p>
        )}

        {/* pointer-events re-enabled here only: the clock above stays
            click-through so it never eats a drag meant for the camera. */}
        <div className="mt-2 flex items-center justify-center gap-1 pointer-events-auto">
          <TimeButton onClick={() => gotoTime(null)} label="NOW" />
          {/* The bare HH:MM form, which resolveCityTime reads as 2am Athens
              today -- the quickest way to a full-night sky. */}
          <TimeButton onClick={() => gotoTime('02:00')} label="☾ 02:00" />
        </div>
      </div>

    </>
  );
}

function TimeButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-black/60 backdrop-blur-sm border border-white/20 text-white/90 px-2 py-1 rounded text-xs font-mono tracking-wider cursor-pointer hover:bg-black/80 transition-colors"
    >
      {label}
    </button>
  );
}
