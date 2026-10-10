// Each planet's (and the Moon's) own colour, as the globe draws it with no
// aspect or retrograde in play (lib/astrology.ts). Kept apart so the text
// Earth page's pixel sky (lib/pixelOrrery.ts) can share it without loading
// three.js.

export const BODY_COLOR = {
  Moon: 0xcfe3ff,
  Mercury: 0xdb9504,
  Venus: 0xab9d00,
  Mars: 0xff0000,
  Jupiter: 0x008296,
  Saturn: 0xa16300,
} as const;
