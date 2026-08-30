import type { BossfightRoster } from '@/lib/api';

/**
 * The line under the signpost's Bossfight arm.
 *
 * It used to be the countdown alone, which meant that the moment the clock
 * hit zero the arm read IN PROGRESS whether or not a single soul had walked
 * into the temple -- a sign advertising a fight that was not happening. The
 * live roster is right there (the city already polls it to populate the
 * temple), so the arm now reports what is actually in the building and only
 * falls back to the clock when there is nobody to report.
 *
 * Precedence is deliberate: people beat the clock. "3 PLAYERS WAITING" tells
 * a passer-by something the countdown cannot -- that it is worth walking
 * over -- and once anyone is in there the countdown is the less interesting
 * of the two facts.
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

  if (fighters > 0) {
    const noun = fighters === 1 ? 'PLAYER' : 'PLAYERS';
    // `round` is 0 for a lobby still filling and 1+ once the first round has
    // been dealt, which is exactly the waiting/playing line.
    return roster.round > 0
      ? `${fighters} ${noun} PLAYING`
      : `${fighters} ${noun} WAITING`;
  }

  // Empty temple. The countdown is all that is left to say, and once even
  // that has run out the arm says nothing at all rather than claiming a
  // fight is under way.
  if (countdownMins == null || countdownSecs == null) return null;
  if (countdownMins <= 0 && countdownSecs <= 0) return null;
  return `BOSSFIGHT IN ${countdownMins}:${String(countdownSecs).padStart(2, '0')}`;
}
