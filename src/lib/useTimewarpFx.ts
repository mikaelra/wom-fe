'use client';

import { useEffect, useState } from 'react';
import { getSky, setSkyFxOverride } from '@/lib/astrology';
import { skyDrift } from '@/lib/skyDrift';
import {
  MAX_SKY_BOOST, applyMarkerLabelFade, scrubDate, timewarpFrame, timewarpFxState, type TimewarpSpec,
} from '@/lib/timewarpFx';

/** How often the sky's instant is advanced while it runs through time.
 *  Each step recomputes every planet (and re-renders the sky), so this is
 *  the rate that stays smooth to the eye without being every frame. */
export const SCRUB_STEP_MS = 66;

export interface TimewarpRun {
  spec: TimewarpSpec;
  /** Where the sky runs from. A real timewarp starts from the sky as it
   *  stands; a preview from the real now, so every replay travels. */
  from: 'sky' | 'now';
  /** Stay at `to` when done (a preview, to look at where it ended) rather
   *  than handing the sky back to the merchant poll's instant. */
  hold: boolean;
}

/**
 * Plays the timewarp animation for `run`, from the start each time `runId`
 * changes. Returns `step`, which moves every time the sky's instant does --
 * WorldMap is keyed on it so the planets are redrawn where they now are.
 */
export function useTimewarpFx(run: TimewarpRun | null, runId: number): { playing: boolean; step: number } {
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!run) return;
    const from = run.from === 'now' ? new Date() : getSky().date;
    const start = performance.now();
    let lastScrub = -Infinity;
    let raf = 0;
    let finished = false;
    timewarpFxState.colors = run.spec.colors;
    setPlaying(true);

    const settle = () => {
      skyDrift.boost = 0;
      timewarpFxState.glow = 0;
      timewarpFxState.spin = 0;
      timewarpFxState.markers = 1;
      applyMarkerLabelFade(1);
    };

    const tick = (now: number) => {
      const frame = timewarpFrame(now - start);
      skyDrift.boost = frame.spin * MAX_SKY_BOOST;
      timewarpFxState.glow = frame.glow;
      timewarpFxState.spin = frame.spin;
      timewarpFxState.markers = frame.markers;
      applyMarkerLabelFade(frame.markers);
      if (now - lastScrub >= SCRUB_STEP_MS || frame.done) {
        lastScrub = now;
        setSkyFxOverride(scrubDate(from, run.spec.to, frame.scrub));
        setStep((s) => s + 1);
      }
      if (frame.done) {
        finished = true;
        settle();
        if (!run.hold) setSkyFxOverride(null);
        setStep((s) => s + 1);
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      settle();
      // Leaving mid-run, or replaying: let go of the sky either way.
      if (!finished || run.hold) setSkyFxOverride(null);
    };
  }, [run, runId]);

  return { playing, step };
}
