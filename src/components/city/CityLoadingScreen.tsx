'use client';

import { useEffect, useState } from 'react';
import LoadingMark from '@/components/loading/LoadingMark';
import { claimLoadingScreen } from '@/lib/loadingTracker';

/**
 * The curtain between the GREECE sword and standing in Athens.
 *
 * TEMPORARY ART, deliberately: a dark card with the city's own accent, sized
 * to be replaced wholesale when the art pass reaches it. What it must get
 * right is the *timing*, not the look -- there are two separate waits here
 * and neither used to show anything at all:
 *
 *   1. the world map -> the route change and the city chunk downloading,
 *      during which the globe just sat there looking unclicked, and
 *   2. the city page -> temple.glb, the Senate, the mountain and the Milky
 *      Way texture loading behind a `Suspense fallback={null}`, i.e. an
 *      empty dark screen with no sign that anything is coming.
 *
 * Rendering the same component in both places makes those two waits read as
 * one continuous transition rather than as a stall, a flash and a pop.
 *
 * The wait itself shows the game's loading mark (<LoadingMark>), and while
 * the curtain is up it claims the screen so the small corner loading mark
 * doesn't double up on it.
 */

/** Must match the opacity transition below, so the node is removed only
 *  after it has finished fading rather than vanishing mid-fade. */
const FADE_MS = 450;

export default function CityLoadingScreen({
  title,
  accent = '#e8d9a0',
  done = false,
}: {
  title: string;
  accent?: string;
  /** Flip to true when the scene is ready; the curtain fades and unmounts. */
  done?: boolean;
}) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (gone) return;
    return claimLoadingScreen();
  }, [gone]);

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(id);
  }, [done]);

  if (gone) return null;

  return (
    <div
      // The page's own background colour, so the hand-off at the end of the
      // fade is invisible rather than a change of shade.
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#070b15]"
      style={{
        opacity: done ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: done ? 'none' : 'auto',
      }}
    >
      <p className="text-xs font-mono tracking-[0.4em] text-white/40">ENTERING</p>

      <h1
        className="text-5xl font-extrabold tracking-[0.2em] drop-shadow-lg"
        style={{ color: accent }}
      >
        {title}
      </h1>

      <LoadingMark size={96} label={`Entering ${title}`} className="mt-2" />
    </div>
  );
}
