// The city's RANKED sign stands for both ladders (players and bots), each of
// which has its own arm at the fork. While either has a match of yours on --
// waiting to start, or started -- the top sign says what its arm says,
// RETURN TO MATCH, with that match's STARTS IN Xs, and takes you straight
// back to it (Mikael, 2026-10-14). Otherwise it is RANKED and opens the fork.

export const RETURN_TO_MATCH = 'RETURN TO MATCH';

export interface RankedArm {
  label: string;
  sublabel: string | null | undefined;
  enter: () => void;
}

export interface RankedTopSign {
  label: string;
  /** The lines under it, the players' arm's first. */
  sublabels: string[];
  onActivate: () => void;
}

export function rankedTopSign(players: RankedArm, bots: RankedArm, openFork: () => void): RankedTopSign {
  const lines = (...s: (string | null | undefined)[]) => s.filter((x): x is string => !!x);
  const active = [players, bots].find((arm) => arm.label === RETURN_TO_MATCH);
  if (active) return { label: RETURN_TO_MATCH, sublabels: lines(active.sublabel), onActivate: active.enter };
  return { label: 'RANKED', sublabels: lines(players.sublabel, bots.sublabel), onActivate: openFork };
}
