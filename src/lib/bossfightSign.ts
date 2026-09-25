import type { BossfightRoster } from '@/lib/api';

/**
 * The line(s) under the signpost's Bossfight arm, `\n`-joined when there are
 * two (Signpost.tsx's Arm renders each line of a sublabel in its own div).
 *
 * It used to be the countdown alone, which meant that the moment the clock
 * hit zero the arm read IN PROGRESS whether or not a single soul had walked
 * into the temple -- a sign advertising a fight that was not happening. The
 * live roster is right there (the city already polls it to populate the
 * temple), so the arm now reports what is actually in the building and only
 * falls back to the clock when there is nobody to report.
 *
 * While people are WAITING the headcount and the countdown say two different
 * true things -- "worth walking over" and "here's how long you have to join
 * this lobby" -- so both show, headcount first (bug list 260916: the
 * countdown used to be dropped entirely the moment anyone showed up). Once
 * the fight is PLAYING the countdown is dropped: `secondsUntil` counts down
 * to *this* lobby's start, which has already happened.
 *
 * Bots are excluded because HADES IS ONE (create_boss sets bot on every
 * boss, and he arrives in the roster like any other occupant), so counting
 * them would have an empty temple advertise one player. Spectators are
 * excluded because they are not who the sign is about: "waiting" and
 * "playing" are both claims about fighting, and a watcher does neither.
 * Note this makes the count deliberately smaller than the number of figures
 * TempleTableau draws, which does include watchers.
 */
export function bossfightSignSublabel(
  roster: BossfightRoster,
  countdownMins: number | null,
  countdownSecs: number | null,
): string | null {
  const fighters = roster.players.filter((p) => !p.bot && !p.spectator).length;
  const countdownLine = formatCountdownLine(countdownMins, countdownSecs);

  if (fighters > 0) {
    const noun = fighters === 1 ? 'PLAYER' : 'PLAYERS';
    // `round` is 0 for a lobby still filling and 1+ once the first round has
    // been dealt, which is exactly the waiting/playing line.
    if (roster.round > 0) return `${fighters} ${noun} PLAYING`;
    const headcountLine = `${fighters} ${noun} WAITING`;
    return countdownLine ? `${headcountLine}\n${countdownLine}` : headcountLine;
  }

  // Empty temple. The countdown is all that is left to say, and once even
  // that has run out the arm says nothing at all rather than claiming a
  // fight is under way.
  return countdownLine;
}

function formatCountdownLine(mins: number | null, secs: number | null): string | null {
  if (mins == null || secs == null) return null;
  if (mins <= 0 && secs <= 0) return null;
  return `BOSSFIGHT IN ${mins}:${String(secs).padStart(2, '0')}`;
}
