/**
 * The backend's round messages still say "🎡 You won a Wheel! 🎡" in plain
 * text (engine/combat.py). The game draws the wheel's icon (WheelIcon) in
 * place of that emoji, so a message is split into its text and the places
 * the wheel goes.
 */

export const WHEEL_EMOJI = '\u{1F3A1}';

/** A message as text pieces, with `null` wherever a 🎡 stood. Text without
 *  the emoji comes back as itself, alone. */
export function splitWheelEmoji(text: string): (string | null)[] {
  if (!text.includes(WHEEL_EMOJI)) return [text];
  const out: (string | null)[] = [];
  text.split(WHEEL_EMOJI).forEach((piece, i) => {
    if (i > 0) out.push(null);
    if (piece) out.push(piece);
  });
  return out;
}
