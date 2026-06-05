// Shared types + helper for the welcome-tour button glows. Kept in a tiny lib
// (rather than in the R3F InGameGuide component) so the DOM overlay can import
// it without pulling in three.js.

// Buttons the guide can highlight on a given slide. Each maps to a real in-game
// button (attack/defend/well live in the 3D scene; hp/coins/atk in the overlay).
export type GuideTarget = 'attack' | 'defend' | 'well' | 'hp' | 'coins' | 'atk';

// Glow colour for a highlighted button.
export type GuideGlow = 'blue' | 'gold';

export type GuideHighlights = Partial<Record<GuideTarget, GuideGlow>>;

// Map a glow colour to its CSS class (see globals.css).
export const guideGlowClass = (g?: GuideGlow) =>
  g === 'blue' ? 'guide-glow-blue' : g === 'gold' ? 'guide-glow-gold' : '';
