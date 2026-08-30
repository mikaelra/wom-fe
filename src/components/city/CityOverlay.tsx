'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RulesModal from '@/components/lobby/RulesModal';
import { formatAthensParam } from '@/lib/cityTime';
import type { City } from '@/lib/cities';

/**
 * DOM chrome over the city scene (docs/CITY_SCENE_PLAN.md §5.1).
 *
 * Deliberately NOT create/join lobby -- those stay on the world map
 * (locked decision 3). The full profile/user menu still lives inside
 * WorldMapOverlay and is extracted separately; this carries Rules and the
 * way back for now.
 */
export default function CityOverlay({
  city,
  /** Athens wall-clock time being viewed, when ?t= overrode the real one.
   *  Null while the sky is live -- there is nothing to say then. */
  skyClock,
  /** The instant currently on screen, for the time controls to step from. */
  skyDate,
}: {
  city: City;
  skyClock?: string | null;
  skyDate: Date;
}) {
  const router = useRouter();
  const [showRules, setShowRules] = useState(false);

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
  // Stepping carries the DATE as well as the clock, so crossing midnight
  // moves to the next day instead of snapping back to this morning.
  const step = (hours: number) =>
    gotoTime(formatAthensParam(new Date(skyDate.getTime() + hours * 3600_000)));

  return (
    <>
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 items-start">
        {/* The globe, not the house every other page used: the way out of
            the city is literally back to the Earth you came from, and the
            same icon now means "home" everywhere in the app. Icon-only, so
            it carries its own label for screen readers. */}
        <button
          type="button"
          onClick={() => router.push('/')}
          aria-label="Back to Earth"
          title="Back to Earth"
          className="flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/20 text-white w-11 h-11 rounded-lg text-2xl leading-none cursor-pointer hover:bg-black/80 transition-colors"
        >
          🌍
        </button>
        <button
          type="button"
          onClick={() => setShowRules(true)}
          className="bg-black/60 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:bg-black/80 transition-colors"
        >
          Rules
        </button>
      </div>

      {/* City identity. The globe marker is labelled by country (GREECE from
          step 6); the scene is the city itself. */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none">
        <h1 className="text-3xl font-extrabold tracking-wide drop-shadow-lg" style={{ color: city.color }}>
          {city.name}
        </h1>
        <p className="text-sm text-white/70 mt-1 drop-shadow">
          {city.tag} &mdash; {city.country}
        </p>
        {skyClock && (
          <p className="text-xs text-amber-300/90 mt-1 tracking-widest drop-shadow font-mono">
            SKY AT {skyClock} ATHENS
          </p>
        )}

        {/* pointer-events re-enabled here only: the heading above it stays
            click-through so it never eats a drag meant for the camera. */}
        <div className="mt-2 flex items-center justify-center gap-1 pointer-events-auto">
          <TimeButton onClick={() => step(-1)} label="−1h" />
          <TimeButton onClick={() => gotoTime(null)} label="NOW" />
          <TimeButton onClick={() => step(1)} label="+1h" />
          {/* The bare HH:MM form, which resolveCityTime reads as 2am Athens
              today -- the quickest way to a full-night sky. */}
          <TimeButton onClick={() => gotoTime('02:00')} label="☾ 02:00" />
        </div>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
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
