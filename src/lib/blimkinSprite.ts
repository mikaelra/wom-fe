// Blimkin, cell for cell as he stands in the statusline (~/.claude/blimkin/
// blimkin.py's body(): eyes open looking right, arms down, standing) --
// "he will look exactly the same" (Mikael, 2026-10-17). Each cell is
// [character, foreground, background]; null is the terminal's default (no
// colour). `breathe` is the same frame with his box mouth open, for
// breathing out the cloud.

export type BlimkinCell = readonly [string, string | null, string | null];
export type BlimkinFrame = readonly (readonly BlimkinCell[])[];

export const BLIMKIN_COLS = 13;
export const BLIMKIN_ROWS = 7;

export const BLIMKIN_IDLE: BlimkinFrame = [
  [[" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], ["\u25e2", "#ffd214", null], ["\u25e3", "#ffd214", null], [" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null]],
  [[" ", null, null], [" ", null, null], [" ", null, null], ["\u2584", "#ffd214", null], ["\u2584", "#ffd214", null], ["\u2584", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2584", "#ffd214", null], ["\u2584", "#ffd214", null], [" ", null, null], [" ", null, null], [" ", null, null]],
  [[" ", null, null], ["\u25c0", "#ffd214", null], ["\u259f", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2599", "#ffd214", null], [" ", null, null], [" ", null, null]],
  [["\u2571", "#ffd214", null], [" ", null, null], ["\u2588", "#ffd214", null], [" ", null, "#0a0a0a"], ["\u25cf", "#e61e28", "#0a0a0a"], [" ", null, "#ffd214"], ["\u2588", "#ffd214", null], [" ", null, "#0a0a0a"], ["\u25cf", "#e61e28", "#0a0a0a"], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], [" ", null, null], ["\u2572", "#ffd214", null]],
  [[" ", null, null], [" ", null, null], ["\u2590", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2584", "#0a0a0a", "#ffd214"], ["\u2584", "#0a0a0a", "#ffd214"], ["\u2584", "#0a0a0a", "#ffd214"], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u258c", "#ffd214", null], ["\u25b8", "#e1a500", null], [" ", null, null]],
  [[" ", null, null], [" ", null, null], [" ", null, null], ["\u259c", "#e1a500", null], ["\u2588", "#e1a500", null], ["\u2588", "#e1a500", null], ["\u2588", "#e1a500", null], ["\u2588", "#e1a500", null], ["\u2588", "#e1a500", null], ["\u259b", "#e1a500", null], [" ", null, null], [" ", null, null], [" ", null, null]],
  [[" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], ["\u2571", "#ffd214", null], [" ", "#ffd214", null], [" ", "#ffd214", null], [" ", "#ffd214", null], ["\u2572", "#ffd214", null], [" ", null, null], [" ", null, null], [" ", null, null]],
];

export const BLIMKIN_BREATHE: BlimkinFrame = [
  [[" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], ["\u25e2", "#ffd214", null], ["\u25e3", "#ffd214", null], [" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null]],
  [[" ", null, null], [" ", null, null], [" ", null, null], ["\u2584", "#ffd214", null], ["\u2584", "#ffd214", null], ["\u2584", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2584", "#ffd214", null], ["\u2584", "#ffd214", null], [" ", null, null], [" ", null, null], [" ", null, null]],
  [[" ", null, null], ["\u25c0", "#ffd214", null], ["\u259f", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2599", "#ffd214", null], [" ", null, null], [" ", null, null]],
  [["\u2571", "#ffd214", null], [" ", null, null], ["\u2588", "#ffd214", null], [" ", null, "#0a0a0a"], ["\u25cf", "#e61e28", "#0a0a0a"], [" ", null, "#ffd214"], ["\u2588", "#ffd214", null], [" ", null, "#0a0a0a"], ["\u25cf", "#e61e28", "#0a0a0a"], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], [" ", null, null], ["\u2572", "#ffd214", null]],
  [[" ", null, null], [" ", null, null], ["\u2590", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], [" ", null, "#0a0a0a"], [" ", null, "#0a0a0a"], [" ", null, "#0a0a0a"], ["\u2588", "#ffd214", null], ["\u2588", "#ffd214", null], ["\u258c", "#ffd214", null], ["\u25b8", "#e1a500", null], [" ", null, null]],
  [[" ", null, null], [" ", null, null], [" ", null, null], ["\u259c", "#e1a500", null], ["\u2588", "#e1a500", null], ["\u2588", "#e1a500", null], ["\u2588", "#e1a500", null], ["\u2588", "#e1a500", null], ["\u2588", "#e1a500", null], ["\u259b", "#e1a500", null], [" ", null, null], [" ", null, null], [" ", null, null]],
  [[" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], [" ", null, null], ["\u2571", "#ffd214", null], [" ", "#ffd214", null], [" ", "#ffd214", null], [" ", "#ffd214", null], ["\u2572", "#ffd214", null], [" ", null, null], [" ", null, null], [" ", null, null]],
];
